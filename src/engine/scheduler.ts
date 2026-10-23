// The production line's clock. Every couple of seconds: start each new drama's setup;
// fill free slots from each drama's episode queue (episodes at once, episodes per Computer,
// and a cap on episodes waiting for the maker); keep idle timeouts long while a session
// waits on the maker; stop Computers with nothing to do; retry what didn't go through.
import { IDLE_WAITING_S, IDLE_WORKING_S, WAITING_CAP } from "./config.ts";
import { computerRef, fleet, markStopped, openSession, provision, restart, runningComputers, setIdle, stop } from "./computers.ts";
import { all, get, now, run } from "./db.ts";
import { followEvents, followTurn, isFollowed, unsavedTurns } from "./follow.ts";
import { episodeGoal, resumeGoal, setupGoal } from "./goals.ts";
import type { FileRow } from "./library.ts";
import { publish } from "./live.ts";
import { type ComputerRow, type DramaRow, type EpisodeRow, type SessionRow, episodeCode, latestTurn, openSessionsOf } from "./records.ts";
import { attach, inputs, references, sendRun, startRun, unconfirmedRuns } from "./runs.ts";

/** Work the clock started and hasn't finished, so a slow call never starts twice. */
const busy = new Set<string>();

function once(key: string, work: () => Promise<void>): boolean {
  if (busy.has(key)) return false;
  busy.add(key);
  void work()
    .catch((error) => console.error(`${key}:`, (error as Error).message))
    .finally(() => busy.delete(key));
  return true;
}

/** Sessions being opened on each Computer, counted with its open ones so two episodes never claim one slot. */
const opening = new Map<string, number>();

function load(computerId: string): number {
  return openSessionsOf(computerId).length + (opening.get(computerId) ?? 0);
}

