// Where a drama's project stands, as drama-cli's own status report says (each stop returns it
// as handoff/status.json, goals.ts RETURN_STATUS). The studio reads the work's state from here
// and never works it out again from file names: the report is drama-cli's, so is every fact in
// it. Its shape is drama-cli's `status` (drama_cli/stages.py, `status`, v0.7.4); a report that
// doesn't read that way is refused, naming the field, rather than filled in.

/** One of drama-cli's stages: its versions, and whether what it holds can be used downstream. */
export interface StageStatus {
  /** The working version, vN or tNN. */
  current: string | null;
  /** A version made and not yet judged. */
  candidate: string | null;
  accepted: string | null;
  /** Whether the stage can be used as input downstream (drama-cli's `usable`, D133). */
  usable: boolean;
  /** Why not, when it can't. */
  why?: string;
  /** The steps that make it usable, in order, as drama-cli prints them. */
  run: string[];
  /** What drama-cli could not read about the stage, in its words. */
  errors: string[];
}

export interface BibleStatus extends StageStatus {
  /** How many episodes the working bible covers, and the next range's command or why it can't be written. */
  coverage?: { episodes: number; next?: string; blocked?: string };
}

/** A shared reference an episode's accepted breakdown needs and can't use yet, with the steps that fix it. */
export interface Need {
  reference: string;
  path: string;
  why: string;
  run: string[];
  segments: string[];
}

export interface Take {
  version: string;
  /** The video job's state, as drama-cli records it (submitted, running, downloaded, failed, ...). */
  state: string;
  accepted: boolean;
}

export interface EpisodeStatus {
  breakdown: StageStatus;
  /** The episode's edit: its cuts. */
  cut: StageStatus;
  /** The compiled video requests: never accepted, judged request by request. */
  videoPrompts: { current: string | null; stale: string[] };
  blocking: Record<string, StageStatus>;
  firstFrames: Record<string, StageStatus>;
  /** Each segment's storyboards, by style (line-art, photoreal). */
  storyboards: Record<string, Record<string, StageStatus>>;
  /** Each segment's takes. */
  segments: Record<string, StageStatus & { takes: Take[] }>;
  /** Which segments are shot in order, scene by scene, from the working breakdown. */
  sceneChains: { sceneHeading: string; segments: string[] }[];
  /** Listed only once the breakdown is usable. */
  needs?: Need[];
  errors: string[];
}

export interface Budget {
  /** null: no cap. */
  budgetUsd: number | null;
  spentUsd: number;
  reservedUsd: number;
  /** null when there is no cap. */
  remainingUsd: number | null;
}

export interface ProjectState {
  preset: string;
  bible: BibleStatus;
  characters: Record<string, StageStatus & { looks: Record<string, StageStatus> }>;
  locations: Record<string, StageStatus & { times: Record<string, StageStatus> }>;
  props: Record<string, StageStatus>;
  episodes: Record<string, EpisodeStatus>;
  budget: Budget;
}

/** A report that doesn't read as drama-cli writes it: which field, and what it should have been. */
export class StatusError extends Error {
  constructor(readonly field: string, expected: string) {
    super(`drama-cli's status report: ${field || "the report"} should be ${expected}.`);
  }
}

type Raw = Record<string, unknown>;

function object(value: unknown, field: string): Raw {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new StatusError(field, "an object");
  return value as Raw;
}

function at(raw: Raw, key: string, field: string): unknown {
  if (!(key in raw)) throw new StatusError(join(field, key), "present");
  return raw[key];
}

function join(field: string, key: string): string {
  return field ? `${field}.${key}` : key;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new StatusError(field, "text");
  return value;
}

function version(value: unknown, field: string): string | null {
  return value === null ? null : text(value, field);
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new StatusError(field, "a number");
  return value;
}

function flag(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new StatusError(field, "true or false");
  return value;
}

function texts(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new StatusError(field, "a list");
  return value.map((item, n) => text(item, `${field}.${n}`));
}

function each<T>(value: unknown, field: string, read: (item: unknown, field: string) => T): Record<string, T> {
  const raw = object(value, field);
  return Object.fromEntries(Object.keys(raw).map((key) => [key, read(raw[key], join(field, key))]));
}

/** The stage's own fields; the *_error ones are what drama-cli couldn't read, kept as it said them. */
function stage(value: unknown, field: string): StageStatus {
  const raw = object(value, field);
  const errors = ["current", "candidate", "accepted", "usable"].flatMap((key) => (`${key}_error` in raw ? [text(raw[`${key}_error`], join(field, `${key}_error`))] : []));
  const result: StageStatus = {
    current: version(at(raw, "current", field), join(field, "current")),
    candidate: version(at(raw, "candidate", field), join(field, "candidate")),
    accepted: version(at(raw, "accepted", field), join(field, "accepted")),
    usable: flag(at(raw, "usable", field), join(field, "usable")),
    run: "run" in raw ? texts(raw.run, join(field, "run")) : [],
    errors,
  };
  if ("why" in raw) result.why = text(raw.why, join(field, "why"));
  return result;
}

