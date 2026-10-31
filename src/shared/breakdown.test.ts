// Each segment's shots out of drama-cli's breakdown.json, as the canvas shows them (D66).
import { describe, expect, it } from "vitest";
import { breakdownShots } from "./breakdown.ts";

const shot = { time: "0-3s", size: "close-up", angle: "eye level", camera: "Static close-up.", visual: "Lin looks up.", audio: "Room tone.", characters: ["lin"] };

describe("a breakdown's shots", () => {
  it("are each segment's, in order, with drama-cli's fields", () => {
    const shots = breakdownShots({ episode: "EP001", title: "x", segments: [{ id: "seg01", dialogue: [{ speaker: "lin", line: "到了。" }], shots: [shot, { ...shot, time: "3-6s", lines: [0] }] }, { id: "seg02", dialogue: [], shots: [] }] });
    expect([...shots.keys()]).toEqual(["seg01", "seg02"]);
    expect(shots.get("seg01")).toEqual([
      { time: "0-3s", size: "close-up", angle: "eye level", camera: "Static close-up.", visual: "Lin looks up.", audio: "Room tone.", dialogue: [] },
      { time: "3-6s", size: "close-up", angle: "eye level", camera: "Static close-up.", visual: "Lin looks up.", audio: "Room tone.", dialogue: ["lin: 到了。"] },
    ]);
  });

  it("name the field drama-cli's schema wants and the file lacks", () => {
    expect(() => breakdownShots({ segments: [{ id: "seg01", dialogue: [], shots: [{ ...shot, visual: undefined }] }] })).toThrow("segments[0].shots[0].visual is not a string");
    expect(() => breakdownShots({ segments: [{ id: "seg01", dialogue: [], shots: [{ ...shot, lines: [2] }] }] })).toThrow("segments[0].shots[0].lines[0] is not a position in segments[0].dialogue");
    expect(() => breakdownShots({ segments: "none" })).toThrow("segments is not a list");
  });
});
