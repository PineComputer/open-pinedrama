// Replay's lineage exports read as drama-cli's do (the parser drama-cli's real exports pass),
// with a stage for each thing its recording made, the picture each stop returned, and a link
// from each picture to what was made from it.
import { describe, expect, it } from "vitest";
import { parseLineage, trace } from "../shared/lineage.ts";
import { replayLineage } from "./replay-lineage.ts";
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
