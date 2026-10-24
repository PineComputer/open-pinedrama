// What a maker does to a drama: start one, change how many episodes run at once, resume
// an episode whose session ended, retry a stopped setup, talk to an agent.
import { closeSession, computerRef, fleet, sessionRef } from "./computers.ts";
import { stopEvents } from "./follow.ts";
import type { Mode } from "../shared/types.ts";
import { MAX_ATTACHMENT } from "./config.ts";
import { get, newId, now, run, transaction } from "./db.ts";
import { save } from "./library.ts";
import { publish } from "./live.ts";
import { type DramaRow, computer as computerRow, drama as dramaRow, episode as episodeRow, latestTurn, session as sessionRow } from "./records.ts";
import { StudioError } from "./errors.ts";
import { LENGTHS, briefFile } from "./goals.ts";
import { decide, pendingReview } from "./reviews.ts";
import { startRun } from "./runs.ts";

export interface NewDrama {
  title: string;
  language: string;
  look: string;
  format: string;
  parallel: number;
  perComputer: number;
  notes: string;
  /** About this many seconds an episode: 60, 90 or 120. */
  length?: string;
  /** What each episode may spend on generation, in USD. */
  budget?: number | null;
  files: { name: string; type: string; bytes: Uint8Array }[];
  /** Pine's agent stands in for the drama skill with placeholder files (goals.ts, rehearsed). */
  rehearsal?: boolean;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(value)));

/**
 * A new drama, made for the mode the studio is in. Its screenplay is stored first; the
 * drama appears (and the scheduler can see it) only once all of it is.
 */
export async function createDrama(input: NewDrama, mode: Mode): Promise<string> {
  if (!input.title.trim()) throw new StudioError("title-missing", "Give the drama a title.");
  if (!input.files.length) throw new StudioError("screenplay-missing", "Add the screenplay.");
  const large = input.files.find((file) => file.bytes.byteLength > MAX_ATTACHMENT);
  if (large) throw new StudioError("file-too-large", `${large.name} is over 64 MiB, more than a Computer can be handed.`, 400, large.name);
  const id = newId("drama");
  const length = LENGTHS[input.length ?? ""] ? input.length! : "60";
  const budget = input.budget === null || input.budget === undefined || !Number.isFinite(input.budget) ? null : Math.max(0, Math.round(input.budget * 100) / 100);
  const fileIds: number[] = [];
  // The maker's own brief.md is the brief; without one, the studio writes it from what they chose here.
  const isBrief = (name: string) => name.toLowerCase() === "brief.md";
  const files = input.files.some((file) => isBrief(file.name))
    ? input.files
    : [
        ...input.files,
        {
          name: "brief.md",
          type: "text/markdown",
          bytes: new TextEncoder().encode(
            briefFile({ title: input.title.trim(), language: input.language === "en" ? "en" : "zh", look: input.look.trim() || "live action", format: input.format.trim() || "9:16, 480p", notes: input.notes.trim(), length, budget }),
          ),
        },
      ];
  try {
    for (const file of files) fileIds.push(await save(file.bytes, { dramaId: id, relPath: file.name, type: file.type, kind: isBrief(file.name) ? "brief" : "screenplay" }));
  } catch (error) {
    run("delete from files where drama_id = ?", id);
    throw error;
  }
  transaction(() => {
    run(
      `insert into dramas (id, title, language, look, format, parallel, per_computer, notes, length, budget, mode, rehearsal, status, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'setup', ?, ?)`,
      id,
      input.title.trim(),
      input.language === "en" ? "en" : "zh",
      input.look.trim() || "live action",
      input.format.trim() || "9:16, 480p",
      clamp(input.parallel || 4, 1, 50),
      clamp(input.perComputer || 1, 1, 3),
      input.notes.trim(),
      length,
      budget,
      mode,
      input.rehearsal ? 1 : 0,
      now(),
      now(),
    );
    for (const fileId of fileIds) run("insert into inputs (drama_id, file_id) values (?, ?)", id, fileId);
  });
  publish("dramas");
  return id;
}

export function updateDrama(id: string, patch: { parallel?: number; perComputer?: number }): DramaRow {
  const drama = dramaRow(id);
  if (!drama) throw new StudioError("not-found", "No such drama.", 404);
  run(
    "update dramas set parallel = ?, per_computer = ?, updated_at = ? where id = ?",
    patch.parallel !== undefined ? clamp(patch.parallel, 1, 50) : drama.parallel,
    patch.perComputer !== undefined ? clamp(patch.perComputer, 1, 3) : drama.per_computer,
    now(),
    id,
  );
  publish(`drama:${id}`, "dramas");
  return dramaRow(id)!;
}

