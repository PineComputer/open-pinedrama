// What the agent panel shows, worked out from the project's state (drama-cli's reports, merged)
// and the files its stops returned: what is still to do, and where each recent piece of work
// stands. Facts only; the screens word them in the maker's language.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recentWork, stageOfFile, toDo } from "./facts.ts";
import { parseStatus } from "./project.ts";

function state(name: string, change?: (report: Record<string, any>) => void) {
  const report = JSON.parse(readFileSync(new URL(`../../fixtures/status/${name}.json`, import.meta.url), "utf8"));
  change?.(report);
  const { budget: _budget, ...rest } = parseStatus(report);
  return rest;
}

describe("to do", () => {
  it("lists a shared reference an episode still needs, as drama-cli names it", () => {
    expect(toDo(state("needs"))).toContainEqual({ where: "references", subject: "location office plate at Day", state: "make" });
  });

  it("lists what waits for review and what went stale, not what is done", () => {
    const items = toDo(
      state("boards", (report) => {
        report.characters.lin = { ...report.characters.lin, current: "v2", candidate: "v2", usable: false, why: "not accepted" };
        report.scenes.office = { ...report.scenes.office, usable: false, why: "location office: it is stale: its floor plan changed" };
      }),
    );
    expect(items).toContainEqual({ where: "cast", subject: "lin", state: "review" });
    expect(items).toContainEqual({ where: "locations", subject: "office", state: "stale" });
    expect(items.some((item) => item.step === "storyboard")).toBe(false);
  });

  it("lists each episode's next step, once", () => {
    expect(toDo(state("boards")).filter((item) => item.where === "EP001")).toEqual([{ where: "EP001", step: "takes", subject: "seg01", state: "make" }]);
  });

  it("is empty when nothing is left to do", () => {
    expect(
      toDo(
        state("boards", (report) => {
          report.episodes = {};
        }),
      ),
    ).toEqual([]);
  });
});

describe("a returned file's stage", () => {
  it.each([
    ["drama/assets/characters/lin/v2/image-1.png", ["characters", "lin"]],
    ["drama/assets/characters/lin/states/S1/v1/image-1.png", ["characters", "lin", "looks", "S1"]],
    ["drama/assets/scenes/office/times/Night/v1/image-1.png", ["locations", "office", "times", "Night"]],
    ["drama/assets/scenes/office/v1/image-1.png", ["locations", "office"]],
    ["drama/assets/props/letter/v3/image-1.png", ["props", "letter"]],
    ["drama/episodes/EP001/multi_panel_storyboard/seg01/photoreal/v2/image-1.jpg", ["episodes", "EP001", "storyboards", "seg01", "photoreal"]],
    ["drama/episodes/EP001/blocking/seg02/v1/image-1.png", ["episodes", "EP001", "blocking", "seg02"]],
    ["drama/episodes/EP001/segments/seg01/t02/video.mp4", ["episodes", "EP001", "segments", "seg01"]],
    ["drama/episodes/EP001/edit/v1/cut.mp4", ["episodes", "EP001", "cut"]],
  ])("of %s is found where the report keeps it", (path, where) => {
    expect(stageOfFile(path)?.at).toEqual(where);
  });

  it("is none for a file no stage keeps", () => {
    expect(stageOfFile("handoff/status.json")).toBeUndefined();
  });
});

describe("recent work", () => {
  const files = [
    { path: "drama/episodes/EP001/multi_panel_storyboard/seg01/line-art/v1/image-1.png", createdAt: "2026-10-30T10:03:00Z" },
    { path: "drama/assets/characters/lin/v1/image-1.png", createdAt: "2026-10-30T10:01:00Z" },
    { path: "drama/assets/characters/lin/v2/image-1.png", createdAt: "2026-10-30T10:02:00Z" },
    { path: "handoff/status.json", createdAt: "2026-10-30T10:04:00Z" },
  ];

  it("is the newest versions first, each with where it stands", () => {
    const work = recentWork(
      state("boards", (report) => {
        report.characters.lin = { ...report.characters.lin, current: "v2", candidate: "v2", accepted: "v1", usable: false, why: "not accepted" };
        report.episodes.EP001.multi_panel_storyboard.seg01["line-art"] = { ...report.episodes.EP001.multi_panel_storyboard.seg01["line-art"], current: "v1", candidate: "v1", accepted: null, usable: false };
      }),
      files,
    );
    expect(work.map((item) => [item.kind, item.subject, item.version, item.state])).toEqual([
      ["storyboard", "EP001 seg01 line-art", "v1", "review"],
      ["look", "lin", "v2", "review"],
      // v1 stays the accepted version while v2 waits for review.
      ["look", "lin", "v1", "accepted"],
    ]);
  });

  it("says replaced for a version neither working nor accepted", () => {
    const work = recentWork(
      state("boards", (report) => {
        report.characters.lin = { ...report.characters.lin, current: "v3", candidate: null, accepted: "v3", usable: true };
      }),
      [files[1]],
    );
    expect(work[0].state).toBe("replaced");
  });

  it("says accepted for the version the report accepted", () => {
    expect(recentWork(state("boards"), [files[0]])[0].state).toBe("accepted");
  });

  it("keeps a version once, however many of its files came back", () => {
    const both = [files[0], { path: "drama/episodes/EP001/multi_panel_storyboard/seg01/line-art/v1/crop.png", createdAt: "2026-10-30T10:03:30Z" }];
    expect(recentWork(state("boards"), both)).toHaveLength(1);
  });
});
