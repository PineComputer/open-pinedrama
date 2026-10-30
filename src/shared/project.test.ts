// Reading where a project stands from drama-cli's status report (fixtures/status): what each
// stage, reference and episode has made, accepted and still needs, and the budget.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStatus, setupStep, StatusError } from "./project.ts";

function report(name: string): Record<string, any> {
  return JSON.parse(readFileSync(new URL(`../../fixtures/status/${name}.json`, import.meta.url), "utf8"));
}

describe("a status report, read", () => {
  it("of a new project: nothing made, and the bible's steps to make it", () => {
    const state = parseStatus(report("new"));
    expect(state.preset).toBe("zh-cn-live-sfw");
    expect(state.bible).toMatchObject({ current: null, accepted: null, usable: false, why: "bible: none is made" });
    expect(state.bible.run).toHaveLength(2);
    expect(state.characters).toEqual({});
    expect(state.episodes).toEqual({});
    expect(state.budget).toEqual({ budgetUsd: 20, spentUsd: 0, reservedUsd: 0, remainingUsd: 20 });
  });

  it("after the story: the bible's coverage, a look and a plate accepted", () => {
    const state = parseStatus(report("story"));
    expect(state.bible).toMatchObject({ current: "v1", accepted: "v1", usable: true, run: [] });
    expect(state.bible.coverage).toEqual({ episodes: 1 });
    expect(state.characters.lin).toMatchObject({ accepted: "v1", usable: true, looks: {} });
    expect(state.locations.office).toMatchObject({ accepted: "v1", usable: true, times: {} });
  });

  it("with a breakdown accepted: the reference the episode needs, and the segments that need it", () => {
    const episode = parseStatus(report("needs")).episodes.EP001;
    expect(episode.breakdown).toMatchObject({ accepted: "v1", usable: true });
    expect(episode.cut).toMatchObject({ current: null, usable: false });
    expect(episode.needs).toEqual([
      expect.objectContaining({ reference: "location office plate at Day", segments: ["seg01"], why: "location office plate at Day: none is made" }),
    ]);
    expect(episode.needs?.[0].run).toHaveLength(2);
    expect(episode.sceneChains).toEqual([{ sceneHeading: "INT. OFFICE - DAY #1-1#", segments: ["seg01"] }]);
    expect(episode.segments.seg01).toMatchObject({ current: null, takes: [] });
  });

  it("with storyboards: each segment's blocking and storyboard by style, and nothing more needed", () => {
    const state = parseStatus(report("boards"));
    const episode = state.episodes.EP001;
    expect(episode.blocking.seg01).toMatchObject({ accepted: "v1", usable: true });
    expect(episode.storyboards.seg01["line-art"]).toMatchObject({ accepted: "v1", usable: true });
    expect(episode.videoPrompts).toEqual({ current: null, stale: [] });
    expect(episode.needs).toEqual([]);
    expect(state.locations.office.times.Day).toMatchObject({ accepted: "v1" });
  });

  it("the same way every time", () => {
    expect(parseStatus(report("boards"))).toEqual(parseStatus(report("boards")));
  });
});

describe("what a report states that the fixtures don't", () => {
  it("a bible covering only some episodes, with the next range to write", () => {
    const partial = report("story");
    partial.bible.coverage = { episodes: 20, next: "drama-cli bible --episodes EP021-EP040 --config c.yaml" };
    expect(parseStatus(partial).bible.coverage).toEqual({ episodes: 20, next: "drama-cli bible --episodes EP021-EP040 --config c.yaml" });
  });

  it("no cap on spending, and a budget spent", () => {
    const open = report("new");
    open.budget = { ...open.budget, budget_usd: null, remaining_usd: null, spent_usd: 41.2 };
    expect(parseStatus(open).budget).toEqual({ budgetUsd: null, spentUsd: 41.2, reservedUsd: 0, remainingUsd: null });
    const spent = report("new");
    spent.budget = { ...spent.budget, spent_usd: 19.5, reserved_usd: 0.5, remaining_usd: 0 };
    expect(parseStatus(spent).budget.remainingUsd).toBe(0);
  });

  it("a segment's takes, each with its state and whether it is accepted", () => {
    const shot = report("boards");
    shot.episodes.EP001.segments.seg01.takes = [
      { version: "t01", state: "downloaded", accepted: false },
      { version: "t02", state: "running", accepted: false },
    ];
    expect(parseStatus(shot).episodes.EP001.segments.seg01.takes).toEqual([
      { version: "t01", state: "downloaded", accepted: false },
      { version: "t02", state: "running", accepted: false },
    ]);
  });

  it("a stage drama-cli couldn't read, with what it said", () => {
    const broken = report("story");
    broken.characters.lin = { current: null, current_error: "assets/characters/lin/current.json is not valid JSON", candidate: null, accepted: null, usable: false, usable_error: "cannot read" };
    expect(parseStatus(broken).characters.lin.errors).toEqual(["assets/characters/lin/current.json is not valid JSON", "cannot read"]);
  });
});

describe("a report that doesn't read as drama-cli writes it", () => {
  it("is refused, naming the field", () => {
    const missing = report("new");
    delete missing.bible;
    expect(() => parseStatus(missing)).toThrow(StatusError);
    expect(() => parseStatus(missing)).toThrow(/bible/);
  });

  it("names a field of the wrong kind by its place", () => {
    const wrong = report("needs");
    wrong.episodes.EP001.breakdown.usable = "yes";
    expect(() => parseStatus(wrong)).toThrow(/episodes\.EP001\.breakdown\.usable/);
  });

  it("doesn't fill in a missing budget figure", () => {
    const missing = report("new");
    delete missing.budget.spent_usd;
    expect(() => parseStatus(missing)).toThrow(/budget\.spent_usd/);
  });

  it("refuses what isn't a report at all", () => {
    expect(() => parseStatus("not json")).toThrow(StatusError);
    expect(() => parseStatus(null)).toThrow(StatusError);
  });
});

describe("where the setup stands, from the report", () => {
  it("before the bible is accepted, the report doesn't say: the conversation does", () => {
    expect(setupStep(parseStatus(report("new")))).toBeUndefined();
  });

  it("with the leads' looks accepted and nothing prepared, preparing the episodes", () => {
    expect(setupStep(parseStatus(report("story")))).toBe(4);
  });

  it("with a breakdown that still needs a reference, still preparing", () => {
    expect(setupStep(parseStatus(report("needs")))).toBe(4);
  });

  it("with every breakdown accepted and nothing more needed, approving the shared references", () => {
    expect(setupStep(parseStatus(report("boards")))).toBe(5);
  });

  it("with the bible accepted and a lead's look made, not yet accepted, approving the leads", () => {
    const drawn = report("story");
    drawn.characters.lin = { ...drawn.characters.lin, accepted: null, candidate: "v1", usable: false, why: "not accepted" };
    expect(setupStep(parseStatus(drawn))).toBe(3);
  });

  it("with the bible accepted and no look made yet, drawing the leads", () => {
    const bibleOnly = report("story");
    bibleOnly.characters = {};
    bibleOnly.scenes = {};
    expect(setupStep(parseStatus(bibleOnly))).toBe(2);
  });
});
