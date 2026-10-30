import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage, trace, type Lineage, type LineageKind } from "../../shared/lineage.ts";
import { focusGraph, RING } from "./focus.ts";

const real = (name: string): Lineage => parseLineage(JSON.parse(readFileSync(path.resolve("fixtures/lineage", `${name}.json`), "utf8")));
const ALL = new Set<LineageKind>(["screenplay", "bible", "look", "plate", "prop", "breakdown", "blocking", "first_frame_reference", "storyboard", "video_prompts", "take", "cut", "subtitles"]);
const TAKE = "episodes/EP001/segments/seg01";

describe("the graph around a version", () => {
  it("puts the version in focus at the centre, and the same lineage in the same places each time", () => {
    const one = focusGraph(real("shot"), TAKE, ALL, 2);
    const two = focusGraph(real("shot"), TAKE, ALL, 2);
    expect(one.places.get(TAKE)).toEqual({ x: 0, y: 0 });
    expect([...one.places]).toEqual([...two.places]);
  });

  it("keeps every two versions apart, and rings them farther out the farther they are linked", () => {
    const { places } = focusGraph(real("shot"), TAKE, ALL, 2);
    const points = [...places.values()];
    points.forEach((a, i) => points.slice(i + 1).forEach((b) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(RING * 0.6)));
    const r = (id: string) => Math.hypot(places.get(id)!.x, places.get(id)!.y);
    expect(r("assets/scenes/office")).toBeGreaterThan(r("assets/scenes/office/times/Day"));
  });

  it("reaches as many links out as the depth, both ways", () => {
    const near = focusGraph(real("shot"), TAKE, ALL, 1);
    expect(near.ids).toContain("assets/scenes/office/times/Day");
    expect(near.ids).not.toContain("assets/scenes/office");
    expect(focusGraph(real("shot"), TAKE, ALL, 2).ids).toContain("assets/scenes/office");
  });

  it("shows only the focus's lineage, what it was made from and what was made from it, never a sibling", () => {
    const lineage = real("shot");
    const { up, down } = trace(lineage, TAKE);
    const { ids } = focusGraph(lineage, TAKE, ALL, 3);
    expect(ids.filter((id) => id !== TAKE && !up.has(id) && !down.has(id))).toEqual([]);
    const plate = focusGraph(lineage, "assets/scenes/office/times/Day", ALL, 2);
    // The plate's users are its lineage; what else they used (the take's look) is not.
    expect(plate.ids).toContain(TAKE);
    expect(plate.ids).not.toContain("assets/characters/lin");
  });

  it("shows only the kinds chosen, and always the version in focus", () => {
    const { ids } = focusGraph(real("shot"), TAKE, new Set<LineageKind>(["look"]), 2);
    expect(ids.sort()).toEqual(["assets/characters/lin", TAKE]);
  });
});
