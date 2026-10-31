// The drama-cli refusals a stop asks the maker about (goals.ts RETURN_REFUSALS), kept per turn:
// the stop's card reads which kind of stop it is from them. A file that doesn't read is kept
// with what was wrong, and the stop shows that instead.
import { parseRefusals, type Refusal } from "../shared/refusal.ts";
import { get, now, run } from "./db.ts";
import { turnProject } from "./status.ts";

export function recordRefusals(sessionId: string, turnId: string, bytes: Uint8Array): void {
  const body = new TextDecoder().decode(bytes);
  let error: string | null = null;
  try {
    parseRefusals(body);
  } catch (reason) {
    error = (reason as Error).message;
    console.warn(`Turn ${turnId}: ${error}`);
  }
  run(
    "insert into refusals (turn_id, session_id, lines, error, saved_at) values (?, ?, ?, ?, ?) on conflict(turn_id) do nothing",
    turnId,
    sessionId,
    error ? null : body,
    error,
    now(),
  );
}

/**
 * The refusals the turn's stop asked about: none when it returned none, or why its file didn't read; with the project's
 * folder their paths start with, from the same turn's status report, when it returned one.
 */
export function turnRefusals(turnId: string): { refusals: Refusal[]; refusalsError?: string; project?: string } {
  const row = get<{ lines: string | null; error: string | null }>("select lines, error from refusals where turn_id = ?", turnId);
  if (!row) return { refusals: [] };
  const project = turnProject(turnId);
  const where = project === undefined ? {} : { project };
  return row.error ? { refusals: [], refusalsError: row.error, ...where } : { refusals: parseRefusals(row.lines!), ...where };
}
