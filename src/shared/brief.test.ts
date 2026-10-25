import { describe, expect, it } from "vitest";
import { briefSeconds, secondsText } from "./brief.ts";

describe("a brief's episode length", () => {
  it("reads the line the drama skill reads", () => {
    expect(briefSeconds("# Brief\n\n- Title: X\n- Episode length: about half a minute (25 to 35 seconds).\n")).toEqual({ min: 25, max: 35 });
    expect(briefSeconds("Episode length: a minute and a half (90 seconds).")).toEqual({ min: 90, max: 90 });
    expect([secondsText({ min: 25, max: 35 }), secondsText({ min: 90, max: 90 })]).toEqual(["25–35", "90"]);
  });

  it("finds none in other words, as the skill would", () => {
    expect(briefSeconds("- Episode length: about 90 seconds.")).toBeUndefined();
    expect(briefSeconds("每集时长：约一分半（90 秒）")).toBeUndefined();
    expect(briefSeconds("# Brief\n- Title: X\n")).toBeUndefined();
  });
});
