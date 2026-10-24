import { describe, expect, it } from "vitest";
import { classify, episodeCode, listedEpisodes, namedPaths } from "./classify.ts";

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

  it("reads the packed projects sessions hand over", () => {
    expect(classify("handoff/project.tar.part-aa")).toEqual({ kind: "archive" });
    expect(classify("work/handoff/EP007.tar.part-ab")).toEqual({ kind: "archive", episode: "EP007" });
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

  it("reads what the skill added: a place at night, first frames, subtitles, and the script beside a breakdown", () => {
    expect(classify("drama/assets/scenes/office/times/Night/v2/image-1.png")).toMatchObject({ kind: "location", subject: "office", look: "Night", version: "v2" });
    expect(classify("drama/assets/scenes/office/v1/image-1.png")).not.toHaveProperty("look");
    expect(classify("drama/episodes/EP004/first_frame_reference/seg02/v1/image-1.jpg")).toMatchObject({ kind: "frame", episode: "EP004", segment: "seg02", version: "v1" });
    expect(classify("drama/episodes/EP004/asr_align/v1/cut.srt")).toMatchObject({ kind: "subtitles", episode: "EP004", version: "v1" });
    expect(classify("drama/episodes/EP004/breakdown/v1/script.md")).toEqual({ kind: "other" });
    expect(classify("drama/episodes/EP004/breakdown/v1/breakdown.json")).toMatchObject({ kind: "breakdown" });
  });

  it("takes the leads' faces as part of their looks, and further looks as shared references", async () => {
    const { inferKind } = await import("./reviews.ts");
    const face = classify("drama/assets/characters/nora/states/face/v1/image-1.jpg");
    expect(face).toMatchObject({ kind: "look", subject: "nora", look: "face" });
    const base = classify("drama/assets/characters/nora/v1/image-1.jpg");
    expect(inferKind("setup", [base, face])).toBe("looks");
    expect(inferKind("setup", [base, face, classify("drama/assets/characters/nora/states/S2/v1/image-1.jpg")])).toBe("references");
    expect(inferKind("setup", [base, classify("drama/assets/scenes/pier/times/Night/v1/image-1.png")])).toBe("references");
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

  it("takes the listed title over a passing mention, as the drama skill's agent wrote one", () => {
    const summary = [
      "The Last Ferry project is complete and packed.",
      "- Accepted: bible v2, EP001 breakdown v1, Nora and Elias lead looks, harbor-pier base/Night plates, and ferry-ticket prop.",
      "[Download the handoff part](handoff/project.tar.part-aa)",
      "EP001: One More Minute",
    ].join("\n");
    expect(listedEpisodes(summary)).toEqual([{ number: 1, title: "One More Minute" }]);
    expect(listedEpisodes("Packed EP002 for you.")).toEqual([{ number: 2, title: "for you." }]);
  });
});

describe("namedPaths", () => {
  it("finds the files a question names but didn't return, as Pine's agent wrote one", () => {
    const question = [
      "请审批主角林晚的 v1 look。当前文件如下：",
      "- [剧集 Bible](drama/bible/v1/bible.md)",
      "- [林晚 v1 look sheet](drama/assets/characters/林晚/v1/image-1.png)",
      "See `drama/episodes/EP001/edit/v1/cut.mp4`, handoff/EP001.tar.part-aa and /var/lib/sandbox/sessions/x/files/drama/assets/props/letter/v2/image-1.png.",
      "Not https://example.com/a.png, nor 1.5, e.g. or a/b, nor ../secret/key.pem.",
    ].join("\n");
    expect(namedPaths(question)).toEqual([
      "drama/bible/v1/bible.md",
      "drama/assets/characters/林晚/v1/image-1.png",
      "drama/episodes/EP001/edit/v1/cut.mp4",
      "handoff/EP001.tar.part-aa",
      "drama/assets/props/letter/v2/image-1.png",
    ]);
  });
});

describe("what the agent wrote", () => {
  it("reads episodes listed on one line, and line breaks the agent wrote out as \\n", async () => {
    const { said } = await import("./pine-fleet.ts");
    expect(listedEpisodes("EP001: 回乡 EP002: 量体\nEP3 - Dinner").map((item) => [item.number, item.title])).toEqual([
      [1, "回乡"],
      [2, "量体"],
      [3, "Dinner"],
    ]);
    const summary = said("归档：[project.tar.part-aa](handoff/project.tar.part-aa)\\n\\nEP001: 回乡\\nEP002: 量体");
    expect(listedEpisodes(summary)).toHaveLength(2);
    expect(said("keep C:\\\\new as written")).toBe("keep C:\\\\new as written");
  });
});
