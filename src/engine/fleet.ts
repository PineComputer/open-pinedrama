// The Pine Computer calls the studio makes, in one place. Pine's SDK backs them in pine
// mode (pine-fleet.ts); recorded turns back them in replay mode (replay-fleet.ts), for
// development, tests and demos without a project key or any spend.
import type { Mode } from "../shared/types.ts";

/** What the studio keeps to reach a Computer, unsealed for the duration of a call. */
export interface ComputerRef {
  id: string;
  credentials: string;
  binding: string;
}

export interface SessionRef {
  name: string;
  token: string;
}

export interface TurnFile {
  path: string;
  size: number;
  sha256: string;
  type: string;
}

export interface TurnInfo {
  turnId: string;
  /** running | canceling | needs_input | answered | completed | failed | canceled */
  state: string;
  question: string;
  summary: string;
  nextTurnId: string;
  files: TurnFile[];
  /** Pine's rated cost of the turn, or null where it couldn't price it. */
  cost: number | null;
}

export interface FleetEvent {
  id: string;
  taskId: string;
  turnId: string;
  kind: "input" | "progress" | "activity" | "result";
  text: string;
  /** For activity: the step's id, to update its row in place. */
  ref?: string;
  state?: string;
}

export interface Attached {
  binding: string;
  revision: string;
}

export interface Fleet {
  readonly mode: Mode;
  /** New Computer credentials, to save before Create: they are the only way to start it again. */
  newCredentials(): Promise<{ id: string; credentials: string }>;
  createComputer(credentials: string, label: string, idleTimeoutSeconds: number): Promise<Attached>;
  /** Starts the Computer these credentials name; creates it if Pine never registered it (a Create whose answer was lost). */
  startComputer(credentials: string, label: string, idleTimeoutSeconds: number): Promise<Attached>;
  /** running, paused, stopped, failed…; "stopped" when Pine no longer knows the sandbox. */
  status(computer: ComputerRef): Promise<string>;
  setIdleTimeout(computer: ComputerRef, seconds: number): Promise<void>;
  stop(computer: ComputerRef): Promise<boolean>;
  createSession(computer: ComputerRef, label: string): Promise<SessionRef>;
  closeSession(computer: ComputerRef, name: string): Promise<void>;
  writeFile(computer: ComputerRef, session: SessionRef, name: string, content: Uint8Array): Promise<void>;
  run(computer: ComputerRef, session: SessionRef, goal: string, key: string, maxWallMs?: number): Promise<TurnInfo>;
  wait(computer: ComputerRef, session: SessionRef, turnId: string, timeoutMs: number): Promise<TurnInfo>;
  answer(computer: ComputerRef, session: SessionRef, turnId: string, text: string): Promise<TurnInfo>;
  steer(computer: ComputerRef, session: SessionRef, turnId: string, text: string): Promise<void>;
  openFile(computer: ComputerRef, session: SessionRef, path: string): Promise<ReadableStream<Uint8Array>>;
  /** The session's agent events from a cursor, until aborted. */
  events(computer: ComputerRef, session: SessionRef, after: string | undefined, taskId: string | undefined, signal: AbortSignal): AsyncIterable<FleetEvent>;
  /** A browser-safe connection to the session's desktop, or null where there is none. */
  desktop(computer: ComputerRef, session: SessionRef): Promise<unknown | null>;
}

export const ENDED = new Set(["needs_input", "completed", "failed", "canceled"]);
