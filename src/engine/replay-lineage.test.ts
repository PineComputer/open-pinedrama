// Replay's lineage exports read as drama-cli's do (the parser drama-cli's real exports pass),
// with a stage for each thing its recording made, the picture each stop returned, and a link
// from each picture to what was made from it.
import { describe, expect, it } from "vitest";
import { parseLineage, trace } from "../shared/lineage.ts";
import { lineageAt, replayLineage } from "./replay-lineage.ts";
import type { ReplayProgress } from "./replay-status.ts";

const v1 = { current: "v1", accepted: "v1" };
const progress: ReplayProgress = {
  preset: "en-us-live-sfw",
  bible: "v1",
  looks: { lin: v1 },
  references: { "lin/S1": { ...v1, path: "assets/characters/lin/states/S1" }, home: { ...v1, path: "assets/scenes/home" }, letter: { ...v1, path: "assets/props/letter" } },
  episodes: { EP001: { segments: ["seg01"], boards: { seg01: { current: "v2", accepted: "v2" } }, takes: { seg01: { count: 2, accepted: true } }, cut: { current: "v1", accepted: null } } },
};
const returned = [
  "drama/bible/v1/bible.md",
  "drama/assets/characters/lin/v1/image-1.jpg",
  "drama/assets/scenes/home/v1/image-1.svg",
  "drama/episodes/EP001/multi_panel_storyboard/seg01/line-art/v2/image-1.svg",
  "drama/episodes/EP001/segments/seg01/t01/video.mp4",
  "drama/episodes/EP001/segments/seg01/t02/video.mp4",
];
const read = (p: ReplayProgress, files = returned) => parseLineage(JSON.parse(new TextDecoder().decode(replayLineage(p, files).bytes)));

describe("replay's lineage", () => {
  it("lays its nodes out as drama-cli's export does: the shared groups on the left, a group per segment, the cut alone", () => {
    const lineage = read(progress);
    const at = (id: string) => lineage.nodes.find((node) => node.id === id)!;
    expect(at("assets/characters/lin").section).toBe("Characters");
    expect(at("episodes/EP001/segments/seg01").section).toBe("EP001 seg01");
    expect(at("episodes/EP001/edit").section).toBe("EP001 cut");
    expect(lineage.groups.map((group) => group.title)).toEqual(["Text", "Characters", "Locations", "Props", "EP001 seg01", "EP001 cut"]);
    // Every node has drama-cli's size, and each picture sits inside its group's frame; a text stage is a collapsed row of the Text group.
    for (const node of lineage.nodes) {
      expect([node.box.w, node.box.h]).toEqual([300, 340]);
      if (node.section === "Text") continue;
      const group = lineage.groups.find((one) => one.title === node.section)!;
      expect(node.box.x >= group.x && node.box.y >= group.y && node.box.x + node.box.w <= group.x + group.w && node.box.y + node.box.h <= group.y + group.h, node.id).toBe(true);
    }
    const lead = at("assets/characters/lin").box;
    const segment = lineage.groups.find((group) => group.title === "EP001 seg01")!;
    expect(segment.x).toBeGreaterThan(lead.x + lead.w);
  });

  it("is handed back as handoff/lineage.json", () => {
    expect(replayLineage({ preset: "", bible: null, looks: {}, references: {}, episodes: {} }, []).path).toBe("handoff/lineage.json");
  });

  it("has a stage for each thing made, at its versions, everything fresh", () => {
    const lineage = read(progress);
    const by = (id: string) => lineage.nodes.find((node) => node.id === id);
    expect(by("assets/characters/lin/states/S1")?.kind).toBe("look");
    expect(by("assets/props/letter")?.kind).toBe("prop");
    expect(by("episodes/EP001/multi_panel_storyboard/seg01/photoreal")).toMatchObject({ version: "v2", accepted: "v2" });
    expect(by("episodes/EP001/segments/seg01")).toMatchObject({ kind: "take", version: "t02", accepted: "t02" });
    expect(by("episodes/EP001/edit")).toMatchObject({ kind: "cut", version: "v1", accepted: null });
    expect(lineage.nodes.every((node) => node.fresh === true && node.problems.length === 0)).toBe(true);
  });

  it("shows the file a stop returned for each version, whatever its extension, and none where no stop returned one", () => {
    const lineage = read(progress);
    const shows = (id: string) => lineage.nodes.find((node) => node.id === id)?.shows;
    expect(shows("assets/characters/lin")).toBe("assets/characters/lin/v1/image-1.jpg");
    expect(shows("episodes/EP001/segments/seg01")).toBe("episodes/EP001/segments/seg01/t02/video.mp4");
    expect(shows("assets/props/letter")).toBeNull();
  });

  it("shows a version's picture, video or text, never the request or spec returned beside it", () => {
    const lineage = read(progress, ["drama/assets/characters/lin/v1/spec.json", "drama/assets/characters/lin/v1/request.json", "drama/assets/characters/lin/v1/image-1.jpg", "drama/episodes/EP001/segments/seg01/t02/spec.json"]);
    const shows = (id: string) => lineage.nodes.find((node) => node.id === id)?.shows;
    expect(shows("assets/characters/lin")).toBe("assets/characters/lin/v1/image-1.jpg");
    expect(shows("episodes/EP001/segments/seg01")).toBeNull();
  });

  it("links each take to the storyboard, looks and place it was made from, and the cut to its takes", () => {
    const { up, down } = trace(read(progress), "episodes/EP001/segments/seg01");
    expect(up).toContain("episodes/EP001/multi_panel_storyboard/seg01/line-art");
    expect(up).toContain("assets/characters/lin");
    expect(up).toContain("assets/scenes/home");
    expect([...down]).toEqual(["episodes/EP001/edit"]);
  });

  it("has no episode stage before the episode's boards are drawn", () => {
    const lineage = read({ ...progress, episodes: { EP001: { segments: ["seg01"] } } });
    expect(lineage.nodes.map((node) => node.id).filter((id) => id.startsWith("episodes/"))).toEqual(["episodes/EP001/breakdown"]);
  });
});

