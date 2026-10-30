// The canvas's layout (P6.1): the whole series as one board, from the project's state alone.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Box, layoutBoard } from "./canvas.ts";
import { parseStatus } from "./project.ts";

function state(name: string, change?: (report: Record<string, any>) => void) {
  const report = JSON.parse(readFileSync(new URL(`../../fixtures/status/${name}.json`, import.meta.url), "utf8"));
  change?.(report);
  const { budget: _budget, ...rest } = parseStatus(report);
  return rest;
}

/** A series of `episodes` episodes, each with `segments` segments in scenes of `perScene`, cloned from boards.json's EP001. */
function series(episodes: number, segments: number, perScene: number) {
  return state("boards", (report) => {
    const one = report.episodes.EP001;
    const segment = one.segments.seg01;
    report.episodes = {};
    for (let e = 1; e <= episodes; e++) {
      const ids = Array.from({ length: segments }, (_, n) => `seg${String(n + 1).padStart(2, "0")}`);
      const chains = [];
      for (let s = 0; s < ids.length; s += perScene) chains.push({ scene_heading: `INT. OFFICE - DAY #${e}-${s / perScene + 1}#`, segments: ids.slice(s, s + perScene) });
      report.episodes[`EP${String(e).padStart(3, "0")}`] = { ...one, segments: Object.fromEntries(ids.map((id) => [id, segment])), scene_chains: chains, needs: [] };
    }
  });
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (inner: Box, outer: Box) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

describe("the board's layout", () => {
  it("places every character, location, prop and segment once", () => {
    const board = layoutBoard(state("boards", (report) => {
      report.props = { letter: report.scenes.office };
    }));
    expect(board.nodes.map((node) => node.id).sort()).toEqual(["character:lin", "location:office", "prop:letter", "segment:EP001/seg01"]);
  });

  it("keeps 80 episodes of 6 segments clear of each other and of the references", () => {
    const board = layoutBoard(series(80, 6, 2));
    expect(board.nodes.filter((node) => node.kind === "segment")).toHaveLength(480);
    for (let i = 0; i < board.nodes.length; i++) for (let j = i + 1; j < board.nodes.length; j++) expect(overlaps(board.nodes[i], board.nodes[j]), `${board.nodes[i].id} / ${board.nodes[j].id}`).toBe(false);
    const episodes = board.groups.filter((group) => group.kind === "episode");
    expect(episodes).toHaveLength(80);
    for (let i = 0; i < episodes.length; i++) for (let j = i + 1; j < episodes.length; j++) expect(overlaps(episodes[i], episodes[j])).toBe(false);
    for (const reference of board.nodes.filter((node) => node.kind !== "segment")) for (const episode of episodes) expect(overlaps(reference, episode)).toBe(false);
  });

  it("puts each segment inside its scene, and each scene inside its episode", () => {
    const board = layoutBoard(series(3, 5, 2));
    const group = (id: string) => board.groups.find((candidate) => candidate.id === id)!;
    for (const segment of board.nodes.filter((node) => node.kind === "segment")) {
      const scene = group(segment.scene!);
      expect(inside(segment, scene)).toBe(true);
      expect(inside(scene, group(`episode:${segment.episode}`))).toBe(true);
    }
    expect(board.groups.filter((candidate) => candidate.kind === "scene" && candidate.episode === "EP002").map((scene) => scene.heading)).toEqual(["INT. OFFICE - DAY #2-1#", "INT. OFFICE - DAY #2-2#", "INT. OFFICE - DAY #2-3#"]);
  });

  it("draws each scene's shot order, and nothing across scenes", () => {
    const board = layoutBoard(series(1, 4, 2));
    expect(board.edges).toEqual([
      { from: "segment:EP001/seg01", to: "segment:EP001/seg02", kind: "order" },
      { from: "segment:EP001/seg03", to: "segment:EP001/seg04", kind: "order" },
    ]);
  });

  it("draws what an episode needs, from the reference to the segments it holds up", () => {
    const board = layoutBoard(state("needs"));
    expect(board.edges).toContainEqual({ from: "location:office", to: "segment:EP001/seg01", kind: "needs" });
  });

  it("places a segment no scene lists, after the scenes", () => {
    const board = layoutBoard(state("boards", (report) => {
      report.episodes.EP001.segments.seg02 = report.episodes.EP001.segments.seg01;
    }));
    const [seg01, seg02] = ["segment:EP001/seg01", "segment:EP001/seg02"].map((id) => board.nodes.find((node) => node.id === id)!);
    expect(seg02.scene).toBe("scene:EP001/unlisted");
    expect(seg02.y).toBeGreaterThan(seg01.y);
  });

  it("orders episodes by their code, whatever order the report lists them in", () => {
    const shuffled = series(12, 1, 1);
    shuffled.episodes = Object.fromEntries(Object.entries(shuffled.episodes).reverse());
    const order = layoutBoard(shuffled).groups.filter((group) => group.kind === "episode").map((group) => group.episode);
    expect(order).toEqual([...order].sort());
    expect(layoutBoard(shuffled)).toEqual(layoutBoard(series(12, 1, 1)));
  });

  it("has an empty board before anything is made", () => {
    const board = layoutBoard(state("new"));
    expect(board.nodes.filter((node) => node.kind === "segment")).toEqual([]);
    expect(board.width).toBeGreaterThanOrEqual(0);
  });
});
