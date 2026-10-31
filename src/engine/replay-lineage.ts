// The lineage replay hands back at each stop, as Pine's agent hands back drama-cli's (goals.ts
// RETURN_LINEAGE). Replay has no drama-cli project, so this writes the export its recording
// would have: the parts of drama-cli's `export comfyui` the studio reads (fixtures/lineage),
// with a stage for each thing the recording made at its versions, everything fresh, and a link
// from each picture to what was made from it. Every segment is set at home, as replay's status
// report heads its scenes (replay-status.ts).
import { HEIGHT, layout, WIDTH } from "../shared/layout.ts";
import type { ReplayProgress } from "./replay-status.ts";

interface Stage {
  id: string;
  kind: string;
  column: number;
  version: string | null;
  accepted: string | null;
  reads: string[];
  from: string[];
}

// Each kind's column: drama-cli's lineage.py, KINDS.
const COLUMN: Record<string, number> = { bible: 0, look: 1, plate: 1, prop: 1, breakdown: 2, blocking: 3, storyboard: 4, take: 6, cut: 7 };
const STYLES = ["line-art", "photoreal"];
const PLACE = "assets/scenes/home";
// The files drama-cli shows for a version (drama_cli/lineage.py, SHOWN_SUFFIXES), and replay's own placeholder pictures (SVG).
const SHOWN = /\.(png|jpe?g|webp|svg|mp4|md|srt|fountain)$/i;

/** A shared reference's kind, from its asset path (replay-status.ts, Reference). */
const kindOf = (path: string) => (path.startsWith("assets/characters/") ? "look" : path.startsWith("assets/scenes/") ? "plate" : "prop");

function stages(progress: ReplayProgress): Stage[] {
  const stage = (id: string, kind: string, made: { current: string | null; accepted: string | null }, reads: string[] = [], from: string[] = []): Stage => ({
    id,
    kind,
    column: COLUMN[kind],
    version: made.current,
    accepted: made.accepted,
    reads,
    from,
  });
  const bible = progress.bible ? [stage("bible", "bible", { current: progress.bible, accepted: progress.bible })] : [];
  const reads = bible.length ? ["bible"] : [];
  const leads = Object.entries(progress.looks).map(([id, made]) => stage(`assets/characters/${id}`, "look", made, reads));
  const references = Object.values(progress.references).map((reference) => stage(reference.path, kindOf(reference.path), reference, reads));
  const place = references.some((reference) => reference.id === PLACE) ? [PLACE] : [];
  const looks = leads.map((lead) => lead.id);
  const episodes = Object.entries(progress.episodes).flatMap(([code, made]) => {
    const base = `episodes/${code}`;
    const texts = [...reads, `${base}/breakdown`];
    const segments = made.boards ? made.segments : [];
    return [
      stage(`${base}/breakdown`, "breakdown", { current: made.breakdown ?? "v1", accepted: made.breakdown ?? "v1" }, reads),
      // A segment's own references where the recording names them (EpisodeMade.uses), else the leads and the home place.
      ...segments.map((segment) => stage(`${base}/blocking/${segment}`, "blocking", { current: "v1", accepted: "v1" }, texts, made.uses?.[segment]?.filter((use) => use.startsWith("assets/scenes/")) ?? place)),
      ...segments.flatMap((segment) => (made.styles ?? STYLES).map((style) => stage(`${base}/multi_panel_storyboard/${segment}/${style}`, "storyboard", made.boards![segment], texts, [...(made.uses?.[segment] ?? [...looks, ...place]), `${base}/blocking/${segment}`]))),
      ...Object.entries(made.takes ?? {}).map(([segment, shot]) => {
        const newest = `t${String(shot.count).padStart(2, "0")}`;
        return stage(`${base}/segments/${segment}`, "take", { current: newest, accepted: shot.accepted ? newest : null }, texts, [`${base}/multi_panel_storyboard/${segment}/${(made.styles ?? STYLES)[0]}`, ...(made.uses?.[segment] ?? [...looks, ...place])]);
      }),
      ...(made.cut ? [stage(`${base}/edit`, "cut", made.cut, [], Object.keys(made.takes ?? {}).map((segment) => `${base}/segments/${segment}`))] : []),
    ];
  });
  return [...bible, ...leads, ...references, ...episodes];
}

/**
 * What drama-cli would call stale at this stop, with its reasons: a stage whose manifest pins a selection that has since
 * changed (short_drama doc/drama-cli/design.md:76, D85). Replay records the one input that changes under a made stage, a
 * take's storyboard (EpisodeMade.takes.board); the reasons are drama-cli's words for a changed selection
 * (drama_cli/artifacts.py:234), as fixtures/lineage/time-plate-replaced.json has them for a take.
 */
export function outOfDate(progress: ReplayProgress): Map<string, string[]> {
  const stale = new Map<string, string[]>();
  for (const [code, made] of Object.entries(progress.episodes))
    for (const [segment, shot] of Object.entries(made.takes ?? {})) {
      const accepted = made.boards?.[segment]?.accepted;
      if (!shot.board || !accepted || shot.board === accepted) continue;
      const board = `episodes/${code}/multi_panel_storyboard/${segment}/${(made.styles ?? STYLES)[0]}`;
      stale.set(`episodes/${code}/segments/${segment}`, [`Changed selection: ${board}/accepted.json`, `Changed selection: ${board}/current.json`]);
    }
  return stale;
}

// The export carries drama-cli's layout (shared/layout.ts): the studio's Canvas places every node where drama-cli does.
const TEXT_KINDS = new Set(["screenplay", "bible", "breakdown", "video_prompts", "subtitles"]);

