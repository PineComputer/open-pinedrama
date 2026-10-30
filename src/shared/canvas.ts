// The canvas's layout: one episode per board, as the reference's drama board draws one. Its
// scenes are bands, top to bottom in the breakdown's order, each with its segments left to right
// in shot order; the shared references the episode uses or needs stand on the left. Worked out
// from the project's state and drama-cli's lineage alone, so the same state always draws the same
// board. The connectors are what those state: a scene's shot order (scene_chains), what the
// episode needs from a reference (needs), and which references a segment's work was made from
// (the lineage's links). Sizes are our own design (the pro direction's canvas).
import type { Lineage } from "./lineage.ts";
import type { ProjectState } from "./project.ts";

type State = Omit<ProjectState, "budget">;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardNode extends Box {
  /** character:lin, location:office, prop:letter, segment:EP001/seg01. */
  id: string;
  kind: "character" | "location" | "prop" | "segment";
  /** The character, location or prop id, or the segment's id. */
  subject: string;
  episode?: string;
  /** The scene band a segment stands in. */
  scene?: string;
}

export interface BoardGroup extends Box {
  /** scene:EP001/0 (by its place in scene_chains), or scene:EP001/unlisted. */
  id: string;
  kind: "scene";
  episode: string;
  /** The scene's heading as the breakdown writes it. */
  heading?: string;
}

export interface BoardEdge {
  from: string;
  to: string;
  /** order: shot after the other in its scene; needs: the episode can't go on without the reference; uses: the segment's work was made from it. */
  kind: "order" | "needs" | "uses";
}

export interface Board {
  episode: string;
  nodes: BoardNode[];
  groups: BoardGroup[];
  edges: BoardEdge[];
  width: number;
  height: number;
}

/** Card sizes and gaps. A label stands above each card, inside the gap. */
export const SIZE = {
  reference: { w: 240, h: 150 },
  segment: { w: 300, h: 132 },
  /** Room above a card for its label. */
  label: 28,
  gap: 16,
  /** Between two segments of a band, room for the order connector. */
  between: 40,
  /** Between the references and the bands. */
  column: 120,
  bandHead: 36,
  pad: 16,
  bandGap: 32,
} as const;

const byCode = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** The board node a reference's stage folder stands for (assets/characters|scenes|props/<id>, a look, time or view folded into its subject). */
function reference(path: string): string | undefined {
  const m = path.match(/assets\/(characters|scenes|props)\/([^/]+)/);
  if (!m) return undefined;
  return `${{ characters: "character", scenes: "location", props: "prop" }[m[1] as "characters" | "scenes" | "props"]}:${m[2]}`;
}

/** Which references each of the episode's segments was made from, by drama-cli's lineage: a link from a look, plate or prop to any of the segment's stages. */
export function episodeUses(lineage: Lineage | null, code: string): BoardEdge[] {
  if (!lineage) return [];
  const byId = new Map(lineage.nodes.map((node) => [node.id, node]));
  const uses = new Map<string, BoardEdge>();
  for (const link of lineage.links) {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to || to.where.episode !== code || !to.where.segment) continue;
    if (from.kind !== "look" && from.kind !== "plate" && from.kind !== "prop") continue;
    const ref = reference(from.id);
    if (!ref) continue;
    const edge: BoardEdge = { from: ref, to: `segment:${code}/${to.where.segment}`, kind: "uses" };
    uses.set(`${edge.from}>${edge.to}`, edge);
  }
  return [...uses.values()].sort((a, b) => byCode(a.to, b.to) || a.from.localeCompare(b.from));
}

export function layoutEpisode(state: State, code: string, lineage: Lineage | null): Board {
  const nodes: BoardNode[] = [];
  const groups: BoardGroup[] = [];
  const edges: BoardEdge[] = [];
  const episode = state.episodes[code];
  if (!episode) return { episode: code, nodes, groups, edges, width: 0, height: 0 };

  const needs: BoardEdge[] = (episode.needs ?? []).flatMap((need) => {
    const from = reference(need.path);
    return from ? need.segments.map((segment): BoardEdge => ({ from, to: `segment:${code}/${segment}`, kind: "needs" })) : [];
  });
  const uses = episodeUses(lineage, code);

  // The references the episode uses or needs, cast first, then places, then props, each in id order.
  const rank = { character: 0, location: 1, prop: 2 } as const;
  const kindOf = (id: string) => id.split(":")[0] as keyof typeof rank;
  const refs = [...new Set([...uses, ...needs].map((edge) => edge.from))]
    .filter((id) => {
      const subject = id.slice(id.indexOf(":") + 1);
      const kind = kindOf(id);
      return kind === "character" ? subject in state.characters : kind === "location" ? subject in state.locations : subject in state.props;
    })
    .sort((a, b) => rank[kindOf(a)] - rank[kindOf(b)] || a.localeCompare(b));
  refs.forEach((id, n) => {
    nodes.push({ id, kind: kindOf(id), subject: id.slice(id.indexOf(":") + 1), x: 0, y: SIZE.label + n * (SIZE.label + SIZE.reference.h + SIZE.gap), ...SIZE.reference });
  });

  // The bands, one per scene, then one for any segment no scene lists.
  const listed = new Set(episode.sceneChains.flatMap((chain) => chain.segments));
  const unlisted = Object.keys(episode.segments).filter((segment) => !listed.has(segment)).sort(byCode);
  const scenes = [
    ...episode.sceneChains.map((chain, i) => ({ id: `scene:${code}/${i}`, heading: chain.sceneHeading as string | undefined, segments: chain.segments })),
    ...(unlisted.length ? [{ id: `scene:${code}/unlisted`, heading: undefined, segments: unlisted }] : []),
  ];
  const left = refs.length ? SIZE.reference.w + SIZE.column : 0;
  let y = 0;
  let right = left;
  for (const scene of scenes) {
    const top = y;
    const row = top + SIZE.bandHead + SIZE.label;
    scene.segments.forEach((segment, i) => {
      nodes.push({ id: `segment:${code}/${segment}`, kind: "segment", subject: segment, episode: code, scene: scene.id, x: left + SIZE.pad + i * (SIZE.segment.w + SIZE.between), y: row, ...SIZE.segment });
      if (i > 0 && scene.id !== `scene:${code}/unlisted`) edges.push({ from: `segment:${code}/${scene.segments[i - 1]}`, to: `segment:${code}/${segment}`, kind: "order" });
    });
    const w = 2 * SIZE.pad + Math.max(1, scene.segments.length) * SIZE.segment.w + Math.max(0, scene.segments.length - 1) * SIZE.between;
    const h = SIZE.bandHead + SIZE.label + SIZE.segment.h + SIZE.pad;
    groups.push({ id: scene.id, kind: "scene", episode: code, ...(scene.heading ? { heading: scene.heading } : {}), x: left, y: top, w, h });
    right = Math.max(right, left + w);
    y += h + SIZE.bandGap;
  }
  const onBoard = new Set(nodes.map((node) => node.id));
  edges.push(...[...uses, ...needs].filter((edge) => onBoard.has(edge.from) && onBoard.has(edge.to)));

  const refsBottom = refs.length * (SIZE.label + SIZE.reference.h + SIZE.gap);
  return { episode: code, nodes, groups, edges, width: right, height: Math.max(refsBottom, y - (scenes.length ? SIZE.bandGap : 0)) };
}
