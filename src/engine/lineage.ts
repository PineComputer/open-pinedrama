// drama-cli's lineage of the project, as each stop returns it (goals.ts RETURN_LINEAGE), kept
// per turn as the status reports are (status.ts): a session's lineage is its newest turn's
// export that reads, ordered as Pine started the turns. An export that doesn't read is kept
// with what was wrong, and the one before it stays current.
import { mergeLineage, parseLineage, type Lineage, type LineageView } from "../shared/lineage.ts";
import { all, get, now, run } from "./db.ts";
import { publish } from "./live.ts";
import { episodeCode, type SessionRow } from "./records.ts";

export function recordLineage(sessionId: string, turnId: string, bytes: Uint8Array): void {
  const body = new TextDecoder().decode(bytes);
  let error: string | null = null;
  try {
    parseLineage(JSON.parse(body));
  } catch (reason) {
    error = reason instanceof SyntaxError ? `drama-cli's lineage is not JSON: ${reason.message}` : (reason as Error).message;
    console.warn(`Turn ${turnId}: ${error}`);
  }
  run(
    "insert into lineages (turn_id, session_id, export, error, saved_at) values (?, ?, ?, ?, ?) on conflict(turn_id) do nothing",
    turnId,
    sessionId,
    error ? null : body,
    error,
    now(),
  );
  const drama = get<{ drama_id: string }>("select drama_id from sessions where id = ?", sessionId);
  if (drama) publish(`project:${drama.drama_id}`);
}

const NEWEST_FIRST = "join turns on turns.id = lineages.turn_id where lineages.session_id = ? order by turns.created_at desc, turns.rowid desc";

/** The session's newest export that reads, with when Pine started its turn; undefined before any. */
function sessionLineage(sessionId: string): { turnId: string; turnAt: string; lineage: Lineage } | undefined {
  const row = get<{ turn_id: string; created_at: string; export: string }>(
    `select lineages.turn_id, turns.created_at, lineages.export from lineages ${NEWEST_FIRST.replace("where", "where lineages.export is not null and")} limit 1`,
    sessionId,
  );
  return row && { turnId: row.turn_id, turnAt: row.created_at, lineage: parseLineage(JSON.parse(row.export)) };
}

/** The session's exports that didn't read, newer than its current one, newest first. */
function lineageProblems(sessionId: string): { turnId: string; error: string }[] {
  const current = sessionLineage(sessionId)?.turnId;
  const rows = all<{ turn_id: string; error: string | null }>(`select lineages.turn_id, lineages.error from lineages ${NEWEST_FIRST}`, sessionId);
  const newer = current === undefined ? rows : rows.slice(0, rows.findIndex((row) => row.turn_id === current));
  return newer.flatMap((row) => (row.error ? [{ turnId: row.turn_id, error: row.error }] : []));
}

/**
 * The drama's lineage from every session's newest export, merged as projectView merges the
 * status reports (mergeLineage): the shared stages from the setup's newest export (from the
 * newest of any session when the setup returned none), each episode from its own sessions'.
 */
export function lineageView(dramaId: string): LineageView {
  const sessions = all<SessionRow>("select * from sessions where drama_id = ? order by created_at, rowid", dramaId);
  const problems = sessions.flatMap((session) => lineageProblems(session.id).map((problem) => ({ sessionId: session.id, ...problem })));
  const reported = sessions.flatMap((session) => {
    const current = sessionLineage(session.id);
    if (!current) return [];
    const episode = session.episode_id ? get<{ number: number }>("select number from episodes where id = ?", session.episode_id) : undefined;
    return [{ session, code: episode ? episodeCode(episode) : null, ...current }];
  });
  if (!reported.length) return { lineage: null, problems };
  const newest = (list: typeof reported) => list.reduce((a, b) => (b.turnAt > a.turnAt ? b : a));
  const setups = reported.filter((entry) => entry.session.role === "setup");
  const base = newest(setups.length ? setups : reported);
  const codes = [...new Set(reported.flatMap((entry) => (entry.code ? [entry.code] : [])))];
  const episodes = Object.fromEntries(codes.map((code) => [code, newest(reported.filter((entry) => entry.code === code)).lineage]));
  return { lineage: mergeLineage(base.lineage, episodes), problems };
}
