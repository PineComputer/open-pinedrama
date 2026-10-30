// Replay's samples: the sample samples.json names for a path's first version, returned at its own
// extension; none for a redrawn version, a path it leaves out or a file Git LFS hasn't fetched, so
// replay draws its placeholder.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sampleKey, samplesFrom } from "./replay-samples.ts";

function folder(files: Record<string, string | Uint8Array>) {
  const root = mkdtempSync(path.join(tmpdir(), "replay-samples-"));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), body);
  }
  return root;
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const table = { en: { "drama/assets/characters/lin/vN/image-1": "en/lin.jpg", "drama/episodes/EP001/segments/seg01/t01/video": "en/seg01-t01.mp4" }, zh: {} };

describe("replay's samples", () => {
  it("are keyed by the path with its version as vN and no extension, for the first version only", () => {
    expect(sampleKey("drama/assets/characters/lin/v1/image-1.svg")).toBe("drama/assets/characters/lin/vN/image-1");
    expect(sampleKey("drama/assets/characters/lin/v3/image-1.svg")).toBeUndefined();
    expect(sampleKey("drama/episodes/EP001/segments/seg01/t01/video.mp4")).toBe("drama/episodes/EP001/segments/seg01/t01/video");
  });

  it("return the sample for a path's first version at the sample's own extension, and none for a redraw", () => {
    const sample = samplesFrom(folder({ "samples.json": JSON.stringify(table), "en/lin.jpg": JPEG, "en/seg01-t01.mp4": "clip" }));
    expect(sample("en", "drama/assets/characters/lin/v1/image-1.svg")).toEqual({ path: "drama/assets/characters/lin/v1/image-1.jpg", type: "image/jpeg", bytes: expect.any(Uint8Array) });
    expect(sample("en", "drama/assets/characters/lin/v2/image-1.svg")).toBeUndefined();
    expect(sample("en", "drama/episodes/EP001/segments/seg01/t01/video.mp4")?.type).toBe("video/mp4");
  });

  it("are none for a path or a language samples.json leaves out", () => {
    const sample = samplesFrom(folder({ "samples.json": JSON.stringify(table), "en/lin.jpg": JPEG }));
    expect(sample("en", "drama/assets/characters/wei/v1/image-1.svg")).toBeUndefined();
    expect(sample("zh", "drama/assets/characters/lin/v1/image-1.svg")).toBeUndefined();
  });

  it("are none, said once, where Git LFS left a pointer in place of the file", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:0000\nsize 6\n";
    const sample = samplesFrom(folder({ "samples.json": JSON.stringify(table), "en/lin.jpg": pointer, "en/seg01-t01.mp4": pointer }));
    expect(sample("en", "drama/assets/characters/lin/v1/image-1.svg")).toBeUndefined();
    expect(sample("en", "drama/episodes/EP001/segments/seg01/t01/video.mp4")).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("are none without a samples.json", () => {
    expect(samplesFrom(folder({}))("en", "drama/assets/characters/lin/v1/image-1.svg")).toBeUndefined();
  });

  it("refuse a sample of a kind replay doesn't serve", () => {
    const sample = samplesFrom(folder({ "samples.json": JSON.stringify({ en: { "drama/assets/characters/lin/vN/image-1": "en/lin.webp" } }), "en/lin.webp": JPEG }));
    expect(() => sample("en", "drama/assets/characters/lin/v1/image-1.svg")).toThrow(/lin\.webp/);
  });
});
