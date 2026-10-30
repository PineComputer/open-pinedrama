// The canvas's layout (P6.1): the whole series as one board, worked out from the project's state
// alone, so the same state always draws the same board. References stand on the left: cast,
// then places and props. Episodes follow in rows, each a group of its scenes, each scene its
// segments in shot order. The only connectors are what the state states: a scene's shot order
// (scene_chains) and what an episode needs from a reference (needs). What each segment uses
// comes with drama-cli's lineage export (P8.0), not here. Sizes are our own design (the pro
// direction's canvas).
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
  /** The scene group a segment stands in. */
  scene?: string;
}

export interface BoardGroup extends Box {
  /** episode:EP001, scene:EP001/0 (by its place in scene_chains), or scene:EP001/unlisted. */
  id: string;
  kind: "episode" | "scene";
  episode: string;
  /** A scene's heading as the breakdown writes it. */
  heading?: string;
}

export interface BoardEdge {
  from: string;
  to: string;
  /** order: shot after the other in its scene; needs: the episode can't go on without the reference. */
  kind: "order" | "needs";
}

export interface Board {
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
  /** Between the reference columns, and between them and the episodes. */
  column: 64,
  episodeHead: 48,
  sceneHead: 36,
  pad: 16,
  episodesPerRow: 6,
  episodeGap: 64,
} as const;

const byCode = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** The reference a need names, from the folder drama-cli gives for it (assets/characters|scenes|props/<id>). */
function needed(path: string): string | undefined {
  const m = path.match(/assets\/(characters|scenes|props)\/([^/]+)/);
  if (!m) return undefined;
  return `${{ characters: "character", scenes: "location", props: "prop" }[m[1] as "characters" | "scenes" | "props"]}:${m[2]}`;
}

export function layoutBoard(state: State): Board {
  const nodes: BoardNode[] = [];
  const groups: BoardGroup[] = [];
  const edges: BoardEdge[] = [];
  const step = SIZE.label + SIZE.reference.h + SIZE.gap;

  // References: cast in the first column; places, then props, in the second.
  Object.keys(state.characters).sort().forEach((id, n) => nodes.push({ id: `character:${id}`, kind: "character", subject: id, x: 0, y: SIZE.label + n * step, ...SIZE.reference }));
  const second = SIZE.reference.w + SIZE.column;
  const places: [BoardNode["kind"], string][] = [...Object.keys(state.locations).sort().map((id): [BoardNode["kind"], string] => ["location", id]), ...Object.keys(state.props).sort().map((id): [BoardNode["kind"], string] => ["prop", id])];
  places.forEach(([kind, id], n) => nodes.push({ id: `${kind}:${id}`, kind, subject: id, x: second, y: SIZE.label + n * step, ...SIZE.reference }));
  const referencesBottom = Math.max(Object.keys(state.characters).length, places.length) * step;

  // Episodes, in rows, each as tall as its scenes need.
  const left = second + SIZE.reference.w + SIZE.column;
  const episodeW = SIZE.segment.w + 4 * SIZE.pad;
  let rowTop = 0;
  let rowBottom = 0;
  const codes = Object.keys(state.episodes).sort(byCode);
  codes.forEach((code, n) => {
    const column = n % SIZE.episodesPerRow;
    if (column === 0 && n > 0) rowTop = rowBottom + SIZE.episodeGap;
    const episode = state.episodes[code];
    const x = left + column * (episodeW + SIZE.episodeGap);
    const listed = new Set(episode.sceneChains.flatMap((chain) => chain.segments));
    const unlisted = Object.keys(episode.segments).filter((segment) => !listed.has(segment)).sort(byCode);
    const scenes = [
      ...episode.sceneChains.map((chain, i) => ({ id: `scene:${code}/${i}`, heading: chain.sceneHeading as string | undefined, segments: chain.segments })),
      ...(unlisted.length ? [{ id: `scene:${code}/unlisted`, heading: undefined, segments: unlisted }] : []),
    ];
    let y = rowTop + SIZE.episodeHead;
    for (const scene of scenes) {
      const top = y;
      y += SIZE.sceneHead;
      scene.segments.forEach((segment, i) => {
        nodes.push({ id: `segment:${code}/${segment}`, kind: "segment", subject: segment, episode: code, scene: scene.id, x: x + 2 * SIZE.pad, y: y + SIZE.label, ...SIZE.segment });
        if (i > 0 && scene.id !== `scene:${code}/unlisted`) edges.push({ from: `segment:${code}/${scene.segments[i - 1]}`, to: `segment:${code}/${segment}`, kind: "order" });
        y += SIZE.label + SIZE.segment.h + SIZE.gap;
      });
      groups.push({ id: scene.id, kind: "scene", episode: code, ...(scene.heading ? { heading: scene.heading } : {}), x: x + SIZE.pad, y: top, w: episodeW - 2 * SIZE.pad, h: y - top });
      y += SIZE.pad;
    }
    for (const need of episode.needs ?? []) {
      const from = needed(need.path);
      if (from) for (const segment of need.segments) edges.push({ from, to: `segment:${code}/${segment}`, kind: "needs" });
    }
    const height = Math.max(y - rowTop, SIZE.episodeHead + SIZE.pad);
    groups.push({ id: `episode:${code}`, kind: "episode", episode: code, x, y: rowTop, w: episodeW, h: height });
    rowBottom = Math.max(rowBottom, rowTop + height);
  });

  const columns = Math.min(codes.length, SIZE.episodesPerRow);
  return {
    nodes,
    groups,
    edges,
    width: codes.length ? left + columns * episodeW + (columns - 1) * SIZE.episodeGap : second + SIZE.reference.w,
    height: Math.max(referencesBottom, rowBottom),
  };
}
