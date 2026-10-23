// The studio's rows, typed, and the small queries several modules share.
import type { DramaStatus, EpisodeState, Mode, ReviewKind, ReviewState } from "../shared/types.ts";
import { all, get } from "./db.ts";

export interface DramaRow {
  id: string;
  title: string;
  language: string;
  look: string;
  format: string;
  parallel: number;
  per_computer: number;
  notes: string;
  /** Where its work runs: a replay drama never starts Pine Computers, and a Pine drama never plays in replay. */
  mode: Mode;
  status: DramaStatus;
  note: string;
  continues: number;
  created_at: string;
  updated_at: string;
}

export interface EpisodeRow {
  id: string;
  drama_id: string;
  number: number;
  title: string;
  state: EpisodeState;
  session_id: string | null;
  note: string;
  resume: number;
  carry: string;
  continues: number;
  updated_at: string;
}

export interface ComputerRow {
  id: string;
  drama_id: string;
  mode: Mode;
  label: string;
  credentials: string;
  binding: string | null;
  revision: string | null;
  state: "starting" | "running" | "stopping" | "stopped" | "failed";
  idle_timeout: number | null;
  last_error: string | null;
  failures: number;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  computer_id: string;
  drama_id: string;
  name: string;
  token: string | null;
  role: "setup" | "episode";
  episode_id: string | null;
  state: "open" | "closed" | "lost";
  task_id: string | null;
  cursor: string | null;
  activity: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface TurnRow {
  id: string;
  session_id: string;
  state: string;
  question: string;
  summary: string;
  files_saved: number;
  settled: number;
  save_error: string | null;
  cost: number | null;
  next_turn_id: string | null;
  created_at: string;
  ended_at: string | null;
}

export interface ReviewRow {
  id: string;
  drama_id: string;
  episode_id: string | null;
  session_id: string;
  turn_id: string;
  kind: ReviewKind;
  state: ReviewState;
  question: string;
  decision: string | null;
  answer: string | null;
  created_at: string;
  decided_at: string | null;
}

export const drama = (id: string) => get<DramaRow>("select * from dramas where id = ?", id);
export const episode = (id: string) => get<EpisodeRow>("select * from episodes where id = ?", id);
export const computer = (id: string) => get<ComputerRow>("select * from computers where id = ?", id);
export const session = (id: string) => get<SessionRow>("select * from sessions where id = ?", id);
export const review = (id: string) => get<ReviewRow>("select * from reviews where id = ?", id);

export function openSessionsOf(computerId: string): SessionRow[] {
  return all<SessionRow>("select * from sessions where computer_id = ? and state = 'open'", computerId);
}

/** The newest turn of a session: the one that can be answered or steered. */
export function latestTurn(sessionId: string): TurnRow | undefined {
  return get<TurnRow>("select * from turns where session_id = ? order by created_at desc, rowid desc limit 1", sessionId);
}

export function episodeCode(row: Pick<EpisodeRow, "number">): string {
  return `EP${String(row.number).padStart(3, "0")}`;
}
