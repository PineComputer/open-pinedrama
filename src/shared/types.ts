// What the engine and the UI agree on: the shapes the HTTP API returns and accepts.

export type Mode = "pine" | "replay";

/** What went wrong, for the UI to say in the maker's language (src/engine/errors.ts). */
export type ErrorCode =
  | "title-missing"
  | "screenplay-missing"
  | "file-too-large"
  | "not-found"
  | "episode-busy"
  | "drama-not-stopped"
  | "session-ended"
  | "computer-not-running"
  | "message-empty"
  | "question-closed"
  | "decide-in-review"
  | "decision-sending"
  | "review-saving"
  | "review-closed"
  | "answer-missing"
  | "verdicts-missing"
  | "send-failed"
  | "review-not-ended"
  | "setup-restarts"
  | "endpoint-invalid"
  | "key-missing"
  | "key-rejected"
  | "pine-unreachable"
  | "disconnect-first"
  | "stop-failed"
  | "no-mode"
  | "sample-replay-only"
  | "signed-out"
  | "offline"
  | "internal";

/** The body of every failed API call. */
export interface ApiFailure {
  error: string;
  code: ErrorCode;
  detail?: string;
}

/** Where a drama is: casting in its setup session, then episodes in production. */
export type DramaStatus = "setup" | "production" | "done" | "stopped";

export type EpisodeState = "queued" | "working" | "waiting" | "done" | "stopped" | "failed";

/** The steps of an episode, in order, as the board shows them. */
export const STAGES = ["breakdown", "blocking", "storyboards", "takes", "cut"] as const;
export type Stage = (typeof STAGES)[number];

export type FileKind =
  | "screenplay"
  | "bible"
  | "look"
  | "location"
  | "prop"
  | "breakdown"
  | "blocking"
  | "storyboard"
  | "take"
  | "cut"
  | "observation"
  | "other";

/** What a question asks the maker to decide, inferred from its words and its files. */
export type ReviewKind = "looks" | "storyboards" | "takes" | "cut" | "question";

/**
 * saving: the turn's files are still being copied; the question can't be answered yet.
 * open: waiting for the maker. sending: the answer is on its way.
 * answered: the agent has it. ended: the session that asked is gone.
 */
export type ReviewState = "saving" | "open" | "sending" | "answered" | "ended";

export type Verdict = "approve" | "revise";

export interface AppInfo {
  /** "none" until the maker connects a Pine project or chooses the replay. */
  mode: Mode | "none";
  version: string;
  dataDir: string;
  project?: { endpoint: string; keyHint: string; fromEnvironment: boolean };
}

export interface FileItem {
  id: number;
  name: string;
  path: string;
  type: string;
  size: number;
  kind: FileKind;
  episode?: string;
  segment?: string;
  /** The character, location or prop the file shows. */
  subject?: string;
  look?: string;
  /** line-art or photoreal, for storyboards. */
  style?: string;
  version?: string;
  url: string;
  createdAt: string;
}

export interface DramaCard {
  id: string;
  /** Where its work runs; a drama of the other mode waits until the studio is back in its mode. */
  mode: Mode;
  title: string;
  language: string;
  look: string;
  format: string;
  status: DramaStatus;
  episodes: { total: number; done: number; waiting: number; working: number };
  /** Computers running for this drama. */
  computers: number;
  waiting: number;
  /** The leads' sheets, once drawn: the faces on the drama's poster. */
  cast: string[];
  createdAt: string;
}

export interface StageCell {
  state: "none" | "working" | "review" | "done";
  count?: number;
}

export interface EpisodeRow {
  id: string;
  number: number;
  code: string;
  title: string;
  state: EpisodeState;
  stages: Record<Stage, StageCell>;
  /** The agent's own words for what it is doing, while it works. */
  activity?: string;
  /** The agent's own account of why it stopped early. */
  note?: string;
  /** Its newest single frame (blocking first, else a storyboard sheet), once there is one. */
  frame?: string;
  /** Its place in the queue, from 1. */
  position?: number;
  /** What it waits for the maker on; "saving" while the review's files are saved. */
  waitingFor?: ReviewKind | "saving";
  computer?: string;
  reviewId?: string;
  updatedAt: string;
}

export interface SessionView {
  id: string;
  name: string;
  role: "setup" | "episode";
  episode?: string;
  state: "open" | "closed" | "lost";
  activity?: string;
  waiting: boolean;
}

export interface ComputerView {
  id: string;
  label: string;
  state: string;
  idleTimeoutMinutes: number | null;
  sessions: SessionView[];
  lastError?: string;
}

export interface DramaView extends DramaCard {
  notes: string;
  parallel: number;
  perComputer: number;
  setup: { state: "working" | "waiting" | "done" | "stopped"; reviewId?: string; kind?: ReviewKind; hasCast: boolean; activity?: string; note?: string };
  episodeRows: EpisodeRow[];
  crew: ComputerView[];
  /** Its Computers wouldn't start, several times: the line waits for the maker's "try again". */
  stalled?: { computer: string; error: string };
}

export interface CastGroup {
  kind: "look" | "location" | "prop";
  subject: string;
  /** Newest first. */
  files: FileItem[];
}

export interface ReviewSummary {
  id: string;
  dramaId: string;
  dramaTitle: string;
  episode?: string;
  kind: ReviewKind;
  state: ReviewState;
  question: string;
  items: number;
  thumb?: string;
  createdAt: string;
}

/** One thing the maker gives a verdict on: a segment's storyboard, a character's look, a take, the cut. */
export interface ReviewItem {
  key: string;
  label: string;
  files: FileItem[];
}

/** A note pinned to a spot on an image (fractions of its width and height) or a time in a video. */
export interface Note {
  fileId?: number;
  x?: number;
  y?: number;
  time?: number;
  text: string;
}

export interface ItemDecision {
  key: string;
  verdict: Verdict;
  notes: Note[];
}

export interface Decision {
  items: ItemDecision[];
  /** The maker's own words, quoted in the record of what they approved. */
  words: string;
}

export interface ReviewView extends ReviewSummary {
  reviewItems: ReviewItem[];
  otherFiles: FileItem[];
  decision?: Decision;
  answer?: string;
  /** The next review waiting, to move on to after this one. */
  nextId?: string;
}

export interface ChatMessage {
  id: number;
  kind: "input" | "progress" | "activity" | "question" | "answer" | "result";
  text: string;
  at: string;
}

export interface ChatView {
  sessionId: string;
  /** The episode's code; empty for the drama's setup. */
  label: string;
  /**
   * What a message would do now: answer the waiting question, steer the running turn, or
   * start a run. "review" when the agent waits on files the maker decides in their review.
   */
  sends: "answer" | "review" | "steer" | "run" | "none";
  /** The review the agent waits on, if any. */
  reviewId?: string;
  messages: ChatMessage[];
}

export type LiveMessage = { type: "changed"; scope: string } | { type: "hello" };
