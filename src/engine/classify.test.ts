import { describe, expect, it } from "vitest";
import { classify, episodeCode, listedEpisodes } from "./classify.ts";

describe("classify", () => {
  it("reads a storyboard's episode, segment, style and version", () => {
    expect(classify("outputs/projects/show/episodes/EP002/multi_panel_storyboard/seg03/line-art/v4/image-1.jpg")).toEqual({
      kind: "storyboard",
      episode: "EP002",
      segment: "seg03",
      style: "line-art",
      version: "v4",
    });
  });

  it("reads takes and cuts", () => {
    expect(classify("episodes/EP010/segments/seg01b/t02/video.mp4")).toMatchObject({ kind: "take", episode: "EP010", segment: "seg01b", version: "t02" });
    expect(classify("episodes/EP010/edit/v3/cut.mp4")).toMatchObject({ kind: "cut", episode: "EP010", version: "v3" });
  });

  it("reads character looks, base and named", () => {
    expect(classify("assets/characters/lin/v2/image-1.png")).toMatchObject({ kind: "look", subject: "lin", look: "base", version: "v2" });
    expect(classify("assets/characters/lin/states/S1/v1/image-1.png")).toMatchObject({ kind: "look", subject: "lin", look: "S1" });
  });

  it("reads locations with a view folder, props, the bible and breakdowns", () => {
    expect(classify("assets/scenes/office/front/v1/image-1.png")).toMatchObject({ kind: "location", subject: "office" });
    expect(classify("assets/props/letter/v1/image-1.webp")).toMatchObject({ kind: "prop", subject: "letter" });
    expect(classify("bible/v3/bible.md")).toMatchObject({ kind: "bible", version: "v3" });
    expect(classify("episodes/EP001/breakdown/v2/breakdown.md")).toMatchObject({ kind: "breakdown", episode: "EP001" });
  });

  it("calls anything else other", () => {
    expect(classify("notes/today.txt")).toEqual({ kind: "other" });
    expect(classify("episodes/EP001/segments/seg01/t01/spec.json")).toEqual({ kind: "other" });
  });
});

describe("episodes", () => {
  it("normalizes codes", () => {
    expect(episodeCode("EP1")).toBe("EP001");
    expect(episodeCode(12)).toBe("EP012");
  });

  it("lists the episodes a summary names, in order, once each", () => {
    const summary = "Done.\nEP002: The letter\nEP001：初见\n- EP3 — Wedding\nEP001: again\nnothing here";
    expect(listedEpisodes(summary)).toEqual([
      { number: 1, title: "初见" },
      { number: 2, title: "The letter" },
      { number: 3, title: "Wedding" },
    ]);
  });
});
