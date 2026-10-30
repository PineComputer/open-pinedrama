// What the agent panel shows, from the project's state (drama-cli's status reports, merged by the
// engine) and the files the stops returned: what is still to do, and where each recent piece of
// work stands. Only facts the reports state; the screens word them in the maker's language.
import type { ProjectState, StageStatus } from "./project.ts";

type State = Omit<ProjectState, "budget">;

/** make: none made; review: made and not accepted; stale: accepted, but no longer usable (drama-cli's usable). */
export type Standing = "make" | "review" | "stale";

export interface ToDoItem {
  /** cast, locations, props; references (what an episode needs from them, as drama-cli names it); or an episode's code. */
  where: string;
  /** An episode's step. */
  step?: "breakdown" | "blocking" | "first-frame" | "storyboard" | "takes" | "cut";
  /** A character, location or prop id; a reference as drama-cli names it; a segment, with its style. */
  subject?: string;
  state: Standing;
}

function standing(stage: StageStatus): Standing | undefined {
  if (stage.usable) return undefined;
  if (stage.current === null) return "make";
  return stage.current !== stage.accepted ? "review" : "stale";
}

/** What is still to do: shared references not usable, what episodes need of them, and each episode's next step. */
export function toDo(state: State): ToDoItem[] {
  const items: ToDoItem[] = [];
  const shared = (where: string, subject: string, stage: StageStatus) => {
    const state = standing(stage);
    if (state) items.push({ where, subject, state });
  };
  for (const [id, character] of Object.entries(state.characters)) {
    shared("cast", id, character);
    for (const [look, stage] of Object.entries(character.looks)) shared("cast", `${id} ${look}`, stage);
  }
  for (const [id, location] of Object.entries(state.locations)) {
    shared("locations", id, location);
    for (const [time, stage] of Object.entries(location.times)) shared("locations", `${id} ${time}`, stage);
  }
  for (const [id, prop] of Object.entries(state.props)) shared("props", id, prop);
  const needed = new Set(Object.values(state.episodes).flatMap((episode) => (episode.needs ?? []).map((need) => need.reference)));
  for (const reference of needed) items.push({ where: "references", subject: reference, state: "make" });
  for (const [code, episode] of Object.entries(state.episodes)) {
    // The steps in the order an episode goes through them; the first that isn't usable is next.
    const steps: [ToDoItem["step"], string | undefined, StageStatus][] = [
      ["breakdown", undefined, episode.breakdown],
      ...Object.entries(episode.blocking).map(([seg, stage]): [ToDoItem["step"], string, StageStatus] => ["blocking", seg, stage]),
      ...Object.entries(episode.firstFrames).map(([seg, stage]): [ToDoItem["step"], string, StageStatus] => ["first-frame", seg, stage]),
      ...Object.entries(episode.storyboards).flatMap(([seg, styles]) => Object.entries(styles).map(([style, stage]): [ToDoItem["step"], string, StageStatus] => ["storyboard", `${seg} ${style}`, stage])),
      ...Object.entries(episode.segments).map(([seg, stage]): [ToDoItem["step"], string, StageStatus] => ["takes", seg, stage]),
      ["cut", undefined, episode.cut],
    ];
    const next = steps.find(([, , stage]) => !stage.usable);
    if (next) items.push({ where: code, step: next[0], ...(next[1] ? { subject: next[1] } : {}), state: standing(next[2])! });
  }
  return items;
}

export type WorkKind = "look" | "location" | "prop" | "breakdown" | "blocking" | "first-frame" | "storyboard" | "take" | "cut";

export interface FileStage {
  /** Where the report keeps it: the path through the project state to its stage. */
  at: string[];
  kind: WorkKind;
  /** What it shows: an id with its look or time, or an episode's code with its segment and style. */
  subject: string;
  /** vN, or tNN for a take. */
  version: string;
}

