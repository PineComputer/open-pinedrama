// The canvas's layout: one episode per board, its scenes as bands with their segments in shot
// order, and the shared references the episode uses on its left, from the project's state and
// drama-cli's lineage alone.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Box, episodeUses, layoutEpisode } from "./canvas.ts";
import { type Lineage, parseLineage } from "./lineage.ts";
import { parseStatus } from "./project.ts";

function state(name: string, change?: (report: Record<string, any>) => void) {
  const report = JSON.parse(readFileSync(new URL(`../../fixtures/status/${name}.json`, import.meta.url), "utf8"));
  change?.(report);
  const { budget: _budget, ...rest } = parseStatus(report);
  return rest;
}

const lineage = (name: string): Lineage => parseLineage(JSON.parse(readFileSync(new URL(`../../fixtures/lineage/${name}.json`, import.meta.url), "utf8")));

/** EP001 with `scenes` scenes of `perScene` segments each, cloned from boards.json's EP001. */
function episode(scenes: number, perScene: number) {
  return state("boards", (report) => {
    const one = report.episodes.EP001;
    const segment = one.segments.seg01;
    const ids = Array.from({ length: scenes * perScene }, (_, n) => `seg${String(n + 1).padStart(2, "0")}`);
    const chains = Array.from({ length: scenes }, (_, s) => ({ scene_heading: `INT. OFFICE - DAY #1-${s + 1}#`, segments: ids.slice(s * perScene, (s + 1) * perScene) }));
    report.episodes = { EP001: { ...one, segments: Object.fromEntries(ids.map((id) => [id, segment])), scene_chains: chains, needs: [] }, EP002: { ...one } };
  });
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (inner: Box, outer: Box) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

describe("what an episode uses", () => {
  it("reads, from drama-cli's lineage, each reference a segment's work was made from", () => {
    const uses = episodeUses(lineage("shot"), "EP001");
    expect(uses).toContainEqual({ from: "character:lin", to: "segment:EP001/seg01", kind: "uses" });
    expect(uses).toContainEqual({ from: "location:office", to: "segment:EP001/seg01", kind: "uses" });
    expect(new Set(uses.map((use) => `${use.from}>${use.to}`)).size).toBe(uses.length);
  });

  it("is nothing for another episode, or before any lineage", () => {
    expect(episodeUses(lineage("shot"), "EP002")).toEqual([]);
    expect(episodeUses(null, "EP001")).toEqual([]);
  });
});

describe("an episode's board", () => {
  it("lays out only that episode's segments, and the references it uses or needs", () => {
    const board = layoutEpisode(state("boards", (report) => {
      report.props = { letter: report.scenes.office };
      report.characters.wei = report.characters.lin;
    }), "EP001", lineage("shot"));
    expect(board.nodes.map((node) => node.id).sort()).toEqual(["character:lin", "location:office", "segment:EP001/seg01"]);
  });

  it("puts each scene in a band, its segments left to right in shot order, clear of each other and of the references", () => {
    const board = layoutEpisode(episode(6, 8), "EP001", lineage("shot"));
    const segments = board.nodes.filter((node) => node.kind === "segment");
    expect(segments).toHaveLength(48);
    for (let i = 0; i < board.nodes.length; i++) for (let j = i + 1; j < board.nodes.length; j++) expect(overlaps(board.nodes[i], board.nodes[j]), `${board.nodes[i].id} / ${board.nodes[j].id}`).toBe(false);
    const bands = board.groups;
    expect(bands.map((band) => band.heading)).toEqual(["INT. OFFICE - DAY #1-1#", "INT. OFFICE - DAY #1-2#", "INT. OFFICE - DAY #1-3#", "INT. OFFICE - DAY #1-4#", "INT. OFFICE - DAY #1-5#", "INT. OFFICE - DAY #1-6#"]);
    for (let i = 1; i < bands.length; i++) expect(bands[i].y).toBeGreaterThanOrEqual(bands[i - 1].y + bands[i - 1].h);
    for (const segment of segments) expect(inside(segment, bands.find((band) => band.id === segment.scene)!)).toBe(true);
    const first = segments.filter((node) => node.scene === bands[0].id);
    expect(first.map((node) => node.subject)).toEqual(["seg01", "seg02", "seg03", "seg04", "seg05", "seg06", "seg07", "seg08"]);
    expect(segments.filter((node) => node.scene === bands[1].id).map((node) => node.place)).toEqual(["2-1", "2-2", "2-3", "2-4", "2-5", "2-6", "2-7", "2-8"]);
    for (let i = 1; i < first.length; i++) expect(first[i].x).toBeGreaterThan(first[i - 1].x);
    for (const reference of board.nodes.filter((node) => node.kind !== "segment")) for (const band of bands) expect(overlaps(reference, band)).toBe(false);
  });

  it("draws a scene's shot order, what the episode uses and what it needs, and nothing else", () => {
    const board = layoutEpisode(episode(2, 2), "EP001", lineage("shot"));
    expect(board.edges.filter((edge) => edge.kind === "order")).toEqual([
      { from: "segment:EP001/seg01", to: "segment:EP001/seg02", kind: "order" },
      { from: "segment:EP001/seg03", to: "segment:EP001/seg04", kind: "order" },
    ]);
    expect(board.edges).toContainEqual({ from: "character:lin", to: "segment:EP001/seg01", kind: "uses" });
    expect(layoutEpisode(state("needs"), "EP001", null).edges).toContainEqual({ from: "location:office", to: "segment:EP001/seg01", kind: "needs" });
  });

  it("places a segment no scene lists in a band of its own, after the scenes", () => {
    const board = layoutEpisode(state("boards", (report) => {
      report.episodes.EP001.segments.seg02 = report.episodes.EP001.segments.seg01;
    }), "EP001", null);
    const seg02 = board.nodes.find((node) => node.id === "segment:EP001/seg02")!;
    expect(seg02.scene).toBe("scene:EP001/unlisted");
    expect(board.groups.at(-1)!.id).toBe("scene:EP001/unlisted");
  });

  it("is the same board for the same state", () => {
    expect(layoutEpisode(episode(3, 3), "EP001", lineage("shot"))).toEqual(layoutEpisode(episode(3, 3), "EP001", lineage("shot")));
  });

  it("is an empty board for an episode the state doesn't hold", () => {
    expect(layoutEpisode(state("new"), "EP001", null).nodes).toEqual([]);
  });
});
