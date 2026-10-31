// A message the maker sends to a scope of the drama, the setup's (the script, the bible, the shared references) or an
// episode's, always reaches an agent (D70, the chat acts; D71): the scope's open session takes it as a chat does; with
// none open, a new session of that scope is queued for it (scheduler.ts, startMessage), on the project last handed over
// (and, for an episode, its own newest pack), the message verbatim as its goal, within the drama's parallel limit, and it
// closes at its handback (flow.ts). One submission per message, kept by its id: the same id again never sends twice.
import type { MessageView, SubmissionView } from "../shared/types.ts";
import { chat } from "./dramas.ts";
import { all, get, now, run } from "./db.ts";
import { StudioError } from "./errors.ts";
import { publish } from "./live.ts";
import { type SessionRow, drama as dramaRow, episodeCode } from "./records.ts";

export interface MessageRow {
  id: string;
  drama_id: string;
  /** "setup", or the episode's code. */
  scope: string;
  episode_id: string | null;
  text: string;
  /**
   * sending/sent: to an open session; queued, working, done or failed: for a new one; stopped: queued or working when the
   * maker stopped the drama, never reopened (the maker sends it again).
   */
  state: "sending" | "sent" | "queued" | "working" | "done" | "failed" | "stopped";
  session_id: string | null;
  note: string | null;
  created_at: string;
}

const view = (row: MessageRow): SubmissionView => ({ id: row.id, sessionId: row.session_id ?? "", state: row.state === "sending" ? "sending" : "sent" });

export function message(id: string): MessageRow | undefined {
  return get<MessageRow>("select * from scope_messages where id = ?", id);
}

/** The message a session was opened for, if it was. */
export function messageOfSession(sessionId: string): MessageRow | undefined {
  return get<MessageRow>("select * from scope_messages where session_id = ? and state in ('working', 'done', 'failed')", sessionId);
}

export function queuedMessages(dramaId: string): MessageRow[] {
  return all<MessageRow>("select * from scope_messages where drama_id = ? and state = 'queued' order by created_at", dramaId);
}

/** How many of the drama's messages are in these states: queued for a new session, or working in one, hold a place in its parallel limit. */
export const messagesIn = (dramaId: string, ...states: MessageRow["state"][]) =>
  get<{ n: number }>(`select count(*) as n from scope_messages where drama_id = ? and state in (${states.map(() => "?").join(", ")})`, dramaId, ...states)?.n ?? 0;

export async function sendMessage(dramaId: string, scope: string, submissionId: string, text: string): Promise<SubmissionView> {
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
  const open =
    scope === "setup"
      ? get<SessionRow>("select * from sessions where drama_id = ? and role = 'setup' and state = 'open' order by created_at desc limit 1", dramaId)
      : get<SessionRow>("select * from sessions where episode_id = ? and state = 'open' order by created_at desc limit 1", episode!.id);
  const at = now();
  if (open) {
    // As the chat sends: the open session's running turn is steered, its question answered, or a run started.
    run("insert into scope_messages (id, drama_id, scope, episode_id, text, state, session_id, created_at, updated_at) values (?, ?, ?, ?, ?, 'sending', ?, ?, ?)", submissionId, dramaId, scope, episode?.id ?? null, text, open.id, at, at);
    try {
      await chat(open.id, text);
    } catch (error) {
      // Refused by the engine: nothing was taken, so there is no such submission and it may be sent again.
      if (error instanceof StudioError) run("delete from scope_messages where id = ?", submissionId);
      throw error;
    }
    run("update scope_messages set state = 'sent', updated_at = ? where id = ?", now(), submissionId);
    return view(message(submissionId)!);
  }
  if (scope === "setup" && drama.status === "setup") throw new StudioError("setup-running", "The setup's session is starting: send it again in a moment.", 409);
  if (episode && episode.state === "queued") throw new StudioError("episode-not-started", `${scope} hasn't started: it starts in its turn, and you can write to it then.`, 409);
  if (episode && (episode.state === "working" || episode.state === "waiting")) throw new StudioError("episode-not-started", `${scope}'s session is starting: send it again in a moment.`, 409);
  const active = (get<{ n: number }>("select count(*) as n from episodes where drama_id = ? and state in ('working', 'waiting')", dramaId)?.n ?? 0) + messagesIn(dramaId, "queued", "working");
  if (active >= drama.parallel) throw new StudioError("limit-full", `All ${drama.parallel} of the project's sessions are at work: send it again when one finishes, or raise how many run at once.`, 409);
  run("insert into scope_messages (id, drama_id, scope, episode_id, text, state, created_at, updated_at) values (?, ?, ?, ?, ?, 'queued', ?, ?)", submissionId, dramaId, scope, episode?.id ?? null, text, at, at);
  publish(`drama:${dramaId}`);
  return view(message(submissionId)!);
}

/** A stopped message stays stopped: a start or a turn still settling after the drama stopped doesn't bring it back. */
export function markMessage(id: string, state: MessageRow["state"], fields: { sessionId?: string | null; note?: string } = {}): void {
  run(
    "update scope_messages set state = ?, session_id = coalesce(?, session_id), note = coalesce(?, note), updated_at = ? where id = ? and state != 'stopped'",
    state,
    fields.sessionId ?? null,
    fields.note ?? null,
    now(),
    id,
  );
}

/** The drama stopped: its messages waiting for or running in a new session end, so none holds a place after Resume. */
export function stopMessages(dramaId: string): void {
  run("update scope_messages set state = 'stopped', updated_at = ? where drama_id = ? and state in ('queued', 'working')", now(), dramaId);
}

/** A scope's messages that went to a new session of it, oldest first; those an open session took are in its chat. */
export function scopeMessages(dramaId: string, scope: string): MessageView[] {
  return all<MessageRow>("select * from scope_messages where drama_id = ? and scope = ? and state not in ('sending', 'sent') order by created_at, id", dramaId, scope).map((row) => ({
    id: row.id,
    scope: row.scope,
    text: row.text,
    state: row.state as MessageView["state"],
    sessionId: row.session_id ?? "",
    at: row.created_at,
    ...(row.state === "failed" ? { reason: row.note ?? "" } : {}),
  }));
}

/** The submission view of a message, for GET /api/submissions/:id. */
export function messageView(id: string): SubmissionView | undefined {
  const row = message(id);
  return row && view(row);
}
