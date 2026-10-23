// The production line's clock. Every couple of seconds: start each new drama's setup;
// fill free slots from each drama's episode queue (episodes at once, episodes per Computer,
// and a cap on episodes waiting for the maker); keep idle timeouts long while a session
// waits on the maker; stop Computers with nothing to do; retry what didn't go through.
import { IDLE_WAITING_S, IDLE_WORKING_S, WAITING_CAP } from "./config.ts";
import {
  START_ATTEMPTS,
  allowedIdle,
  closeSession,
  computerRef,
  fleet,
  hasFleet,
  markStopped,
  openSession,
  projectLimits,
  provision,
  refreshLimits,
  restart,
  runningComputers,
  setIdle,
  startable,
  stop,
} from "./computers.ts";
import { all, get, now, run } from "./db.ts";
import { followEvents, followTurn, isFollowed, unsettledTurns } from "./follow.ts";
import { DRAMA_SKILL, episodeGoal, resumeGoal, setupGoal } from "./goals.ts";
import type { FileRow } from "./library.ts";
import { publish } from "./live.ts";
import { type ComputerRow, type DramaRow, type EpisodeRow, type SessionRow, computer as computerRow, episodeCode, latestTurn, openSessionsOf } from "./records.ts";
import { reconcileSending } from "./reviews.ts";
import { attach, episodeArchive, hasRun, inputs, projectArchive, references, sendRun, startRun, unconfirmedRuns } from "./runs.ts";

/** Work the clock started and hasn't finished, so a slow call never starts twice. */
const busy = new Set<string>();

/** While the maker disconnects, the clock starts nothing new. */
let paused = false;

export function pause(): void {
  paused = true;
}

export function resume(): void {
  paused = false;
}

/** Resolves once the work the clock started has finished, or after a minute. */
export async function drain(): Promise<void> {
  const until = Date.now() + 60_000;
  while (busy.size && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 200));
}

function once(key: string, work: () => Promise<void>): boolean {
  if (busy.has(key)) return false;
  busy.add(key);
  void work()
    .catch((error) => console.error(`${key}:`, (error as Error).message))
    .finally(() => busy.delete(key));
  return true;
}

/** Work that failed lately (an episode's start, a setup's, a run's resend), so it waits before it's tried again. */
const failures = new Map<string, { count: number; at: number }>();

/** Whether failed work still waits: 15 s after the first failure, doubling, at most 5 minutes. */
function backingOff(key: string): boolean {
  const failed = failures.get(key);
  return failed !== undefined && Date.now() - failed.at < Math.min(5 * 60_000, 15_000 * 2 ** (failed.count - 1));
}

