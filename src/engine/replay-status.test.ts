// Replay's status reports read as drama-cli's do (the parser drama-cli's real reports pass),
// and say what its recording made and the maker approved at each stop.
import { describe, expect, it } from "vitest";
import { parseStatus, setupStep } from "../shared/project.ts";
import { replayStatus, type ReplayProgress } from "./replay-status.ts";

const read = (progress: ReplayProgress) => parseStatus(JSON.parse(new TextDecoder().decode(replayStatus(progress).bytes)));
const v1 = { current: "v1", accepted: "v1" };
const drawn = { current: "v1", accepted: null };
const segments = ["seg01", "seg02"];

describe("replay's status report", () => {
  it("is handed back as handoff/status.json", () => {
    expect(replayStatus({ preset: "", bible: null, looks: {}, references: {}, episodes: {} }).path).toBe("handoff/status.json");
  });

  it("at the first question: nothing made", () => {
    const state = read({ preset: "en-us-live-sfw", bible: null, looks: {}, references: {}, episodes: {} });
    expect(state.bible.usable).toBe(false);
    expect(setupStep(state)).toBeUndefined();
  });

  it("with the leads drawn and waiting for the maker", () => {
    const state = read({ preset: "", bible: "v1", looks: { lin: drawn, wei: { current: "v2", accepted: null } }, references: {}, episodes: {} });
    expect(state.characters.wei).toMatchObject({ current: "v2", candidate: "v2", accepted: null, usable: false });
    expect(setupStep(state)).toBe(3);
  });

  it("files each shared reference by its asset: another character, a further look, a place's time, a prop", () => {
    const state = read({
      preset: "",
      bible: "v1",
      looks: { lin: v1 },
      references: {
        "office/Night": { ...drawn, path: "assets/scenes/office/times/Night" },
        office: { ...v1, path: "assets/scenes/office" },
        "blair/S1": { ...v1, path: "assets/characters/blair/states/S1" },
        blair: { ...v1, path: "assets/characters/blair" },
        letter: { ...v1, path: "assets/props/letter" },
      },
      episodes: {},
    });
    expect(state.characters.blair).toMatchObject({ accepted: "v1", usable: true });
    expect(state.characters.blair.looks.S1).toMatchObject({ accepted: "v1" });
    expect(state.locations.office.times.Night).toMatchObject({ current: "v1", accepted: null, usable: false });
    expect(state.props.letter).toMatchObject({ usable: true });
  });

  it("with the shared references drawn: each episode needs them until they are approved", () => {
    const drawnReferences = read({ preset: "", bible: "v1", looks: { lin: v1 }, references: { "lin/S1": { ...drawn, path: "assets/characters/lin/states/S1" }, home: { ...drawn, path: "assets/scenes/home" }, letter: { ...drawn, path: "assets/props/letter" } }, episodes: { EP001: { segments } } });
    expect(drawnReferences.characters.lin.looks.S1.candidate).toBe("v1");
    expect(drawnReferences.props.letter.candidate).toBe("v1");
    expect(drawnReferences.episodes.EP001.needs?.map((need) => need.reference)).toEqual(["lin/S1", "home", "letter"]);
    expect(setupStep(drawnReferences)).toBe(4);
    const approved = read({ preset: "", bible: "v1", looks: { lin: v1 }, references: { "lin/S1": { ...v1, path: "assets/characters/lin/states/S1" }, home: { ...v1, path: "assets/scenes/home" }, letter: { ...v1, path: "assets/props/letter" } }, episodes: { EP001: { segments } } });
    expect(approved.episodes.EP001.needs).toEqual([]);
    expect(setupStep(approved)).toBe(5);
  });

  it("through an episode, item by item: storyboards in both styles, then takes, then the cut", () => {
    const episode = (made: ReplayProgress["episodes"][string]) => read({ preset: "", bible: "v1", looks: { lin: v1 }, references: { home: { ...v1, path: "assets/scenes/home" } }, episodes: { EP001: made } }).episodes.EP001;
    const boards = episode({ segments, boards: { seg01: { current: "v2", accepted: null }, seg02: v1 } });
    expect(boards.storyboards.seg01["line-art"]).toMatchObject({ current: "v2", candidate: "v2", usable: false });
    expect(boards.storyboards.seg01.photoreal).toMatchObject({ current: "v2", candidate: "v2", usable: false });
    expect(boards.storyboards.seg02.photoreal).toMatchObject({ accepted: "v1", usable: true });
    const takes = episode({ segments, boards: { seg01: v1, seg02: v1 }, takes: { seg01: { count: 2, accepted: false }, seg02: { count: 1, accepted: true } } });
    expect(takes.segments.seg01.takes).toEqual([
      { version: "t01", state: "downloaded", accepted: false },
      { version: "t02", state: "downloaded", accepted: false },
    ]);
    expect(takes.segments.seg02.takes).toEqual([{ version: "t01", state: "downloaded", accepted: true }]);
    const cut = episode({ segments, boards: { seg01: v1, seg02: v1 }, takes: { seg01: { count: 1, accepted: true }, seg02: { count: 1, accepted: true } }, cut: { current: "v1", accepted: "v1" } });
    expect(cut.cut).toMatchObject({ accepted: "v1", usable: true });
  });

  it("reports each first-frame reference the recording returns, per segment folder, as drama-cli does (stages.py:4679)", () => {
    const state = read({ preset: "", bible: "v1", looks: { lin: v1 }, references: {}, episodes: { EP001: { segments, boards: { seg01: v1, seg02: v1 }, firstFrames: { seg01: "v1" } } } });
    expect(state.episodes.EP001.firstFrames.seg01).toMatchObject({ current: "v1", accepted: "v1", usable: true });
    expect(state.episodes.EP001.firstFrames.seg02).toBeUndefined();
  });
});
