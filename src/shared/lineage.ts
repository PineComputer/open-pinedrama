// Where each version of a drama's project came from, as drama-cli's own lineage says (each stop
// returns it as handoff/lineage.json, goals.ts RETURN_LINEAGE). Its shape is drama-cli's
// `export comfyui` (short_drama drama_cli/export.py, comfyui, and drama_cli/lineage.py, graph):
// a ComfyUI workflow whose nodes carry each stage in their properties, and a link from each
// picture to the version that used it. The studio draws it and never works out a version's
// freshness again: `fresh` and its `problems` are drama-cli's. An export that doesn't read that
// way is refused, naming the field, rather than filled in.

export type LineageKind =
  | "screenplay"
  | "bible"
  | "look"
  | "plate"
  | "prop"
  | "breakdown"
  | "blocking"
  | "first_frame_reference"
  | "storyboard"
  | "video_prompts"
  | "take"
  | "cut"
  | "subtitles";

/** Who or what a stage is of, from its id, the stage's folder in the project. */
export interface Where {
  episode?: string;
  segment?: string;
  /** A storyboard's style: line-art, photoreal. */
  style?: string;
  /** A character, location or prop id. */
  subject?: string;
  /** A character's further look (states/). */
  look?: string;
  /** A location's time of day (times/). */
  time?: string;
  /** A location's view or floor plan. */
  view?: string;
}

export interface LineageNode {
  /** The stage's folder in the project, drama-cli's id for it. */
  id: string;
  kind: LineageKind;
  /** Its column, in the order of the pipeline. */
  column: number;
  /** The working version, vN or tNN. */
  version: string | null;
  accepted: string | null;
  /** Whether the working version is fresh; null when it has no manifest to judge. */
  fresh: boolean | null;
  /** Why not, or what drama-cli could not read about it, in its words. */
  problems: string[];
  /** The file it shows, relative to the project. */
  shows: string | null;
  /** The text stages its working version read. */
  reads: string[];
  /** drama-cli's short name for it, with ids where the bible has names. */
  label: string;
  where: Where;
}

/** A picture or video one version used, from the stage that made it to the stage that used it. */
export interface LineageLink {
  from: string;
  to: string;
}

export interface Lineage {
  project: string;
  nodes: LineageNode[];
  links: LineageLink[];
}

export class LineageError extends Error {
  constructor(readonly field: string, expected: string) {
    super(`drama-cli's lineage: ${field || "the export"} should be ${expected}.`);
  }
}

// Each kind of stage by its folder: drama_cli/lineage.py, KINDS, with the parts named.
const KINDS: [LineageKind, RegExp, (keyof Where)[]][] = [
  ["screenplay", /^screenplay$/, []],
  ["bible", /^bible$/, []],
  ["look", /^assets\/characters\/([^/]+)(?:\/states\/([^/]+))?$/, ["subject", "look"]],
  ["plate", /^assets\/scenes\/([^/]+)(?:\/times\/([^/]+))?(?:\/([^/]+))?$/, ["subject", "time", "view"]],
  ["prop", /^assets\/props\/([^/]+)$/, ["subject"]],
  ["breakdown", /^episodes\/([^/]+)\/breakdown$/, ["episode"]],
  ["blocking", /^episodes\/([^/]+)\/blocking\/([^/]+)$/, ["episode", "segment"]],
  ["first_frame_reference", /^episodes\/([^/]+)\/first_frame_reference\/([^/]+)$/, ["episode", "segment"]],
  ["storyboard", /^episodes\/([^/]+)\/multi_panel_storyboard\/([^/]+)\/([^/]+)$/, ["episode", "segment", "style"]],
  ["video_prompts", /^episodes\/([^/]+)\/video_prompts$/, ["episode"]],
  ["take", /^episodes\/([^/]+)\/segments\/([^/]+)$/, ["episode", "segment"]],
  ["cut", /^episodes\/([^/]+)\/edit$/, ["episode"]],
  ["subtitles", /^episodes\/([^/]+)\/asr_align$/, ["episode"]],
];

type Raw = Record<string, unknown>;

function object(value: unknown, field: string): Raw {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new LineageError(field, "an object");
  return value as Raw;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new LineageError(field, "a list");
  return value;
}

function at(raw: Raw, key: string, field: string): unknown {
  if (!(key in raw)) throw new LineageError(join(field, key), "present");
  return raw[key];
}

function join(field: string, key: string | number): string {
  return field ? `${field}.${key}` : String(key);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new LineageError(field, "text");
  return value;
}

function maybeText(value: unknown, field: string): string | null {
  return value === null ? null : text(value, field);
}

function texts(value: unknown, field: string): string[] {
  return list(value, field).map((item, n) => text(item, join(field, n)));
}

function where(kind: LineageKind, id: string, field: string): Where {
  const [, pattern, parts] = KINDS.find(([name]) => name === kind)!;
  const match = id.match(pattern);
  if (!match) throw new LineageError(field, `the folder of a ${kind} stage`);
  return Object.fromEntries(parts.flatMap((part, n) => (match[n + 1] === undefined ? [] : [[part, match[n + 1]]])));
}

