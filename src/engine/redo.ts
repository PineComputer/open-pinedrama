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

export function submission(id: string): SubmissionView | undefined {
  const row = get<Row>("select id, session_id, state, message from submissions where id = ?", id);
  return row && { id: row.id, sessionId: row.session_id, state: row.state, ...(row.message ? { message: row.message } : {}) };
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