function bible(value: unknown, field: string): BibleStatus {
  const result: BibleStatus = stage(value, field);
  const raw = object(value, field);
  if ("coverage" in raw) {
    const coverage = object(raw.coverage, join(field, "coverage"));
    const place = join(field, "coverage");
    result.coverage = { episodes: number(at(coverage, "episodes", place), join(place, "episodes")) };
    if ("next" in coverage) result.coverage.next = text(coverage.next, join(place, "next"));
    if ("blocked" in coverage) result.coverage.blocked = text(coverage.blocked, join(place, "blocked"));
  }
  return result;
}

/** A reference with its inner stages: a character's further looks (states/), a location's time plates (times/). */
function withInner<K extends string>(inner: string, as: K) {
  return (value: unknown, field: string) => {
    const raw = object(value, field);
    return { ...stage(value, field), [as]: inner in raw ? each(raw[inner], join(field, inner), stage) : {} } as StageStatus & Record<K, Record<string, StageStatus>>;
  };
}

function need(value: unknown, field: string): Need {
  const raw = object(value, field);
  return {
    reference: text(at(raw, "reference", field), join(field, "reference")),
    path: text(at(raw, "path", field), join(field, "path")),
    why: text(at(raw, "why", field), join(field, "why")),
    run: texts(at(raw, "run", field), join(field, "run")),
    segments: texts(at(raw, "segments", field), join(field, "segments")),
  };
}

function take(value: unknown, field: string): Take {
  const raw = object(value, field);
  return {
    version: text(at(raw, "version", field), join(field, "version")),
    state: text(at(raw, "state", field), join(field, "state")),
    accepted: flag(at(raw, "accepted", field), join(field, "accepted")),
  };
}

function episode(value: unknown, field: string): EpisodeStatus {
  const raw = object(value, field);
  const prompts = object(at(raw, "video_prompts", field), join(field, "video_prompts"));
  const promptsField = join(field, "video_prompts");
  const errors = ["scene_chains_error", "needs_error"].flatMap((key) => (key in raw ? [text(raw[key], join(field, key))] : []));
  if ("current_error" in prompts) errors.push(text(prompts.current_error, join(promptsField, "current_error")));
  const result: EpisodeStatus = {
    breakdown: stage(at(raw, "breakdown", field), join(field, "breakdown")),
    cut: stage(at(raw, "edit", field), join(field, "edit")),
    videoPrompts: {
      current: version(at(prompts, "current", promptsField), join(promptsField, "current")),
      stale: "stale" in prompts ? texts(prompts.stale, join(promptsField, "stale")) : [],
    },
    blocking: each(at(raw, "blocking", field), join(field, "blocking"), stage),
    firstFrames: each(at(raw, "first_frame_reference", field), join(field, "first_frame_reference"), stage),
    storyboards: each(at(raw, "multi_panel_storyboard", field), join(field, "multi_panel_storyboard"), (styles, place) => each(styles, place, stage)),
    segments: each(at(raw, "segments", field), join(field, "segments"), (segment, place) => {
      const takes = at(object(segment, place), "takes", place);
      if (!Array.isArray(takes)) throw new StatusError(join(place, "takes"), "a list");
      return { ...stage(segment, place), takes: takes.map((item, n) => take(item, join(place, `takes.${n}`))) };
    }),
    sceneChains: [],
    errors,
  };
  if ("scene_chains" in raw) {
    const chains = raw.scene_chains;
    const place = join(field, "scene_chains");
    if (!Array.isArray(chains)) throw new StatusError(place, "a list");
    result.sceneChains = chains.map((chain, n) => {
      const item = object(chain, `${place}.${n}`);
      return { sceneHeading: text(at(item, "scene_heading", `${place}.${n}`), `${place}.${n}.scene_heading`), segments: texts(at(item, "segments", `${place}.${n}`), `${place}.${n}.segments`) };
    });
  }
  if ("needs" in raw) {
    const needs = raw.needs;
    const place = join(field, "needs");
    if (!Array.isArray(needs)) throw new StatusError(place, "a list");
    result.needs = needs.map((item, n) => need(item, `${place}.${n}`));
  }
  return result;
}

function budget(value: unknown): Budget {
  const raw = object(value, "budget");
  const cap = at(raw, "budget_usd", "budget");
  const remaining = at(raw, "remaining_usd", "budget");
  return {
    budgetUsd: cap === null ? null : number(cap, "budget.budget_usd"),
    spentUsd: number(at(raw, "spent_usd", "budget"), "budget.spent_usd"),
    reservedUsd: number(at(raw, "reserved_usd", "budget"), "budget.reserved_usd"),
    remainingUsd: remaining === null ? null : number(remaining, "budget.remaining_usd"),
  };
}

/** drama-cli's status report, parsed JSON, read into the project's state. */
export function parseStatus(report: unknown): ProjectState {
  const raw = object(report, "");
  return {
    preset: text(at(raw, "preset", ""), "preset"),
    bible: bible(at(raw, "bible", ""), "bible"),
    characters: each(at(raw, "characters", ""), "characters", withInner("states", "looks")),
    locations: each(at(raw, "scenes", ""), "scenes", withInner("times", "times")),
    props: each(at(raw, "props", ""), "props", stage),
    episodes: each(at(raw, "episodes", ""), "episodes", episode),
    budget: budget(at(raw, "budget", "")),
  };
}
