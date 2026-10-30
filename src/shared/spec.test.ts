import { describe, expect, it } from "vitest";
import { specBeside, specFacts } from "./spec.ts";
import type { FileItem } from "./types.ts";

describe("a version's spec.json", () => {
  it("gives a take's model, ratio, seconds and text prompt as drama-cli wrote them", () => {
    const take = { model: "seedance-2-5", content: [{ type: "image_url", image_url: { url: "x" } }, { type: "text", text: "Nora walks in." }], duration: 8, ratio: "9:16", resolution: "480p", seed: 42 };
    expect(specFacts(JSON.stringify(take))).toEqual({ model: "seedance-2-5", ratio: "9:16", seconds: 8, resolution: "480p", prompt: "Nora walks in.", seed: 42 });
  });

  it("gives a picture's model, aspect ratio and prompt", () => {
    expect(specFacts(JSON.stringify({ provider: "seedream", model: "seedream-5", prompt: "A pier at dawn.", aspect_ratio: "9:16", size: "2K" }))).toEqual({ model: "seedream-5", ratio: "9:16", resolution: "2K", prompt: "A pier at dawn.", seconds: undefined, seed: undefined });
  });

  it("gives nothing for text that isn't a JSON object", () => {
    expect(specFacts("not json")).toBeUndefined();
    expect(specFacts("[1]")).toBeUndefined();
  });

  it("is found in the same version's folder, never another's", () => {
    const file = (id: number, path: string, kind: FileItem["kind"]) => ({ id, path, kind }) as FileItem;
    const files = [file(1, "a/seg01/takes/t01/spec.json", "spec"), file(2, "a/seg01/takes/t02/spec.json", "spec")];
    expect(specBeside(file(3, "a/seg01/takes/t02/take.mp4", "take"), files)?.id).toBe(2);
    expect(specBeside(file(4, "a/seg01/takes/t03/take.mp4", "take"), files)).toBeUndefined();
  });
});
