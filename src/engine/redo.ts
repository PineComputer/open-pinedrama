// A redo the maker asks of a session (the Out of date page, IA §16, D21): one steering note to the session that owns the
// items, through the chat every session takes, sent once per submission (Codex's rebuttal, IA §14.6). The same id sent
// again returns what became of it and never sends twice, except after the engine refused it: then it never reached the
// session and may go again. An error that leaves the outcome unknown keeps it "sending", for the maker to check.
import type { SubmissionView } from "../shared/types.ts";
import { chat } from "./dramas.ts";
import { get, now, run } from "./db.ts";
import { StudioError } from "./errors.ts";

interface Row {
  id: string;
  session_id: string;
  state: SubmissionView["state"];
  message: string | null;
}

/**
 * One submission, a redo or a review's decision (Codex's IA round 3, Interrupt): what the engine knows became of it, so
 * a studio that lost the answer (closed, offline) finds it again and never sends it twice. A review keeps its decision's
 * submission while it is being sent and once it was (reviews.ts, decide), and drops it when the send did not reach the
 * session: then nothing was taken, and there is no such submission.
 */
export function submission(id: string): SubmissionView | undefined {
  const row = get<Row>("select id, session_id, state, message from submissions where id = ?", id);
  if (row) return { id: row.id, sessionId: row.session_id, state: row.state, ...(row.message ? { message: row.message } : {}) };
  const decided = get<{ session_id: string; state: string }>("select session_id, state from reviews where submission_id = ?", id);
  return decided && { id, sessionId: decided.session_id, state: decided.state === "sending" ? "sending" : "sent" };
}

export async function redo(sessionId: string, submissionId: string, text: string): Promise<SubmissionView> {
  if (!submissionId) throw new StudioError("submission-missing", "A redo needs its submissionId.");
  const known = submission(submissionId);
  if (known && known.sessionId !== sessionId) throw new StudioError("submission-elsewhere", "This submission went to another session.", 409);
  if (known && known.state !== "refused") return known;
  const at = now();
  if (known) run("update submissions set state = 'sending', text = ?, message = null, updated_at = ? where id = ?", text, at, submissionId);
  else run("insert into submissions (id, session_id, text, state, created_at, updated_at) values (?, ?, ?, 'sending', ?, ?)", submissionId, sessionId, text, at, at);
  try {
    await chat(sessionId, text);
  } catch (error) {
    if (error instanceof StudioError) run("update submissions set state = 'refused', message = ?, updated_at = ? where id = ?", error.message, now(), submissionId);
    throw error;
  }
  run("update submissions set state = 'sent', updated_at = ? where id = ?", now(), submissionId);
  return submission(submissionId)!;
}