/** An episode whose session ended or failed goes back in line, to continue from what the library holds. */
export function resumeEpisode(id: string): void {
  const episode = episodeRow(id);
  if (!episode) throw new StudioError("not-found", "No such episode.", 404);
  if (episode.state !== "stopped" && episode.state !== "failed") throw new StudioError("episode-busy", "This episode is still going.", 409);
  run("update episodes set state = 'queued', resume = 1, carry = '', updated_at = ? where id = ?", now(), id);
  publish(`drama:${episode.drama_id}`);
}

/**
 * The maker calls an episode finished with its latest cut: for an agent that keeps asking
 * after the work is done, or one whose cut was approved in words rather than in its review.
 * Its waiting question closes with that answer and its session is let go.
 */
export async function finishEpisode(id: string): Promise<void> {
  const episode = episodeRow(id);
  if (!episode) throw new StudioError("not-found", "No such episode.", 404);
  if (!get("select id from files where episode_id = ? and kind = 'cut' limit 1", id)) throw new StudioError("no-cut", "This episode has no cut yet.", 409);
  const session = episode.session_id ? sessionRow(episode.session_id) : undefined;
  transaction(() => {
    if (session) run("update reviews set state = 'answered', answer = ?, decided_at = ? where session_id = ? and state in ('saving', 'open')", "The maker finished the episode here.", now(), session.id);
    run("update episodes set state = 'done', note = '', session_id = null, updated_at = ? where id = ?", now(), id);
  });
  if (session?.state === "open") {
    stopEvents(session.id);
    await closeSession(session);
  }
  publish(`drama:${episode.drama_id}`, "dramas", "inbox");
}

export function retrySetup(id: string): void {
  const drama = dramaRow(id);
  if (!drama) throw new StudioError("not-found", "No such drama.", 404);
  if (drama.status !== "stopped") throw new StudioError("drama-not-stopped", "The drama isn't stopped.", 409);
  // A drama that already has its episodes goes back to production; one without goes back to setup.
  const hasEpisodes = (get<{ n: number }>("select count(*) as n from episodes where drama_id = ?", id)?.n ?? 0) > 0;
  run("update dramas set status = ?, note = '', reason = '', continues = 0, updated_at = ? where id = ?", hasEpisodes ? "production" : "setup", now(), id);
  publish(`drama:${id}`, "dramas");
}

/**
 * A drama held for want of the drama skill, started again as a rehearsal: Pine's agent stands
 * in for the skill with placeholder files, so every step runs on real Computers.
 */
export function rehearse(id: string): void {
  const drama = dramaRow(id);
  if (!drama) throw new StudioError("not-found", "No such drama.", 404);
  if (drama.status !== "stopped" || drama.reason !== "no-drama-skill") throw new StudioError("drama-not-held", "Only a drama held for want of the drama skill can be rehearsed.", 409);
  run("update dramas set rehearsal = 1 where id = ?", id);
  retrySetup(id);
}

/**
 * A message to a session's agent. While a question waits, it is the answer (and the
 * review closes with it); while a turn runs, it steers; otherwise it starts a run.
 */
export async function chat(sessionId: string, text: string): Promise<void> {
  const session = sessionRow(sessionId);
  if (!session || session.state !== "open") throw new StudioError("session-ended", "This session has ended.", 409);
  const computer = computerRow(session.computer_id);
  if (computer?.state !== "running") throw new StudioError("computer-not-running", "Its Computer isn't running.", 409);
  if (!text.trim()) throw new StudioError("message-empty", "Write a message first.");
  const turn = latestTurn(session.id);
  const review = pendingReview(session.id);
  if (review) {
    // The session waits on the maker: a plain question can be answered from here, through the
    // same gate as the review room; anything to look at is decided in the room, item by item.
    if (review.kind !== "question") throw new StudioError("decide-in-review", "Decide this in its review, where the files are.", 409);
    await decide(review.id, { items: [], words: text });
  } else if (turn?.state === "needs_input") {
    throw new StudioError("question-closed", "This question can't be answered any more.", 409);
  } else if (turn && !turn.ended_at && turn.state !== "answered") {
    await fleet().steer(computerRef(computer), sessionRef(session), turn.id, text);
  } else {
    await startRun(session, "chat", text);
  }
  publish(`session:${sessionId}`, `drama:${session.drama_id}`, "inbox");
}

export async function desktop(sessionId: string): Promise<unknown | null> {
  const session = sessionRow(sessionId);
  const computer = session && computerRow(session.computer_id);
  if (!session || session.state !== "open" || computer?.state !== "running") throw new StudioError("session-ended", "This session has ended.", 409);
  return fleet().desktop(computerRef(computer), sessionRef(session));
}
