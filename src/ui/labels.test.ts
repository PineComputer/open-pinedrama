// What a person reads of drama-cli's words: a scene heading without Fountain's scene number.
import { describe, expect, it } from "vitest";
import { headingText } from "./labels.ts";

describe("a scene heading", () => {
  it("reads without the scene number Fountain writes between #s at its end", () => {
    expect(headingText("INT. LUCA'S APARTMENT - NIGHT #6-1#")).toBe("INT. LUCA'S APARTMENT - NIGHT");
    expect(headingText("内景 办公室 - 日 #1A#")).toBe("内景 办公室 - 日");
    expect(headingText("EXT. PIER - DAY")).toBe("EXT. PIER - DAY");
  });
});
