// What a maker does to a drama: start one, change how many episodes run at once, resume
// an episode whose session ended, retry a stopped setup, talk to an agent.
import { computerRef, fleet, sessionRef } from "./computers.ts";
import { get, newId, now, run } from "./db.ts";
import { followTurn, recordTurn } from "./follow.ts";
import { save } from "./library.ts";
import { publish } from "./live.ts";
import { type DramaRow, computer as computerRow, drama as dramaRow, episode as episodeRow, latestTurn, session as sessionRow } from "./records.ts";
import { ReviewError } from "./reviews.ts";
import { startRun } from "./runs.ts";

export interface NewDrama {
  title: string;
  language: string;
  look: string;
  format: string;
  budget: number | null;
  parallel: number;
  perComputer: number;
  notes: string;
  files: { name: string; type: string; bytes: Uint8Array }[];
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(value)));

export async function createDrama(input: NewDrama): Promise<string> {
  if (!input.title.trim()) throw new ReviewError("Give the drama a title.", 400);
  if (!input.files.length) throw new ReviewError("Add the screenplay.", 400);
  const id = newId("drama");
  run(
    `insert into dramas (id, title, language, look, format, budget, parallel, per_computer, notes, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'setup', ?, ?)`,
    id,
    input.title.trim(),
    input.language === "en" ? "en" : "zh",
    input.look.trim() || "live action",
    input.format.trim() || "9:16, 480p",
    input.budget && input.budget > 0 ? input.budget : null,
    clamp(input.parallel || 4, 1, 50),
    clamp(input.perComputer || 1, 1, 3),
    input.notes.trim(),
    now(),
    now(),
  );
  for (const file of input.files) {
    const fileId = await save(file.bytes, { dramaId: id, relPath: file.name, type: file.type, kind: "screenplay" });
    run("insert into inputs (drama_id, file_id) values (?, ?)", id, fileId);
  }
  publish("dramas");
  return id;
}

export function updateDrama(id: string, patch: { parallel?: number; perComputer?: number; budget?: number | null }): DramaRow {
  const drama = dramaRow(id);
  if (!drama) throw new ReviewError("No such drama.", 404);
  run(
    "update dramas set parallel = ?, per_computer = ?, budget = ?, updated_at = ? where id = ?",
    patch.parallel !== undefined ? clamp(patch.parallel, 1, 50) : drama.parallel,
    patch.perComputer !== undefined ? clamp(patch.perComputer, 1, 3) : drama.per_computer,
    patch.budget !== undefined ? (patch.budget && patch.budget > 0 ? patch.budget : null) : drama.budget,
    now(),
    id,
  );
  publish(`drama:${id}`, "dramas");
  return dramaRow(id)!;
}

/** An episode whose session ended or failed goes back in line, to continue from what the library holds. */
export function resumeEpisode(id: string): void {
  const episode = episodeRow(id);
  if (!episode) throw new ReviewError("No such episode.", 404);
  if (episode.state !== "stopped" && episode.state !== "failed") throw new ReviewError("This episode is still going.", 409);
  run("update episodes set state = 'queued', resume = 1, updated_at = ? where id = ?", now(), id);
  publish(`drama:${episode.drama_id}`);
}

export function retrySetup(id: string): void {
  const drama = dramaRow(id);
  if (!drama) throw new ReviewError("No such drama.", 404);
  if (drama.status !== "stopped") throw new ReviewError("The drama isn't stopped.", 409);
  // A drama that already has its episodes goes back to production; one without goes back to setup.
  const hasEpisodes = (get<{ n: number }>("select count(*) as n from episodes where drama_id = ?", id)?.n ?? 0) > 0;
  run("update dramas set status = ?, note = '', continues = 0, updated_at = ? where id = ?", hasEpisodes ? "production" : "setup", now(), id);
  publish(`drama:${id}`, "dramas");
}

/**
 * A message to a session's agent. While a question waits, it is the answer (and the
 * review closes with it); while a turn runs, it steers; otherwise it starts a run.
 */
export async function chat(sessionId: string, text: string): Promise<void> {
  const session = sessionRow(sessionId);
  if (!session || session.state !== "open") throw new ReviewError("This session has ended.", 409);
  const computer = computerRow(session.computer_id);
  if (computer?.state !== "running") throw new ReviewError("Its Computer isn't running.", 409);
  if (!text.trim()) throw new ReviewError("Write a message first.", 400);
  const turn = latestTurn(session.id);
  if (turn?.state === "needs_input") {
    const next = await fleet().answer(computerRef(computer), sessionRef(session), turn.id, text);
    run("update turns set state = 'answered', next_turn_id = ? where id = ?", next.turnId, turn.id);
    run(
      "update reviews set state = 'answered', decision = ?, answer = ?, decided_at = ? where turn_id = ? and state in ('open', 'saving')",
      JSON.stringify({ items: [], words: text }),
      text,
      now(),
      turn.id,
    );
    if (session.episode_id) run("update episodes set state = 'working', updated_at = ? where id = ?", now(), session.episode_id);
    recordTurn(session.id, next);
    followTurn(session.id, next.turnId);
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
  if (!session || session.state !== "open" || computer?.state !== "running") throw new ReviewError("This session has ended.", 409);
  return fleet().desktop(computerRef(computer), sessionRef(session));
}