describe("a sample drama's own lineage at a stop", () => {
  // drama-cli's export of a finished run, in its own form: a plate and its front view, a first-frame reference, a take.
  const node = (id: number, stage: string, kind: string, section: string, inputs: [string, number][], outputs: number[]) => ({
    id,
    inputs: inputs.map(([name, link]) => ({ name, link })),
    outputs: [{ links: outputs }],
    properties: { id: stage, kind, section },
  });
  const exported = new TextEncoder().encode(
    JSON.stringify({
      nodes: [
        node(1, "screenplay", "screenplay", "Text", [], [1]),
        node(2, "bible", "bible", "Text", [["screenplay", 1]], [2, 3]),
        node(3, "assets/characters/lin", "look", "Characters", [["bible", 2]], [4]),
        node(4, "assets/scenes/home", "plate", "Locations", [["bible", 3]], [5]),
        node(5, "assets/scenes/home/front", "plate", "Locations", [["assets/scenes/home", 5]], []),
        node(6, "episodes/EP001/blocking/seg01", "blocking", "EP001 seg01", [["assets/characters/lin", 4]], [6]),
        node(7, "episodes/EP001/first_frame_reference/seg01", "first_frame_reference", "EP001 seg01", [["episodes/EP001/blocking/seg01", 6]], []),
        // drama-cli draws a plate's floor plan from nothing, then the plate from its views.
        node(8, "assets/scenes/home/floor-plan", "plate", "Locations", [], []),
      ],
      links: [
        [1, 1, 0, 2, 0, "DRAMA_CLI_FILE"],
        [2, 2, 0, 3, 0, "DRAMA_CLI_FILE"],
        [3, 2, 0, 4, 0, "DRAMA_CLI_FILE"],
        [4, 3, 0, 6, 0, "DRAMA_CLI_FILE"],
        [5, 4, 0, 5, 0, "DRAMA_CLI_FILE"],
        [6, 6, 0, 7, 0, "DRAMA_CLI_FILE"],
      ],
      groups: [{ title: "Text" }, { title: "Characters" }, { title: "Locations" }, { title: "EP001 seg01" }],
    }),
  );
  const at = (p: ReplayProgress) => JSON.parse(new TextDecoder().decode(lineageAt(p, exported))) as { nodes: { id: number; properties: { id: string }; outputs: { links: number[] }[] }[]; links: number[][]; groups: { title: string }[] };

  it("holds only what the drama has made by then, and what is made from that alone", () => {
    // The leads' looks are drawn; no place yet, no episode.
    const early = at({ preset: "en-us-live-sfw", bible: "v1", looks: { lin: v1 }, references: {}, episodes: {} });
    expect(early.nodes.map((n) => n.properties.id)).toEqual(["screenplay", "bible", "assets/characters/lin"]);
    expect(early.links.map(([id]) => id)).toEqual([1, 2]);
    expect(early.nodes.find((n) => n.id === 2)!.outputs[0].links).toEqual([2]);
    expect(early.groups.map((g) => g.title)).toEqual(["Text", "Characters"]);
    // With the place drawn, its plate and the view made from it come in.
    const later = at({ preset: "en-us-live-sfw", bible: "v1", looks: { lin: v1 }, references: { home: { ...v1, path: "assets/scenes/home" } }, episodes: {} });
    expect(later.nodes.map((n) => n.properties.id)).toContain("assets/scenes/home/front");
    expect(later.nodes.map((n) => n.properties.id)).toContain("assets/scenes/home/floor-plan");
    expect(later.links.map(([id]) => id)).toEqual([1, 2, 3, 5]);
    // Once EP001's boards are drawn, its blocking and the first-frame reference made from it come in.
    const boards = at({ preset: "en-us-live-sfw", bible: "v1", looks: { lin: v1 }, references: { home: { ...v1, path: "assets/scenes/home" } }, episodes: { EP001: { segments: ["seg01"], boards: { seg01: v1 } } } });
    expect(boards.nodes.map((n) => n.properties.id)).toContain("episodes/EP001/first_frame_reference/seg01");
  });
});
