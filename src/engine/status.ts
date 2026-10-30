// drama-cli's status report, as each stop returns it (goals.ts RETURN_STATUS), kept per turn.
// A session's project stands where its newest turn's report says. Turns are ordered as Pine
// started them, not as their files were saved: a turn saved again after a failed fetch, or
// settled late, never takes the place of a newer one. A report that doesn't read is kept with
// what was wrong, and the one before it stays current.
import { parseStatus, type EpisodeStatus, type ProjectState, type ProjectView } from "../shared/project.ts";
import { all, get, now, run } from "./db.ts";
import { publish } from "./live.ts";
import { episodeCode, type SessionRow } from "./records.ts";

export interface SessionStatus {
  turnId: string;
  /** When Pine started the turn, which orders reports across sessions. */
  turnAt: string;
  state: ProjectState;
}

export function recordStatus(sessionId: string, turnId: string, bytes: Uint8Array): void {
  const body = new TextDecoder().decode(bytes);
  let error: string | null = null;
  try {
    parseStatus(JSON.parse(body));
  } catch (reason) {
    error = reason instanceof SyntaxError ? `drama-cli's status report is not JSON: ${reason.message}` : (reason as Error).message;
    console.warn(`Turn ${turnId}: ${error}`);
  }
  run(
    "insert into statuses (turn_id, session_id, report, error, saved_at) values (?, ?, ?, ?, ?) on conflict(turn_id) do nothing",
    turnId,
    sessionId,
    error ? null : body,
    error,
    now(),
  );
  const drama = get<{ drama_id: string }>("select drama_id from sessions where id = ?", sessionId);
  if (drama) publish(`project:${drama.drama_id}`);
}

const NEWEST_FIRST = "join turns on turns.id = statuses.turn_id where statuses.session_id = ? order by turns.created_at desc, turns.rowid desc";

/** Where the session's project stands: its newest report that reads; undefined before any. */
export function sessionStatus(sessionId: string): SessionStatus | undefined {
  const row = get<{ turn_id: string; created_at: string; report: string }>(
    `select statuses.turn_id, turns.created_at, statuses.report from statuses ${NEWEST_FIRST.replace("where", "where statuses.report is not null and")} limit 1`,
    sessionId,
  );
  return row && { turnId: row.turn_id, turnAt: row.created_at, state: parseStatus(JSON.parse(row.report)) };
}

/** The reports of the session that didn't read, newer than its current one, newest first. */
export function statusProblems(sessionId: string): { turnId: string; error: string }[] {
  const current = sessionStatus(sessionId)?.turnId;
  const rows = all<{ turn_id: string; error: string | null }>(`select statuses.turn_id, statuses.error from statuses ${NEWEST_FIRST}`, sessionId);
  const newer = current === undefined ? rows : rows.slice(0, rows.findIndex((row) => row.turn_id === current));
  return newer.flatMap((row) => (row.error ? [{ turnId: row.turn_id, error: row.error }] : []));
}

/**
 * The drama's project from every session's newest report. Episodes are made in parallel, each
 * on a copy of the project the setup handed over, so each session's report is current only for
 * what that session works on: the bible and the shared references come from the setup's newest
 * report (from the newest of any session when the setup returned none), and each episode from
 * the newest report of its own sessions, the setup's until one reports.
 */
export function projectView(dramaId: string): ProjectView {
  const sessions = all<SessionRow>("select * from sessions where drama_id = ? order by created_at, rowid", dramaId);
  const reported = sessions.flatMap((session) => {
    const current = sessionStatus(session.id);
    if (!current) return [];
    const episode = session.episode_id ? get<{ number: number }>("select number from episodes where id = ?", session.episode_id) : undefined;
    return [{ session, code: episode ? episodeCode(episode) : null, ...current }];
  });
  const problems = sessions.flatMap((session) => statusProblems(session.id).map((problem) => ({ sessionId: session.id, ...problem })));
  const views = reported.map(({ session, code, turnId, state }) => ({ sessionId: session.id, role: session.role, episode: code, turnId, budget: state.budget }));
  if (!reported.length) return { state: null, sessions: views, problems };
  const newest = (list: typeof reported) => list.reduce((a, b) => (b.turnAt > a.turnAt ? b : a));
  const setups = reported.filter((entry) => entry.session.role === "setup");
  const base = newest(setups.length ? setups : reported);
  const episodes: Record<string, EpisodeStatus> = { ...base.state.episodes };
  for (const code of new Set(reported.flatMap((entry) => (entry.code ? [entry.code] : [])))) {
    const own = newest(reported.filter((entry) => entry.code === code));
    if (own.state.episodes[code]) episodes[code] = own.state.episodes[code];
  }
  const { budget: _budget, ...shared } = base.state;
  return { state: { ...shared, episodes }, sessions: views, problems };
}
