// The lineage replay hands back at each stop, as Pine's agent hands back drama-cli's (goals.ts
// RETURN_LINEAGE). Replay has no drama-cli project, so this writes the export its recording
// would have: the parts of drama-cli's `export comfyui` the studio reads (fixtures/lineage),
// with a stage for each thing the recording made at its versions, everything fresh, and a link
// from each picture to what was made from it. Every segment is set at home, as replay's status
// report heads its scenes (replay-status.ts).
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

function referenceStage(key: string): { id: string; kind: string } {
  const [id, look] = key.split("/");
  if (look) return { id: `assets/characters/${id}/states/${look}`, kind: "look" };
  return key === "letter" ? { id: `assets/props/${key}`, kind: "prop" } : { id: `assets/scenes/${key}`, kind: "plate" };
}

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
  const references = Object.entries(progress.references).map(([key, made]) => {
    const { id, kind } = referenceStage(key);
    return stage(id, kind, made, reads);
  });
  const place = references.some((reference) => reference.id === PLACE) ? [PLACE] : [];
  const looks = leads.map((lead) => lead.id);
  const episodes = Object.entries(progress.episodes).flatMap(([code, made]) => {
    const base = `episodes/${code}`;
    const texts = [...reads, `${base}/breakdown`];
    const segments = made.boards ? made.segments : [];
    return [
      stage(`${base}/breakdown`, "breakdown", { current: "v1", accepted: "v1" }, reads),
      ...segments.map((segment) => stage(`${base}/blocking/${segment}`, "blocking", { current: "v1", accepted: "v1" }, texts, place)),
      ...segments.flatMap((segment) => STYLES.map((style) => stage(`${base}/multi_panel_storyboard/${segment}/${style}`, "storyboard", made.boards![segment], texts, [...looks, ...place, `${base}/blocking/${segment}`]))),
      ...Object.entries(made.takes ?? {}).map(([segment, shot]) => {
        const newest = `t${String(shot.count).padStart(2, "0")}`;
        return stage(`${base}/segments/${segment}`, "take", { current: newest, accepted: shot.accepted ? newest : null }, texts, [`${base}/multi_panel_storyboard/${segment}/line-art`, ...looks, ...place]);
      }),
      ...(made.cut ? [stage(`${base}/edit`, "cut", made.cut, [], Object.keys(made.takes ?? {}).map((segment) => `${base}/segments/${segment}`))] : []),
    ];
  });
  return [...bible, ...leads, ...references, ...episodes];
}

/** The export, as the bytes of handoff/lineage.json; `returned` is every file the session's stops returned. */
export function replayLineage(progress: ReplayProgress, returned: Iterable<string>): { path: string; type: string; bytes: Uint8Array } {
  const files = [...returned];
  const all = stages(progress);
  const number = new Map(all.map((stage, n) => [stage.id, n + 1]));
  const nodes = all.map((stage) => ({
    id: number.get(stage.id),
    type: "DramaCliStep",
    title: stage.id,
    properties: {
      id: stage.id,
      kind: stage.kind,
      column: stage.column,
      version: stage.version,
      accepted: stage.accepted,
      fresh: true,
      // The file a stop returned for the working version, as drama-cli names the one it shows.
      shows: stage.version ? (files.find((file) => file.startsWith(`drama/${stage.id}/${stage.version}/`))?.slice("drama/".length) ?? null) : null,
      reads: stage.reads,
      problems: [],
      label: stage.id,
    },
  }));
  const links = all.flatMap((stage) => stage.from.filter((from) => number.has(from)).map((from) => [from, stage.id] as const));
  const workflow = {
    nodes,
    links: links.map(([from, to], n) => [n + 1, number.get(from), 0, number.get(to), 0, "DRAMA_CLI_FILE"]),
    extra: { drama_cli: { project: "/work/drama" } },
    version: 0.4,
  };
  return { path: "handoff/lineage.json", type: "application/json", bytes: new TextEncoder().encode(JSON.stringify(workflow, null, 1)) };
}