function reserve(computerId: string): () => void {
  opening.set(computerId, (opening.get(computerId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    opening.set(computerId, (opening.get(computerId) ?? 1) - 1);
  };
}

function capacity(drama: DramaRow): number {
  return Math.max(1, Math.ceil(drama.parallel / Math.max(1, drama.per_computer)));
}

/** A running Computer of the drama with room for one more session, or none. */
function freeComputer(drama: DramaRow): ComputerRow | undefined {
  return runningComputers(drama.id).find((computer) => load(computer.id) < Math.max(1, drama.per_computer));
}

/** A Computer the drama can use soon: a free running one, or one it starts now. */
function claimComputer(drama: DramaRow): ComputerRow | undefined {
  const free = freeComputer(drama);
  if (free) return free;
  const pool = all<ComputerRow>("select * from computers where drama_id = ? and state in ('starting', 'running', 'stopping')", drama.id);
  if (pool.some((computer) => computer.state === "starting")) return undefined;
  if (pool.length >= capacity(drama)) return undefined;
  const stopped = get<ComputerRow>("select * from computers where drama_id = ? and state = 'stopped' order by created_at limit 1", drama.id);
  once(`start:${drama.id}`, () => (stopped ? restart(stopped) : provision(drama.id)));
  return undefined;
}

function ensureSetup(drama: DramaRow): void {
  const open = get<SessionRow>("select * from sessions where drama_id = ? and role = 'setup' and state = 'open'", drama.id);
  if (open) return;
  const computer = claimComputer(drama);
  if (!computer) return;
  const release = reserve(computer.id);
  const started = once(`setup:${drama.id}`, async () => {
    try {
      const session = await openSession(computer, "setup", null, "Setup");
      release();
      const { sent } = await attach(session, inputs(drama.id));
      followEvents(session.id);
      await startRun(session, "setup", setupGoal(drama, sent));
    } finally {
      release();
      publish(`drama:${drama.id}`);
    }
  });
  if (!started) release();
}

function episodeBudget(drama: DramaRow): number | null {
  if (!drama.budget) return null;
  const count = get<{ n: number }>("select count(*) as n from episodes where drama_id = ?", drama.id)?.n || 1;
  return Math.floor(drama.budget / count);
}

function startEpisode(drama: DramaRow, episode: EpisodeRow, computer: ComputerRow): void {
  run("update episodes set state = 'working', note = case when resume = 1 then note else '' end, updated_at = ? where id = ?", now(), episode.id);
  const release = reserve(computer.id);
  const started = once(`episode:${episode.id}`, async () => {
    try {
      const code = episodeCode(episode);
      const session = await openSession(computer, "episode", episode.id, code);
      release();
      run("update episodes set session_id = ?, updated_at = ? where id = ?", session.id, now(), episode.id);
      let files: FileRow[] = [...inputs(drama.id), ...references(drama.id)];
      if (episode.resume) files = [...files, ...all<FileRow>("select * from files where episode_id = ? and kind != 'observation' order by id", episode.id)];
      const { sent, skipped } = await attach(session, files);
      followEvents(session.id);
      const goal = episode.resume
        ? resumeGoal(drama, code, episodeBudget(drama), sent, episode.note || undefined)
        : episodeGoal(drama, code, episodeBudget(drama), sent);
      await startRun(session, episode.resume ? "resume" : "episode", goal);
      run(
        "update episodes set resume = 0, continues = 0, note = ?, updated_at = ? where id = ?",
        skipped.length ? `Too large to hand over (over 64 MiB): ${skipped.join(", ")}` : "",
        now(),
        episode.id,
      );
    } catch (error) {
      run("update episodes set state = 'queued', updated_at = ? where id = ?", now(), episode.id);
      throw error;
    } finally {
      release();
      publish(`drama:${drama.id}`);
    }
  });
  if (!started) release();
}

function fill(drama: DramaRow): void {
  const count = (state: string) => get<{ n: number }>("select count(*) as n from episodes where drama_id = ? and state = ?", drama.id, state)?.n ?? 0;
  let active = count("working") + count("waiting");
  const waiting = count("waiting");
  const queued = all<EpisodeRow>("select * from episodes where drama_id = ? and state = 'queued' order by number", drama.id);
  for (const episode of queued) {
    if (active >= drama.parallel || waiting >= WAITING_CAP) return;
    const computer = claimComputer(drama);
    if (!computer) return;
    startEpisode(drama, episode, computer);
    active += 1;
  }
  if (!queued.length && !active && count("stopped") + count("failed") === 0) {
    const total = get<{ n: number }>("select count(*) as n from episodes where drama_id = ?", drama.id)?.n ?? 0;
    if (total) {
      run("update dramas set status = 'done', updated_at = ? where id = ?", now(), drama.id);
      publish(`drama:${drama.id}`, "dramas");
    }
  }
}

/** A Computer waiting on the maker keeps running longer; one with nothing to do stops. */
function tend(computer: ComputerRow): void {
  const sessions = openSessionsOf(computer.id);
  const waiting = sessions.some((session) => latestTurn(session.id)?.state === "needs_input");
  const desired = waiting ? IDLE_WAITING_S : IDLE_WORKING_S;
  if (computer.idle_timeout !== desired) once(`idle:${computer.id}`, () => setIdle(computer, desired));
  if (!sessions.length) {
    const drama = get<DramaRow>("select * from dramas where id = ?", computer.drama_id);
    const queued = get<{ n: number }>("select count(*) as n from episodes where drama_id = ? and state = 'queued'", computer.drama_id)?.n ?? 0;
    if (drama && drama.status !== "setup" && !queued && !opening.get(computer.id)) once(`stop:${computer.id}`, () => stop(computer));
  }
}

/** Every saved Computer against Pine: those that stopped are marked so; running turns are followed again. */
export async function reconcile(): Promise<void> {
  for (const computer of all<ComputerRow>("select * from computers where state in ('running', 'starting', 'stopping')")) {
    if (!computer.binding) {
      if (computer.state !== "running") markStopped(computer, "Its Computer didn't finish starting.");
      continue;
    }
    const state = await fleet().status(computerRef(computer)).catch(() => "unknown");
    if (state === "stopped" || state === "failed") {
      markStopped(computer, "Its Computer stopped.");
      continue;
    }
    if (state !== "running") continue;
    for (const session of openSessionsOf(computer.id)) {
      followEvents(session.id);
      const turn = latestTurn(session.id);
      if (turn && !turn.ended_at && turn.state !== "answered") followTurn(session.id, turn.id);
    }
  }
  publish("dramas", "inbox");
}

export function tick(): void {
  for (const drama of all<DramaRow>("select * from dramas where status in ('setup', 'production')")) {
    if (drama.status === "setup") ensureSetup(drama);
    else fill(drama);
  }
  for (const computer of runningComputers()) tend(computer);
  for (const turn of unsavedTurns()) if (!isFollowed(turn.id)) followTurn(turn.session_id, turn.id);
  for (const key of unconfirmedRuns()) once(`run:${key}`, () => sendRun(key));
}

const clock = globalThis as typeof globalThis & { __studioClock?: NodeJS.Timeout[] };

export function startClock(intervalMs = 2_000): void {
  if (clock.__studioClock) return;
  let reconciling = false;
  const reconcileNow = () => {
    if (reconciling) return;
    reconciling = true;
    reconcile()
      .catch((error) => console.error("reconcile:", (error as Error).message))
      .finally(() => (reconciling = false));
  };
  reconcileNow();
  const ticking = setInterval(() => {
    try {
      tick();
    } catch (error) {
      console.error("tick:", (error as Error).message);
    }
  }, intervalMs);
  const reconciliation = setInterval(reconcileNow, 60_000);
  reconciliation.unref();
  clock.__studioClock = [ticking, reconciliation];
}

export function stopClock(): void {
  for (const timer of clock.__studioClock ?? []) clearInterval(timer);
  clock.__studioClock = undefined;
}
