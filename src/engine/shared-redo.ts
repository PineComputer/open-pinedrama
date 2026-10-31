// Redoing a shared reference after the setup handed the project over (D38): the setup session has closed, so the redo is
// one submission the engine keeps (by its submission id, as redo.ts keeps an episode's), queued until the scheduler opens
// a new setup session for it on a Computer within the drama's parallel limit (scheduler.ts, startSharedRedo). That session
// restores the newest handed-over project, makes the named references again, asks the maker to review them, hands the
// project back and closes (flow.ts). Running episode sessions are not told: what they made from the earlier versions
// shows out of date at their next stop.
import type { SubmissionView } from "../shared/types.ts";
import { all, get, now, run } from "./db.ts";
import { StudioError } from "./errors.ts";
import { publish } from "./live.ts";
import { drama as dramaRow } from "./records.ts";

export interface SharedRedoRow {
  id: string;
  drama_id: string;
  text: string;
  state: "queued" | "working" | "done" | "failed";
  session_id: string | null;
  note: string | null;
}

const view = (row: SharedRedoRow): SubmissionView => ({ id: row.id, sessionId: row.session_id ?? "", state: "sent" });

export function sharedRedo(id: string): SharedRedoRow | undefined {
  return get<SharedRedoRow>("select * from shared_redos where id = ?", id);
}

/** The redo a session was opened for, if it was. */
export function redoOfSession(sessionId: string): SharedRedoRow | undefined {
  return get<SharedRedoRow>("select * from shared_redos where session_id = ?", sessionId);
}

export function queuedRedos(dramaId: string): SharedRedoRow[] {
  return all<SharedRedoRow>("select * from shared_redos where drama_id = ? and state = 'queued' order by created_at", dramaId);
}

/** Taken once per submission id: the same id again returns it, and never queues a second session. */
export function askSharedRedo(dramaId: string, submissionId: string, text: string): SubmissionView {
  if (!submissionId) throw new StudioError("submission-missing", "A redo needs its submissionId.");
  const known = sharedRedo(submissionId);
  if (known) {
    if (known.drama_id !== dramaId) throw new StudioError("submission-elsewhere", "This submission went to another project.", 409);
    return view(known);
  }
  const drama = dramaRow(dramaId);
  if (!drama) throw new StudioError("not-found", "No such project.", 404);
  if (drama.status === "setup") throw new StudioError("setup-running", "The setup is still running: ask its agent in the setup session.", 409);
  if (drama.status === "stopped") throw new StudioError("drama-not-running", "The project is stopped: resume it first.", 409);
  if (!text.trim()) throw new StudioError("message-empty", "Name what to redo.");
  const at = now();
  run("insert into shared_redos (id, drama_id, text, state, created_at, updated_at) values (?, ?, ?, 'queued', ?, ?)", submissionId, dramaId, text, at, at);
  publish(`drama:${dramaId}`);
  return view(sharedRedo(submissionId)!);
}

export function markRedo(id: string, state: SharedRedoRow["state"], fields: { sessionId?: string | null; note?: string } = {}): void {
  run(
    "update shared_redos set state = ?, session_id = coalesce(?, session_id), note = coalesce(?, note), updated_at = ? where id = ?",
    state,
    fields.sessionId ?? null,
    fields.note ?? null,
    now(),
    id,
  );
}

/** The submission view of a shared redo, for GET /api/submissions/:id. */
export function sharedRedoView(id: string): SubmissionView | undefined {
  const row = sharedRedo(id);
  return row && view(row);
}