const V = String.raw`([vt]\d+)`;
const RULES: [RegExp, (m: RegExpMatchArray) => Omit<FileStage, "version">][] = [
  [new RegExp(String.raw`assets/characters/([^/]+)/states/([^/]+)/${V}/`), (m) => ({ at: ["characters", m[1], "looks", m[2]], kind: "look", subject: `${m[1]} ${m[2]}` })],
  [new RegExp(String.raw`assets/characters/([^/]+)/${V}/`), (m) => ({ at: ["characters", m[1]], kind: "look", subject: m[1] })],
  [new RegExp(String.raw`assets/scenes/([^/]+)/times/([^/]+)/${V}/`), (m) => ({ at: ["locations", m[1], "times", m[2]], kind: "location", subject: `${m[1]} ${m[2]}` })],
  [new RegExp(String.raw`assets/scenes/([^/]+)/${V}/`), (m) => ({ at: ["locations", m[1]], kind: "location", subject: m[1] })],
  [new RegExp(String.raw`assets/props/([^/]+)/${V}/`), (m) => ({ at: ["props", m[1]], kind: "prop", subject: m[1] })],
  [new RegExp(String.raw`episodes/(EP\d+)/multi_panel_storyboard/([^/]+)/([^/]+)/${V}/`), (m) => ({ at: ["episodes", m[1], "storyboards", m[2], m[3]], kind: "storyboard", subject: `${m[1]} ${m[2]} ${m[3]}` })],
  [new RegExp(String.raw`episodes/(EP\d+)/blocking/([^/]+)/${V}/`), (m) => ({ at: ["episodes", m[1], "blocking", m[2]], kind: "blocking", subject: `${m[1]} ${m[2]}` })],
  [new RegExp(String.raw`episodes/(EP\d+)/first_frame_reference/([^/]+)/${V}/`), (m) => ({ at: ["episodes", m[1], "firstFrames", m[2]], kind: "first-frame", subject: `${m[1]} ${m[2]}` })],
  [new RegExp(String.raw`episodes/(EP\d+)/segments/([^/]+)/${V}/`), (m) => ({ at: ["episodes", m[1], "segments", m[2]], kind: "take", subject: `${m[1]} ${m[2]}` })],
  [new RegExp(String.raw`episodes/(EP\d+)/edit/${V}/`), (m) => ({ at: ["episodes", m[1], "cut"], kind: "cut", subject: m[1] })],
  [new RegExp(String.raw`episodes/(EP\d+)/breakdown/${V}/`), (m) => ({ at: ["episodes", m[1], "breakdown"], kind: "breakdown", subject: m[1] })],
];

/** The stage a returned file belongs to, by the folders drama-cli keeps its versions in; undefined for any other file. */
export function stageOfFile(path: string): FileStage | undefined {
  for (const [rule, read] of RULES) {
    const m = path.match(rule);
    if (m) return { ...read(m), version: m[m.length - 1] };
  }
  return undefined;
}

function stageAt(state: State, at: string[]): StageStatus | undefined {
  let node: unknown = state;
  for (const key of at) node = node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
  return node as StageStatus | undefined;
}

export interface WorkItem extends FileStage {
  /** accepted: the version the report accepted; review: the working version, not accepted; replaced: an earlier one. */
  state: "accepted" | "review" | "replaced";
  createdAt: string;
}

/** The versions the stops returned, newest first, each once, with where it stands by the report. */
export function recentWork(state: State, files: { path: string; createdAt: string }[], limit = 12): WorkItem[] {
  const seen = new Set<string>();
  const items: WorkItem[] = [];
  for (const file of [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const found = stageOfFile(file.path);
    if (!found) continue;
    const key = `${found.at.join("/")}@${found.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const stage = stageAt(state, found.at);
    const standing = stage?.accepted === found.version ? "accepted" : stage?.current === found.version ? "review" : "replaced";
    items.push({ ...found, state: standing, createdAt: file.createdAt });
    if (items.length === limit) break;
  }
  return items;
}
