// A message the maker sends to a scope of the drama, the setup's (the script, the bible, the shared references) or an
// episode's, reaches the scope's open session as a chat does (D70, the chat acts; D71 as amended for the UI-only tag: an
// open session only, nothing opens a new one); with none open, it is refused, saying what main offers instead: an episode
// whose Computer stopped or that failed is resumed in a new session with its files (POST /api/episodes/:id/resume, main's
// resumeEpisode), and a finished one isn't reopened. One submission per message, kept by its id: the same id again never
// sends twice.
import type { SubmissionView } from "../shared/types.ts";
import { chat } from "./dramas.ts";
import { all, get, now, run } from "./db.ts";
import { StudioError } from "./errors.ts";
import { type SessionRow, drama as dramaRow, episodeCode } from "./records.ts";

interface MessageRow {
  id: string;
  drama_id: string;
  session_id: string;
  /** sending while the session takes it, sent once it has. */
  state: "sending" | "sent";
}

const view = (row: MessageRow): SubmissionView => ({ id: row.id, sessionId: row.session_id, state: row.state });

const message = (id: string) => get<MessageRow>("select * from scope_messages where id = ?", id);

export async function sendMessage(dramaId: string, scope: string, submissionId: string, text: string, file?: number): Promise<SubmissionView> {
  if (!submissionId) throw new StudioError("submission-missing", "A message needs its submissionId.");
  const known = message(submissionId);
  if (known) {
    if (known.drama_id !== dramaId) throw new StudioError("submission-elsewhere", "This submission went to another project.", 409);
    return view(known);
  }
  const drama = dramaRow(dramaId);
  if (!drama) throw new StudioError("not-found", "No such project.", 404);
  if (drama.status === "stopped") throw new StudioError("drama-not-running", "The project is stopped: resume it first.", 409);
  if (!text.trim()) throw new StudioError("message-empty", "Write a message first.");
  const episode = scope === "setup" ? undefined : all<{ id: string; number: number; state: string }>("select id, number, state from episodes where drama_id = ?", dramaId).find((row) => episodeCode(row) === scope);
  if (scope !== "setup" && !episode) throw new StudioError("not-found", `This project has no ${scope}.`, 404);
  const open = episode
    ? get<SessionRow>("select * from sessions where episode_id = ? and state = 'open' order by created_at desc limit 1", episode.id)
    : get<SessionRow>("select * from sessions where drama_id = ? and role = 'setup' and state = 'open' order by created_at desc limit 1", dramaId);
  if (!open && (episode?.state === "stopped" || episode?.state === "failed"))
    throw new StudioError("episode-stopped", `${scope}'s Computer stopped: Resume it to continue in a new session with its files.`, 409);
  if (!open && episode?.state === "done") throw new StudioError("episode-done", `${scope} is done; this version can't reopen a finished episode.`, 409);
  if (!open) throw new StudioError("no-session-open", `${episode ? scope : "The setup"} has no open session in this version.`, 409);
  // As the chat sends: the open session's running turn is steered, its question answered (with the file, if any), or a run started.
  const at = now();
  run("insert into scope_messages (id, drama_id, scope, text, state, session_id, created_at, updated_at) values (?, ?, ?, ?, 'sending', ?, ?, ?)", submissionId, dramaId, scope, text, open.id, at, at);
  try {
    await chat(open.id, text, file);
  } catch (error) {
    // Refused by the engine: nothing was taken, so there is no such submission and it may be sent again.
    if (error instanceof StudioError) run("delete from scope_messages where id = ?", submissionId);
    throw error;
  }
  run("update scope_messages set state = 'sent', updated_at = ? where id = ?", now(), submissionId);
  return view(message(submissionId)!);
}

/** The submission view of a message, for GET /api/submissions/:id. */
export function messageView(id: string): SubmissionView | undefined {
  const row = message(id);
  return row && view(row);
}
