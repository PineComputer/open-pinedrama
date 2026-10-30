// drama-cli's status report, as each stop returns it (goals.ts RETURN_STATUS), kept per turn.
// A session's project stands where its newest turn's report says. Turns are ordered as Pine
// started them, not as their files were saved: a turn saved again after a failed fetch, or
// settled late, never takes the place of a newer one. A report that doesn't read is kept with
// what was wrong, and the one before it stays current.
import { parseStatus, type ProjectState } from "../shared/project.ts";
import { all, get, now, run } from "./db.ts";

export interface SessionStatus {
  turnId: string;
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
}

const NEWEST_FIRST = "join turns on turns.id = statuses.turn_id where statuses.session_id = ? order by turns.created_at desc, turns.rowid desc";

/** Where the session's project stands: its newest report that reads; undefined before any. */
export function sessionStatus(sessionId: string): SessionStatus | undefined {
  const row = get<{ turn_id: string; report: string }>(`select statuses.turn_id, statuses.report from statuses ${NEWEST_FIRST.replace("where", "where statuses.report is not null and")} limit 1`, sessionId);
  return row && { turnId: row.turn_id, state: parseStatus(JSON.parse(row.report)) };
}

/** The reports of the session that didn't read, newer than its current one, newest first. */
export function statusProblems(sessionId: string): { turnId: string; error: string }[] {
  const current = sessionStatus(sessionId)?.turnId;
  const rows = all<{ turn_id: string; error: string | null }>(`select statuses.turn_id, statuses.error from statuses ${NEWEST_FIRST}`, sessionId);
  const newer = current === undefined ? rows : rows.slice(0, rows.findIndex((row) => row.turn_id === current));
  return newer.flatMap((row) => (row.error ? [{ turnId: row.turn_id, error: row.error }] : []));
}
