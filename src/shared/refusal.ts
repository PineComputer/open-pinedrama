// The drama-cli refusals a stop asks the maker about, as the stop returns them (goals.ts
// RETURN_REFUSALS): one JSON line each, `{"error": {code, message, param, action}}`, as drama-cli
// prints a command's failure (short_drama doc/drama-cli/design.md, section 3.1; drama_cli/
// errors.py describe, v0.7.4). A file that doesn't read this way is refused, naming the line and
// the field.

/** drama-cli's actions for the caller (drama_cli/errors.py ACTIONS); null for a refusal with no code yet. */
export const ACTIONS = ["ask_person", "fix_input", "retry", "reconcile"] as const;

export interface Refusal {
  code: string;
  message: string;
  /** The argument or config key at fault, such as defaults.max_new_versions; null when none is. */
  param: string | null;
  action: (typeof ACTIONS)[number] | null;
}

/**
 * Which kind of stop a refusal makes, by its code's family (the part before the first dot):
 * - RedLine: a red line, or a character below the preset's age floor, which the maker decides.
 * - SetLimitExceeded: a cap the config sets, `key` being its param, the config key the maker
 *   would raise; one without a param names no key, and is read as a question.
 * - Anything else, a bare `Refused` included (a command not yet given codes, such as the take
 *   cap, short_drama #664, or an upload the environment blocks, #666): a question whose message
 *   the maker reads.
 * A budget is never a refusal here: the goals set drama-cli's budget to none (goals.ts NO_CAP).
 */
export type StopKind = { kind: "red-line" } | { kind: "cap"; key: string } | { kind: "ask" };

export class RefusalError extends Error {
  constructor(line: number, field: string, expected: string) {
    super(`The refusals, line ${line}: ${field} should be ${expected}.`);
  }
}

function nullable(value: unknown, line: number, field: string): string | null {
  if (value !== null && typeof value !== "string") throw new RefusalError(line, field, "text or null");
  return value;
}

function refusal(text: string, line: number): Refusal {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RefusalError(line, "the line", "one JSON object");
  }
  const outer = value as { error?: unknown } | null;
  if (typeof outer !== "object" || outer === null || Array.isArray(outer)) throw new RefusalError(line, "the line", "a JSON object");
  const error = outer.error as Record<string, unknown> | undefined;
  if (typeof error !== "object" || error === null || Array.isArray(error)) throw new RefusalError(line, "error", "an object");
  if (typeof error.code !== "string" || !error.code) throw new RefusalError(line, "error.code", "a code");
  if (typeof error.message !== "string") throw new RefusalError(line, "error.message", "text");
  const action = nullable(error.action, line, "error.action");
  if (action !== null && !(ACTIONS as readonly string[]).includes(action)) throw new RefusalError(line, "error.action", `one of ${ACTIONS.join(", ")} or null`);
  return { code: error.code, message: error.message, param: nullable(error.param, line, "error.param"), action: action as Refusal["action"] };
}

/** Each line's refusal; a final newline ends the last line (JSON Lines, jsonlines.org). */
export function parseRefusals(text: string): Refusal[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (!lines.length) throw new RefusalError(1, "the file", "at least one refusal");
  return lines.map((line, n) => refusal(line, n + 1));
}

export function stopKind(refusal: Refusal): StopKind {
  const family = refusal.code.split(".", 1)[0];
  if (family === "RedLine") return { kind: "red-line" };
  if (family === "SetLimitExceeded" && refusal.param) return { kind: "cap", key: refusal.param };
  return { kind: "ask" };
}
