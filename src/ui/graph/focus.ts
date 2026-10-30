// The versions around the one in focus: the lineage links within a number of links of it, of the
// kinds shown (the version in focus always), as Reveric's entity graph scopes its view
// (designs/desktop/EntityGraph.jsx, egPrepGraph), and their places from d3-force, whose radial
// force rings each version at its distance from the focus as Reveric's layout does.
import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, type SimulationNodeDatum } from "d3-force";
import type { Lineage, LineageKind, LineageLink } from "../../shared/lineage.ts";

// A ring per link out (Reveric's spacing is 150; 160 here), and room around each version for its ring and its label.
export const RING = 160;
const ROOM = 62;

export interface Point {
  x: number;
  y: number;
}

export function focusGraph(lineage: Lineage, center: string, kinds: Set<LineageKind>, depth: number): { ids: string[]; links: LineageLink[]; places: Map<string, Point> } {
  const kindOf = new Map(lineage.nodes.map((node) => [node.id, node.kind]));
  const shown = (id: string) => id === center || kinds.has(kindOf.get(id)!);
  const candidates = lineage.links.filter((link) => shown(link.from) && shown(link.to));
  const hops = new Map([[center, 0]]);
  for (let d = 1; d <= depth; d++) {
    for (const link of candidates) {
      for (const [a, b] of [[link.from, link.to], [link.to, link.from]]) {
        if (hops.get(a) === d - 1 && !hops.has(b)) hops.set(b, d);
      }
    }
  }
  const ids = [...hops.keys()];
  const links = candidates.filter((link) => hops.has(link.from) && hops.has(link.to));
  type Node = SimulationNodeDatum & { id: string; hops: number };
  const nodes: Node[] = ids.map((id) => ({ id, hops: hops.get(id)!, ...(id === center ? { fx: 0, fy: 0 } : {}) }));
  forceSimulation(nodes)
    .force("link", forceLink<Node, { source: string; target: string }>(links.map((link) => ({ source: link.from, target: link.to }))).id((node) => node.id).distance(RING))
    .force("charge", forceManyBody().strength(-600))
    .force("collide", forceCollide(ROOM))
    .force("radial", forceRadial<Node>((node) => node.hops * RING, 0, 0).strength(0.9))
    .stop()
    .tick(300);
  return { ids, links, places: new Map(nodes.map((node) => [node.id, { x: node.x!, y: node.y! }])) };
}
