// The versions the Graph draws around the one in focus, and where: its lineage, what it was made from
// and what was made from it however far (never a sibling: what else a shared input made), laid out by
// elkjs's layered algorithm left to right, so the pipeline reads in columns as the pro prototype's
// Graph does (studio-pro/screens.js, Graph; SPEC.md, LineageGraph: 156×112 cards).
import ELK from "elkjs/lib/elk.bundled.js";
import type { Lineage, LineageLink } from "../../shared/lineage.ts";

export const CARD = { width: 156, height: 112 };
// The prototype's gaps between cards (screens.js, Graph: GX 34, GY 22).
const GAP = { between: 34, within: 22 };

export interface Point {
  x: number;
  y: number;
}

/** The focus and its lineage, each way keeping its direction, and the links between them. */
export function lineageOf(lineage: Lineage, center: string): { ids: string[]; links: LineageLink[] } {
  const ids = new Set([center]);
  const links: LineageLink[] = [];
  for (const [toward, back] of [["from", "to"], ["to", "from"]] as const) {
    let frontier = new Set([center]);
    while (frontier.size) {
      const next = new Set<string>();
      for (const link of lineage.links) {
        if (!frontier.has(link[back])) continue;
        if (!links.includes(link)) links.push(link);
        if (!ids.has(link[toward])) {
          ids.add(link[toward]);
          next.add(link[toward]);
        }
      }
      frontier = next;
    }
  }
  return { ids: [...ids], links };
}

const elk = new ELK();

/** Each card's top-left corner, from elkjs's layered layout of the cards and their links, left to right, each card in the column given (the pipeline's, so a column holds one stage of it as the prototype's do). */
export async function layered(ids: string[], links: LineageLink[], column: (id: string) => number): Promise<Map<string, Point>> {
  const laid = await elk.layout({
    id: "lineage",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": String(GAP.within),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(GAP.between),
      // Interactive layering takes each node's layer from the x it is given (elk.layered.layering.strategy INTERACTIVE):
      // here its pipeline column, so a column holds one stage of the pipeline.
      "elk.layered.layering.strategy": "INTERACTIVE",
    },
    children: ids.map((id) => ({ id, ...CARD, x: column(id) * (CARD.width + GAP.between), y: 0 })),
    edges: links.map((link, n) => ({ id: `e${n}`, sources: [link.from], targets: [link.to] })),
  });
  return new Map((laid.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]));
}
