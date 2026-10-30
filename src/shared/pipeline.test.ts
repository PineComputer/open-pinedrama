// The pipeline's one table, read by Canvas and Graph: every stage drama-cli's lineage names has a
// lane, in the order the work flows, and a stage's folder maps to the canvas item that shows it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLineage } from "./lineage.ts";
import { boardIdOf, PIPELINE, SHOWS } from "./pipeline.ts";

describe("the pipeline", () => {
  it("has a lane for every stage of a real lineage, cast before storyboards before takes before the cut", () => {
    const lineage = parseLineage(JSON.parse(readFileSync(new URL("../../fixtures/lineage/shot.json", import.meta.url), "utf8")));
    for (const node of lineage.nodes) expect(PIPELINE[node.kind], node.kind).toBeDefined();
    const column = (kind: keyof typeof PIPELINE) => PIPELINE[kind].column;
    expect(column("look")).toBeLessThan(column("plate"));
    expect(column("blocking")).toBeLessThan(column("storyboard"));
    expect(column("storyboard")).toBeLessThan(column("take"));
    expect(column("take")).toBeLessThan(column("cut"));
  });

  it("maps a stage's folder to the canvas item that shows it, and nothing for the rest", () => {
    expect(boardIdOf("assets/characters/lin")).toBe("character:lin");
    expect(boardIdOf("assets/characters/lin/states/S1")).toBe("character:lin");
    expect(boardIdOf("assets/scenes/office/times/Night")).toBe("location:office");
    expect(boardIdOf("assets/props/letter")).toBe("prop:letter");
    expect(boardIdOf("episodes/EP001/blocking/seg01")).toBe("blocking:EP001/seg01");
    expect(boardIdOf("episodes/EP001/multi_panel_storyboard/seg01/line-art")).toBe("segment:EP001/seg01");
    expect(boardIdOf("episodes/EP001/segments/seg01")).toBe("take:EP001/seg01");
    expect(boardIdOf("episodes/EP001/edit")).toBe("cut:EP001");
    expect(boardIdOf("bible")).toBeUndefined();
    expect(boardIdOf("episodes/EP001/breakdown")).toBeUndefined();
  });

  it("shows each canvas item's stage kind", () => {
    for (const kind of Object.values(SHOWS)) expect(PIPELINE[kind]).toBeDefined();
  });
});