function lineageNode(value: unknown, field: string): { number: number; node: LineageNode } {
  const raw = object(value, field);
  const number = at(raw, "id", field);
  if (typeof number !== "number") throw new LineageError(join(field, "id"), "a number");
  const place = join(field, "properties");
  const props = object(at(raw, "properties", field), place);
  const kind = text(at(props, "kind", place), join(place, "kind"));
  if (!KINDS.some(([name]) => name === kind)) throw new LineageError(join(place, "kind"), `one of ${KINDS.map(([name]) => name).join(", ")}`);
  const id = text(at(props, "id", place), join(place, "id"));
  const column = at(props, "column", place);
  if (typeof column !== "number" || !Number.isInteger(column) || column < 0) throw new LineageError(join(place, "column"), "a whole number");
  const fresh = at(props, "fresh", place);
  if (fresh !== null && typeof fresh !== "boolean") throw new LineageError(join(place, "fresh"), "true, false or null");
  return {
    number,
    node: {
      id,
      kind: kind as LineageKind,
      column,
      version: maybeText(at(props, "version", place), join(place, "version")),
      accepted: maybeText(at(props, "accepted", place), join(place, "accepted")),
      fresh,
      problems: texts(at(props, "problems", place), join(place, "problems")),
      shows: maybeText(at(props, "shows", place), join(place, "shows")),
      reads: texts(at(props, "reads", place), join(place, "reads")),
      label: text(at(props, "label", place), join(place, "label")),
      where: where(kind as LineageKind, id, join(place, "id")),
    },
  };
}

/** The lineage in an export of drama-cli's, or a LineageError naming what doesn't read. */
export function parseLineage(value: unknown): Lineage {
  const raw = object(value, "");
  const extra = object(at(raw, "extra", ""), "extra");
  const project = text(at(object(at(extra, "drama_cli", "extra"), "extra.drama_cli"), "project", "extra.drama_cli"), "extra.drama_cli.project");
  const read = list(at(raw, "nodes", ""), "nodes").map((item, n) => lineageNode(item, join("nodes", n)));
  const byNumber = new Map(read.map(({ number, node }) => [number, node.id]));
  const ids = new Set(read.map(({ node }) => node.id));
  read.forEach(({ node }, n) =>
    node.reads.forEach((stage, r) => {
      if (!ids.has(stage)) throw new LineageError(join(join("nodes", n), `properties.reads.${r}`), "a stage of the export");
    }),
  );
  // A link is [id, origin node, origin slot, target node, target slot, type] (export.py, comfyui).
  const links = list(at(raw, "links", ""), "links").map((item, n) => {
    const link = list(item, join("links", n));
    const from = byNumber.get(link[1] as number);
    const to = byNumber.get(link[3] as number);
    if (link.length !== 6 || from === undefined || to === undefined) throw new LineageError(join("links", n), "[id, origin node, slot, target node, slot, type] between nodes of the export");
    return { from, to };
  });
  const reads = read.flatMap(({ node }) => node.reads.map((stage) => ({ from: stage, to: node.id })));
  return { project, nodes: read.map(({ node }) => node), links: [...links, ...reads] };
}

/** Every stage a version was made from (up) and every stage made from it (down), however far. */
export function trace(lineage: Lineage, id: string): { up: Set<string>; down: Set<string> } {
  const walk = (start: string, next: (link: LineageLink) => [string, string]) => {
    const found = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const at = queue.shift()!;
      for (const link of lineage.links) {
        const [from, to] = next(link);
        if (from === at && to !== id && !found.has(to)) {
          found.add(to);
          queue.push(to);
        }
      }
    }
    return found;
  };
  return { up: walk(id, (link) => [link.to, link.from]), down: walk(id, (link) => [link.from, link.to]) };
}

/**
 * What was made, however far down, from a version drama-cli calls stale, and that drama-cli
 * itself doesn't: a view of drama-cli's links, never a verdict of the studio's. A take made from
 * a storyboard's unchanged files stays fresh by drama-cli's rule (short_drama #452).
 */
export function madeFromStale(lineage: Lineage): Set<string> {
  const stale = lineage.nodes.filter((node) => node.fresh === false);
  const fresh = new Set(lineage.nodes.filter((node) => node.fresh !== false).map((node) => node.id));
  return new Set(stale.flatMap((node) => [...trace(lineage, node.id).down]).filter((id) => fresh.has(id)));
}

/**
 * One drama's lineage from its sessions' newest exports, as the status reports are merged
 * (engine status.ts, projectView): each episode works on its own copy of the project, so the
 * shared stages come from the setup's export and each episode's from its own sessions', the
 * setup's until one reports. A link comes from the export its user's stage comes from, since
 * that version's manifest records it, and is kept when both its ends are.
 */
export function mergeLineage(base: Lineage, episodes: Record<string, Lineage>): Lineage {
  const sources = [
    { lineage: base, owns: (node: LineageNode) => node.where.episode === undefined || !episodes[node.where.episode] },
    ...Object.entries(episodes).map(([code, lineage]) => ({ lineage, owns: (node: LineageNode) => node.where.episode === code })),
  ];
  const owned = sources.map(({ lineage, owns }) => ({ lineage, nodes: lineage.nodes.filter(owns) }));
  const nodes = owned.flatMap((source) => source.nodes);
  const kept = new Set(nodes.map((node) => node.id));
  const links = owned.flatMap(({ lineage, nodes: mine }) => {
    const users = new Set(mine.map((node) => node.id));
    return lineage.links.filter((link) => users.has(link.to) && kept.has(link.from));
  });
  return { project: base.project, nodes, links };
}
