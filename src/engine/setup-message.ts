// A message to the setup's scope (the script, the bible, the shared looks, locations and props) after the setup handed
// the project over: the setup session has closed, so the message is one submission the engine keeps (by its submission
// id, as redo.ts keeps an episode's), queued until the scheduler opens a new setup session for it on a Computer within the
// drama's parallel limit (scheduler.ts, startSetupMessage). That session restores the newest handed-over project, takes
// the message as its goal, asks the maker to review whatever it makes, hands the project back and closes (flow.ts).
// Running episode sessions are not told: what they made from earlier versions shows out of date at their next stop (D38).
import type { SubmissionView } from "../shared/types.ts";
import { all, get, now, run } from "./db.ts";
import { StudioError } from "./errors.ts";
import { publish } from "./live.ts";
import { drama as dramaRow } from "./records.ts";

export interface SetupMessageRow {
  id: string;
  drama_id: string;
  text: string;
  state: "queued" | "working" | "done" | "failed";
  session_id: string | null;
  note: string | null;
}

const view = (row: SetupMessageRow): SubmissionView => ({ id: row.id, sessionId: row.session_id ?? "", state: "sent" });

export function setupMessage(id: string): SetupMessageRow | undefined {
  return get<SetupMessageRow>("select * from setup_messages where id = ?", id);
}

/** The message a session was opened for, if it was. */
export function messageOfSession(sessionId: string): SetupMessageRow | undefined {
  return get<SetupMessageRow>("select * from setup_messages where session_id = ?", sessionId);
}

export function queuedSetupMessages(dramaId: string): SetupMessageRow[] {
  return all<SetupMessageRow>("select * from setup_messages where drama_id = ? and state = 'queued' order by created_at", dramaId);
}

/** Taken once per submission id: the same id again returns it, and never queues a second session. */
export function askSetup(dramaId: string, submissionId: string, text: string): SubmissionView {
  if (!submissionId) throw new StudioError("submission-missing", "A message needs its submissionId.");
  const known = setupMessage(submissionId);
  if (known) {
    if (known.drama_id !== dramaId) throw new StudioError("submission-elsewhere", "This submission went to another project.", 409);
    return view(known);
  }
  const drama = dramaRow(dramaId);
  if (!drama) throw new StudioError("not-found", "No such project.", 404);
  if (drama.status === "setup") throw new StudioError("setup-running", "The setup is still running: ask its agent in the setup session.", 409);
  if (drama.status === "stopped") throw new StudioError("drama-not-running", "The project is stopped: resume it first.", 409);
  if (!text.trim()) throw new StudioError("message-empty", "Write a message first.");
  const at = now();
  run("insert into setup_messages (id, drama_id, text, state, created_at, updated_at) values (?, ?, ?, 'queued', ?, ?)", submissionId, dramaId, text, at, at);
  publish(`drama:${dramaId}`);
  return view(setupMessage(submissionId)!);
}

export function markSetupMessage(id: string, state: SetupMessageRow["state"], fields: { sessionId?: string | null; note?: string } = {}): void {
  run(
    "update setup_messages set state = ?, session_id = coalesce(?, session_id), note = coalesce(?, note), updated_at = ? where id = ?",
    state,
    fields.sessionId ?? null,
    fields.note ?? null,
    now(),
    id,
  );
}

/** The submission view of a setup message, for GET /api/submissions/:id. */
export function setupMessageView(id: string): SubmissionView | undefined {
  const row = setupMessage(id);
  return row && view(row);
}
