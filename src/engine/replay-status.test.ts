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

  it("with the shared references drawn: each episode needs them until they are approved", () => {
    const drawnReferences = read({ preset: "", bible: "v1", looks: { lin: v1 }, references: { "lin/S1": drawn, home: drawn, letter: drawn }, episodes: { EP001: { segments } } });
    expect(drawnReferences.characters.lin.looks.S1.candidate).toBe("v1");
    expect(drawnReferences.props.letter.candidate).toBe("v1");
    expect(drawnReferences.episodes.EP001.needs?.map((need) => need.reference)).toEqual(["lin/S1", "home", "letter"]);
    expect(setupStep(drawnReferences)).toBe(4);
    const approved = read({ preset: "", bible: "v1", looks: { lin: v1 }, references: { "lin/S1": v1, home: v1, letter: v1 }, episodes: { EP001: { segments } } });
    expect(approved.episodes.EP001.needs).toEqual([]);
    expect(setupStep(approved)).toBe(5);
  });

  it("through an episode: storyboards, then takes, then the cut", () => {
    const episode = (made: ReplayProgress["episodes"][string]) => read({ preset: "", bible: "v1", looks: { lin: v1 }, references: { home: v1 }, episodes: { EP001: made } }).episodes.EP001;
    expect(episode({ segments, boards: drawn }).storyboards.seg01["line-art"]).toMatchObject({ candidate: "v1", usable: false });
    const takes = episode({ segments, boards: v1, takes: { count: 2, accepted: false } });
    expect(takes.segments.seg02.takes).toEqual([
      { version: "t01", state: "downloaded", accepted: false },
      { version: "t02", state: "downloaded", accepted: false },
    ]);
    const cut = episode({ segments, boards: v1, takes: { count: 1, accepted: true }, cut: { current: "v1", accepted: "v1" } });
    expect(cut.cut).toMatchObject({ accepted: "v1", usable: true });
    expect(cut.segments.seg01.takes[0].accepted).toBe(true);
  });
});
