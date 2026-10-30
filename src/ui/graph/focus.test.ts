import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage, trace, type Lineage } from "../../shared/lineage.ts";
import { PIPELINE } from "../../shared/pipeline.ts";
import { CARD, layered, lineageOf } from "./focus.ts";

const real = (name: string): Lineage => parseLineage(JSON.parse(readFileSync(path.resolve("fixtures/lineage", `${name}.json`), "utf8")));
const TAKE = "episodes/EP001/segments/seg01";

describe("the versions around one in focus", () => {
  it("are its whole lineage, what it was made from and what was made from it, never a sibling", () => {
    const lineage = real("shot");
    const { up, down } = trace(lineage, TAKE);
    const { ids } = lineageOf(lineage, TAKE);
    expect(new Set(ids)).toEqual(new Set([TAKE, ...up, ...down]));
    const plate = lineageOf(lineage, "assets/scenes/office/times/Day");
    // The plate's users are its lineage; what else they used (the take's look) is not.
    expect(plate.ids).toContain(TAKE);
    expect(plate.ids).not.toContain("assets/characters/lin");
  });
});

describe("their layout", () => {
  it("reads left to right in the pipeline's order, and no two cards overlap", async () => {
    const lineage = real("shot");
    const { ids, links } = lineageOf(lineage, TAKE);
    const column: Record<string, number> = Object.fromEntries(lineage.nodes.map((node) => [node.id, PIPELINE[node.kind].column]));
    const places = await layered(ids, links, (id) => column[id]);
    const x = (id: string) => places.get(id)!.x;
    expect(x("bible")).toBeLessThan(x("episodes/EP001/breakdown"));
    // One stage of the pipeline per column: the look and the plate stand apart, as the pipeline's columns put them.
    expect(x("assets/characters/lin")).toBeGreaterThan(x("episodes/EP001/breakdown"));
    expect(x("assets/scenes/office")).toBeLessThan(x("assets/scenes/office/times/Day"));
    expect(x("episodes/EP001/multi_panel_storyboard/seg01/line-art")).toBeLessThan(x(TAKE));
    const boxes = [...places.values()];
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(Math.abs(a.x - b.x) >= CARD.width || Math.abs(a.y - b.y) >= CARD.height).toBe(true)));
  });
});
