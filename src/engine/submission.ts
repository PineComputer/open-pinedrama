// One submission, a review's decision or a message to the setup's scope (Codex's IA round 3, Interrupt): what the engine
// knows became of it, so a studio that lost the answer (closed, offline) finds it again and never sends it twice. A review
// keeps its decision's submission while it is being sent and once it was (reviews.ts, decide), and drops it when the send
// did not reach the session: then nothing was taken, and there is no such submission. A setup message is kept once queued
// (setup-message.ts).
import type { SubmissionView } from "../shared/types.ts";
import { get } from "./db.ts";
import { setupMessageView } from "./setup-message.ts";

export function submission(id: string): SubmissionView | undefined {
  const decided = get<{ session_id: string; state: string }>("select session_id, state from reviews where submission_id = ?", id);
  if (decided) return { id, sessionId: decided.session_id, state: decided.state === "sending" ? "sending" : "sent" };
  return setupMessageView(id);
}
