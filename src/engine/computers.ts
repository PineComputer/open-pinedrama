// A drama's Computers and their sessions: create, start, stop, open and close, with the
// records saved around each call the way Pine's best practices ask. Credentials are saved
// before Create; one lifecycle action runs at a time per Computer.
import { IDLE_WORKING_S } from "./config.ts";
import { all, get, newId, now, run } from "./db.ts";
import type { ComputerRef, Fleet, SessionRef } from "./fleet.ts";
import { publish } from "./live.ts";
import { type ComputerRow, type SessionRow, computer as computerRow, openSessionsOf } from "./records.ts";
import { seal, unseal } from "./seal.ts";

let fleetRef: Fleet | undefined;

/**
 * Uses a fleet from now on. Computers another fleet made are out of its reach, so they
 * are marked stopped (replay's vanish anyway; the maker stops Pine's before switching).
 */
export function setFleet(fleet: Fleet | undefined): void {
  fleetRef = fleet;
  const others = all<ComputerRow>("select * from computers where state in ('starting', 'running', 'stopping') and mode != ?", fleet?.mode ?? "");
  for (const row of others) markStopped(row, fleet ? `The studio switched to ${fleet.mode === "pine" ? "your Pine project" : "replay"}.` : "The studio was disconnected from Pine.");
}

export function hasFleet(): boolean {
  return fleetRef !== undefined;
}

export function fleet(): Fleet {
  if (!fleetRef) throw new Error("Connect a Pine project first.");
  return fleetRef;
}

export function computerRef(row: ComputerRow): ComputerRef {
  if (!row.binding) throw new Error(`${row.label} isn't running.`);
  return { id: row.id, credentials: unseal(row.credentials), binding: unseal(row.binding) };
}

export function sessionRef(row: SessionRow): SessionRef {
  if (!row.token) throw new Error("This session has no token.");
  return { name: row.name, token: unseal(row.token) };
}

const locks = new Map<string, Promise<unknown>>();

/** Runs lifecycle actions on one Computer one at a time. */
export function serialized<T>(computerId: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(computerId) ?? Promise.resolve();
  const next = previous.then(action, action);
  locks.set(
    computerId,
    next.catch(() => undefined),
  );
  return next;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A new Computer for a drama. Resolves once it runs; its row says "starting" meanwhile. */
export async function provision(dramaId: string): Promise<void> {
  const count = get<{ n: number }>("select count(*) as n from computers where drama_id = ?", dramaId)?.n ?? 0;
  const label = `PC-${count + 1}`;
  const { id, credentials } = await fleet().newCredentials();
  run(
    "insert into computers (id, drama_id, mode, label, credentials, state, idle_timeout, created_at, updated_at) values (?, ?, ?, ?, ?, 'starting', ?, ?, ?)",
    id,
    dramaId,
    fleet().mode,
    label,
    seal(credentials),
    IDLE_WORKING_S,
    now(),
    now(),
  );
  publish(`drama:${dramaId}`);
  await serialized(id, async () => {
    try {
      const attached = await fleet().createComputer(credentials, label, IDLE_WORKING_S);
      run("update computers set binding = ?, revision = ?, state = 'running', last_error = null, updated_at = ? where id = ?", seal(attached.binding), attached.revision, now(), id);
    } catch (error) {
      run("update computers set state = 'failed', last_error = ?, updated_at = ? where id = ?", message(error), now(), id);
    }
  });
  publish(`drama:${dramaId}`);
}

/** Starts a stopped Computer of the drama again, from its saved credentials. */
export async function restart(row: ComputerRow): Promise<void> {
  run("update computers set state = 'starting', updated_at = ? where id = ?", now(), row.id);
  publish(`drama:${row.drama_id}`);
  await serialized(row.id, async () => {
    try {
      const attached = await fleet().startComputer(unseal(row.credentials), IDLE_WORKING_S);
      run(
        "update computers set binding = ?, revision = ?, state = 'running', idle_timeout = ?, last_error = null, updated_at = ? where id = ?",
        seal(attached.binding),
        attached.revision,
        IDLE_WORKING_S,
        now(),
        row.id,
      );
    } catch (error) {
      run("update computers set state = 'failed', last_error = ?, updated_at = ? where id = ?", message(error), now(), row.id);
    }
  });
  publish(`drama:${row.drama_id}`);
}

/**
 * The Computer is gone: its sessions end with it, and the work they held stops. Episodes
 * and reviews that depended on them say so; nothing claims their files or turns survive.
 */
export function markStopped(row: ComputerRow, why: string): void {
  const sessions = openSessionsOf(row.id);
  run("update computers set state = 'stopped', binding = null, updated_at = ? where id = ?", now(), row.id);
  for (const session of sessions) {
    run("update sessions set state = 'lost', closed_at = ? where id = ?", now(), session.id);
    run("update reviews set state = 'ended' where session_id = ? and state in ('saving', 'open', 'sending')", session.id);
    if (session.episode_id) {
      run(
        "update episodes set state = 'stopped', note = ?, updated_at = ? where id = ? and state in ('working', 'waiting')",
        why,
        now(),
        session.episode_id,
      );
    }
  }
  publish(`drama:${row.drama_id}`, "inbox", "dramas");
}

export async function stop(row: ComputerRow): Promise<void> {
  run("update computers set state = 'stopping', updated_at = ? where id = ?", now(), row.id);
  publish(`drama:${row.drama_id}`);
  await serialized(row.id, async () => {
    try {
      if (row.binding) await fleet().stop(computerRef(row));
    } finally {
      markStopped({ ...row, state: "stopping" }, "Its Computer was stopped.");
    }
  });
}

export async function openSession(row: ComputerRow, role: "setup" | "episode", episodeId: string | null, label: string): Promise<SessionRow> {
  return serialized(row.id, async () => {
    const created = await fleet().createSession(computerRef(computerRow(row.id) ?? row), label);
    const id = newId("ses");
    run(
      "insert into sessions (id, computer_id, drama_id, name, token, role, episode_id, state, created_at) values (?, ?, ?, ?, ?, ?, ?, 'open', ?)",
      id,
      row.id,
      row.drama_id,
      created.name,
      seal(created.token),
      role,
      episodeId,
      now(),
    );
    return get<SessionRow>("select * from sessions where id = ?", id)!;
  });
}

export async function closeSession(session: SessionRow): Promise<void> {
  run("update sessions set state = 'closed', closed_at = ? where id = ?", now(), session.id);
  const row = computerRow(session.computer_id);
  if (!row?.binding) return;
  await serialized(row.id, () => fleet().closeSession(computerRef(row), session.name)).catch(() => undefined);
}

export async function setIdle(row: ComputerRow, seconds: number): Promise<void> {
  await serialized(row.id, () => fleet().setIdleTimeout(computerRef(row), seconds));
  run("update computers set idle_timeout = ?, updated_at = ? where id = ?", seconds, now(), row.id);
}

export function runningComputers(dramaId?: string): ComputerRow[] {
  return dramaId
    ? all<ComputerRow>("select * from computers where drama_id = ? and state = 'running' order by created_at", dramaId)
    : all<ComputerRow>("select * from computers where state = 'running' order by created_at");
}
