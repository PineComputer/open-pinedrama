// Each segment's shots out of drama-cli's breakdown.json, as the canvas shows them (D66).
import { describe, expect, it } from "vitest";
import { breakdownShots } from "./breakdown.ts";

const shot = { time: "0-3s", size: "close-up", angle: "eye level", camera: "Static close-up.", visual: "Lin looks up.", audio: "Room tone.", characters: ["lin"] };

describe("a breakdown's shots", () => {
  it("are each segment's, in order, with drama-cli's fields", () => {
    const shots = breakdownShots({ episode: "EP001", title: "x", segments: [{ id: "seg01", shots: [shot, { ...shot, time: "3-6s" }] }, { id: "seg02", shots: [] }] });
    expect([...shots.keys()]).toEqual(["seg01", "seg02"]);
    expect(shots.get("seg01")).toEqual([
      { time: "0-3s", size: "close-up", angle: "eye level", camera: "Static close-up.", visual: "Lin looks up.", audio: "Room tone." },
      { time: "3-6s", size: "close-up", angle: "eye level", camera: "Static close-up.", visual: "Lin looks up.", audio: "Room tone." },
    ]);
  });

  it("name the field drama-cli's schema wants and the file lacks", () => {
    expect(() => breakdownShots({ segments: [{ id: "seg01", shots: [{ ...shot, visual: undefined }] }] })).toThrow("segments[0].shots[0].visual is not a string");
    expect(() => breakdownShots({ segments: "none" })).toThrow("segments is not a list");
  });
});