/** Counts a failure; returns how many in a row. */
function failedAgain(key: string): number {
  const count = (failures.get(key)?.count ?? 0) + 1;
  failures.set(key, { count, at: Date.now() });
  return count;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

/** New Computers asked for whose rows aren't saved yet (their credentials are being made): they count against the limit too. */
let provisioning = 0;

/** Whether the studio already has as many Computers going as the project allows. */
export function atProjectLimit(): boolean {
  const max = projectLimits().maxComputers;
  if (max === null) return false;
  const live = get<{ n: number }>("select count(*) as n from computers where mode = ? and state in ('starting', 'running', 'stopping')", fleet().mode)?.n ?? 0;
  return live + provisioning >= max;
}

/**
 * A Computer the drama can use soon: a free running one, or one it starts now (while the
 * project allows another; otherwise the work waits its turn). A stopped or
 * failed one is started again before any new one is made, so a Create whose answer was
 * lost is retried as the same Computer; one that keeps failing waits for the maker.
 */
function claimComputer(drama: DramaRow): ComputerRow | undefined {
  const free = freeComputer(drama);
  if (free) return free;
  const pool = all<ComputerRow>("select * from computers where drama_id = ? and mode = ? and state in ('starting', 'running', 'stopping')", drama.id, drama.mode);
  if (pool.some((computer) => computer.state === "starting")) return undefined;
  if (pool.length >= capacity(drama) || atProjectLimit()) return undefined;
  const idle = all<ComputerRow>("select * from computers where drama_id = ? and mode = ? and state in ('stopped', 'failed') order by created_at", drama.id, drama.mode);
  if (idle.length) {
    const next = idle.find(startable);
    if (next) once(`start:${drama.id}`, () => restart(next));
    return undefined;
  }
  if (busy.has(`start:${drama.id}`)) return undefined;
  provisioning += 1;
  once(`start:${drama.id}`, () => provision(drama.id).finally(() => (provisioning -= 1)));
  return undefined;
}

/**
 * Whether the session's Computer offers Pine's drama skill. Without it the agent would make
 * up a drama of its own at the project's expense. The skill comes with the project, so the
 * setup's Computer answers for every Computer the drama uses after it. One that can't list
 * its skills (an older release) isn't held back on that account.
 */
async function offersDramaSkill(session: SessionRow): Promise<boolean> {
  const computer = computerRow(session.computer_id);
  if (!computer?.binding) return true;
  try {
    return (await fleet().skills(computerRef(computer))).includes(DRAMA_SKILL);
  } catch (error) {
    console.error("skills:", message(error));
    return true;
  }
}

/** Hands the setup session the screenplay and its goal: on a new session, or again on one whose start didn't finish. */
async function beginSetup(drama: DramaRow, session: SessionRow): Promise<void> {
  if (!(await offersDramaSkill(session))) {
    run("update dramas set status = 'stopped', reason = 'no-drama-skill', note = '', updated_at = ? where id = ?", now(), drama.id);
    await closeSession(session);
    publish(`drama:${drama.id}`, "dramas");
    return;
  }
  const { sent } = await attach(session, inputs(drama.id));
  await startRun(session, "setup", setupGoal(drama, sent));
}

/**
 * A setup that didn't start is tried again, a few times, then the drama stops and says why.
 * A session it half opened is let go, so its Computer can stop.
 */
function setupFailed(drama: DramaRow, error: unknown): void {
  const key = `setup:${drama.id}`;
  if (failedAgain(key) < START_ATTEMPTS) return;
  failures.delete(key);
  run("update dramas set status = 'stopped', note = ?, updated_at = ? where id = ?", message(error), now(), drama.id);
  const open = get<SessionRow>("select * from sessions where drama_id = ? and role = 'setup' and state = 'open'", drama.id);
  if (open && !hasRun(open.id)) void closeSession(open);
}

function ensureSetup(drama: DramaRow): void {
  const key = `setup:${drama.id}`;
  if (backingOff(key)) return;
  const open = get<SessionRow>("select * from sessions where drama_id = ? and role = 'setup' and state = 'open'", drama.id);
  if (open) {
    if (!hasRun(open.id)) {
      once(key, () =>
        beginSetup(drama, open)
          .then(() => void failures.delete(key))
          .catch((error) => {
            setupFailed(drama, error);
            throw error;
          })
          .finally(() => publish(`drama:${drama.id}`)),
      );
    }
    return;
  }
  const computer = claimComputer(drama);
  if (!computer) return;
  const release = reserve(computer.id);
  const started = once(`setup:${drama.id}`, async () => {
    try {
      const session = await openSession(computer, "setup", null, "Setup");
      release();
      await beginSetup(drama, session);
      failures.delete(key);
    } catch (error) {
      setupFailed(drama, error);
      throw error;
    } finally {
      release();
      publish(`drama:${drama.id}`);
    }
  });
  if (!started) release();
}

function startEpisode(drama: DramaRow, episode: EpisodeRow, computer: ComputerRow): void {
  run("update episodes set state = 'working', note = case when resume = 1 then note else '' end, updated_at = ? where id = ?", now(), episode.id);
  const release = reserve(computer.id);
  const started = once(`episode:${episode.id}`, async () => {
    let session: SessionRow | undefined;
    try {
      const code = episodeCode(episode);
      session = await openSession(computer, "episode", episode.id, code);
      release();
      run("update episodes set session_id = ?, updated_at = ? where id = ?", session.id, now(), episode.id);
      // The project pre-production handed over, and on a resume the episode's own packed folder;
      // a drama set up before pre-production existed gets its references as loose files.
      const project = projectArchive(drama.id);
      const handoff = project.length > 0;
      let files: FileRow[] = handoff ? project : [...inputs(drama.id), ...references(drama.id)];
      if (episode.resume) {
        const own = handoff ? episodeArchive(episode.id) : [];
        files = [...files, ...(own.length || handoff ? own : all<FileRow>("select * from files where episode_id = ? and kind != 'observation' order by id", episode.id))];
      }
      const { sent, skipped } = await attach(session, files);
      if (skipped.length) console.warn(`${code}: too large to hand over (over 64 MiB): ${skipped.join(", ")}`);
      const goal = episode.resume
        ? resumeGoal(drama, code, sent, handoff, episode.carry || undefined)
        : episodeGoal(drama, code, sent, handoff);
      await startRun(session, episode.resume ? "resume" : "episode", goal);
      run("update episodes set resume = 0, carry = '', continues = 0, note = '', updated_at = ? where id = ?", now(), episode.id);
      failures.delete(episode.id);
    } catch (error) {
      // A run that was saved is resent with its own key (unconfirmedRuns), so the episode keeps
      // its session. Before that, the half-opened session is let go and the episode waits its
      // turn again, after a pause; one that won't start after a few tries waits for the maker.
      if (!session || !hasRun(session.id)) {
        if (session) await closeSession(session);
        if (failedAgain(episode.id) >= START_ATTEMPTS) {
          failures.delete(episode.id);
          run("update episodes set state = 'failed', note = ?, session_id = null, updated_at = ? where id = ?", message(error), now(), episode.id);
        } else {
          run("update episodes set state = 'queued', session_id = null, updated_at = ? where id = ?", now(), episode.id);
        }
      }
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
    if (backingOff(episode.id)) continue;
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

/** Computers whose idle timeout Pine refused to change, and when to ask again. */
const idleRefused = new Map<string, number>();

/**
 * A Computer waiting on the maker keeps running longer, within what the project allows; one
 * with nothing to do stops (and a stop that failed is tried again a minute later).
 */
function tend(computer: ComputerRow): void {
  const sessions = openSessionsOf(computer.id);
  const waiting = sessions.some((session) => latestTurn(session.id)?.state === "needs_input");
  const desired = allowedIdle(waiting ? IDLE_WAITING_S : IDLE_WORKING_S);
  if (projectLimits().idleAdjustable && computer.idle_timeout !== desired && (idleRefused.get(computer.id) ?? 0) < Date.now()) {
    once(`idle:${computer.id}`, () =>
      setIdle(computer, desired).catch((error) => {
        idleRefused.set(computer.id, Date.now() + 10 * 60_000);
        throw error;
      }),
    );
  }
  if (!sessions.length) {
    const drama = get<DramaRow>("select * from dramas where id = ?", computer.drama_id);
    const queued = get<{ n: number }>("select count(*) as n from episodes where drama_id = ? and state = 'queued'", computer.drama_id)?.n ?? 0;
    const triedLately = computer.last_error !== null && Date.now() - Date.parse(computer.updated_at) < 60_000;
    if (drama && drama.status !== "setup" && !queued && !opening.get(computer.id) && !triedLately) once(`stop:${computer.id}`, () => stop(computer));
  }
}

/** Every saved Computer against Pine: those that stopped are marked so; running turns are followed again. */
export async function reconcile(): Promise<void> {
  if (!hasFleet()) return;
  await refreshLimits().catch((error) => console.error("project limits:", (error as Error).message));
  for (const computer of all<ComputerRow>("select * from computers where state in ('running', 'starting', 'stopping') and mode = ?", fleet().mode)) {
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
    // A stop that was still shutting down when the engine went away, but didn't: tend tries again.
    if (computer.state === "stopping") run("update computers set state = 'running', updated_at = ? where id = ?", now(), computer.id);
    for (const session of openSessionsOf(computer.id)) {
      followEvents(session.id);
      const turn = latestTurn(session.id);
      if (turn && !turn.ended_at && turn.state !== "answered") followTurn(session.id, turn.id);
    }
  }
  await reconcileSending();
  publish("dramas", "inbox");
}

export function tick(): void {
  if (!hasFleet() || paused) return; // nothing to run on until the maker connects a project or chooses replay
  // Only the dramas made for this mode: a replay drama never starts a Pine Computer.
  for (const drama of all<DramaRow>("select * from dramas where status in ('setup', 'production') and mode = ?", fleet().mode)) {
    if (drama.status === "setup") ensureSetup(drama);
    else fill(drama);
  }
  for (const computer of runningComputers()) tend(computer);
  for (const turn of unsettledTurns()) if (!isFollowed(turn.id)) followTurn(turn.session_id, turn.id);
  for (const key of unconfirmedRuns()) {
    // Resent with the same key until Pine confirms it, pausing longer after each failure.
    if (backingOff(`run:${key}`)) continue;
    once(`run:${key}`, () =>
      sendRun(key).then(
        () => void failures.delete(`run:${key}`),
        (error) => {
          failedAgain(`run:${key}`);
          throw error;
        },
      ),
    );
  }
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
