// What the agent panel shows, worked out from the project's state (drama-cli's reports, merged)
// and the files its stops returned: what is still to do, and where each recent piece of work
// stands. Facts only; the screens word them in the maker's language.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scaleOf, stageOfFile, toDo } from "./facts.ts";
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

describe("a drama's scale", () => {
  it("counts its episodes, their scenes and their segments, as drama-cli's status lists them", () => {
    expect(scaleOf(state("boards"))).toEqual({ episodes: 1, scenes: 1, segments: 1 });
    expect(scaleOf(state("new"))).toEqual({ episodes: 0, scenes: 0, segments: 0 });
  });
});
