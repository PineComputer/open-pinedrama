// What a person reads of drama-cli's words: a scene heading without Fountain's scene number; a refusal's first line.
import { describe, expect, it } from "vitest";
import { firstLine, headingText } from "./labels.ts";

describe("a scene heading", () => {
  it("reads without the scene number Fountain writes between #s at its end", () => {
    expect(headingText("INT. LUCA'S APARTMENT - NIGHT #6-1#")).toBe("INT. LUCA'S APARTMENT - NIGHT");
    expect(headingText("内景 办公室 - 日 #1A#")).toBe("内景 办公室 - 日");
    expect(headingText("EXT. PIER - DAY")).toBe("EXT. PIER - DAY");
  });
});

describe("drama-cli's first line", () => {
  const project = "/var/lib/sandbox/sessions/amber-grove-f3d957/files/drama";
  it("is its words up to the first \"; \" or \". \", each path from the project's folder, never reworded", () => {
    const said = `${project}/rewrite.fountain:41: scene_time: the scene heading's time is '黄昏': write 日 or 夜; fix ${project}/rewrite.fountain`;
    expect(firstLine(said, project)).toBe("rewrite.fountain:41: scene_time: the scene heading's time is '黄昏': write 日 or 夜");
    expect(firstLine(said, `${project}/`)).toBe("rewrite.fountain:41: scene_time: the scene heading's time is '黄昏': write 日 or 夜");
    expect(firstLine("Pine returned HTTP 403. Restore access.")).toBe("Pine returned HTTP 403");
    // A path's dot, or a version number's, is no end of a sentence.
    expect(firstLine("bible/v2.1 is stale")).toBe("bible/v2.1 is stale");
  });
});