/** The group a stage is drawn in (short_drama drama_cli/export.py, section). */
function section(stage: Stage): string {
  const parts = stage.id.split("/");
  if (TEXT_KINDS.has(stage.kind)) return "Text";
  if (stage.kind === "look") return "Characters";
  if (stage.kind === "plate") return "Locations";
  if (stage.kind === "prop") return "Props";
  if (stage.kind === "cut") return `${parts[1]} cut`;
  return `${parts[1]} ${parts[3]}`;
}

/** The export, as the bytes of handoff/lineage.json; `returned` is every file the session's stops returned. */
export function replayLineage(progress: ReplayProgress, returned: Iterable<string>): { path: string; type: string; bytes: Uint8Array } {
  const files = [...returned];
  const all = stages(progress);
  const stale = outOfDate(progress);
  const number = new Map(all.map((stage, n) => [stage.id, n + 1]));
  const { places, groups } = layout(all.map((stage) => ({ id: stage.id, column: stage.column, section: section(stage) })));
  const nodes = all.map((stage) => ({
    id: number.get(stage.id),
    type: "DramaCliStep",
    title: stage.id,
    pos: places.get(stage.id),
    size: [WIDTH, HEIGHT],
    properties: {
      id: stage.id,
      kind: stage.kind,
      column: stage.column,
      version: stage.version,
      accepted: stage.accepted,
      fresh: !stale.has(stage.id),
      // The file a stop returned for the working version that drama-cli would show: a picture, a video or a text, never
      // the spec or request returned beside it (drama_cli/lineage.py, SHOWN_SUFFIXES).
      shows: stage.version ? (files.find((file) => file.startsWith(`drama/${stage.id}/${stage.version}/`) && SHOWN.test(file))?.slice("drama/".length) ?? null) : null,
      reads: stage.reads,
      problems: stale.get(stage.id) ?? [],
      label: stage.id,
      section: section(stage),
    },
  }));
  const links = all.flatMap((stage) => stage.from.filter((from) => number.has(from)).map((from) => [from, stage.id] as const));
  const workflow = {
    nodes,
    links: links.map(([from, to], n) => [n + 1, number.get(from), 0, number.get(to), 0, "DRAMA_CLI_FILE"]),
    groups: groups.map((group, n) => ({ id: n + 1, title: group.title, font_size: 24, bounding: [group.x, group.y, group.w, group.h] })),
    extra: { drama_cli: { project: "/work/drama" } },
    version: 0.4,
  };
  return { path: "handoff/lineage.json", type: "application/json", bytes: new TextEncoder().encode(JSON.stringify(workflow, null, 1)) };
}

// A plate's views (drama-cli's LOCATION_STEPS): replay draws no stage of its own for them; each comes with its plate,
// assets/scenes/<id> or assets/scenes/<id>/times/<time>, the path above it.
const VIEW = /^(assets\/scenes\/.+)\/(?:floor-plan|front|back|left-side|right-side)$/;

interface ExportNode {
  id: number;
  inputs?: { name: string; link: number | null }[];
  outputs?: { links: number[] | null }[];
  properties: { id: string; kind: string; section: string; fresh?: boolean | null; problems?: string[] };
}
interface Export {
  nodes: ExportNode[];
  links: [number, number, number, number, number, string][];
  groups: { title: string }[];
}

/**
 * A sample drama's own export (drama-cli's `export comfyui` of the finished run) cut to what the drama has made by
 * this stop, as a real stop's export holds only that: every stage replay makes is kept once its progress has it, a
 * plate's view with its plate, and every other one (a first-frame reference, the video prompts, the subtitles, the
 * screenplay) once everything it is made from is kept. Links, inputs, outputs and groups follow the nodes kept; nothing else changes.
 */
export function lineageAt(progress: ReplayProgress, exported: Uint8Array): Uint8Array {
  const workflow = JSON.parse(new TextDecoder().decode(exported)) as Export;
  const made = new Set(stages(progress).map((stage) => stage.id));
  const byId = new Map(workflow.nodes.map((node) => [node.properties.id, node]));
  const kept = new Map<string, boolean>();
  const keep = (node: ExportNode): boolean => {
    const id = node.properties.id;
    if (!kept.has(id)) {
      kept.set(id, false);
      const plate = VIEW.exec(id)?.[1];
      const upstream = (node.inputs ?? []).map((input) => byId.get(input.name)).filter((one) => one !== undefined);
      kept.set(id, plate ? made.has(plate) : node.properties.kind in COLUMN ? made.has(id) : upstream.every(keep));
    }
    return kept.get(id)!;
  };
  const nodes = workflow.nodes.filter(keep);
  // What this stop's history leaves out of date, as drama-cli would say it (outOfDate), on the sample's own export too.
  for (const [id, problems] of outOfDate(progress)) {
    const node = byId.get(id);
    if (node) node.properties = { ...node.properties, fresh: false, problems };
  }
  const numbers = new Set(nodes.map((node) => node.id));
  const links = workflow.links.filter(([, from, , to]) => numbers.has(from) && numbers.has(to));
  const live = new Set(links.map(([id]) => id));
  for (const node of nodes) {
    node.inputs = (node.inputs ?? []).filter((input) => input.link === null || live.has(input.link));
    for (const output of node.outputs ?? []) output.links = (output.links ?? []).filter((link) => live.has(link));
  }
  const sections = new Set(nodes.map((node) => node.properties.section));
  return new TextEncoder().encode(JSON.stringify({ ...workflow, nodes, links, groups: workflow.groups.filter((group) => sections.has(group.title)) }, null, 1));
}
