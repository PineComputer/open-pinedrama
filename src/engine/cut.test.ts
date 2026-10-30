// A cut's segments, read from the cut.json drama-cli writes beside cut.mp4: each clip of the
// plan is a segment's take, played from its in to its out, one after another.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATA = mkdtempSync(path.join(tmpdir(), "studio-cut-"));
process.env.STUDIO_DATA_DIR = DATA;
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

let cut: typeof import("./cut.ts");
let library: typeof import("./library.ts");
let reviews: typeof import("./reviews.ts");

const clip = (seg: string, take: string, from: number, out: number) => ({
  path: `episodes/EP001/segments/${seg}/${take}/video.mp4`,
  sha256: "0".repeat(64),
  in: from,
  out,
  audio: "source",
});
const plan = (clips: unknown[]) => ({ schema_version: 1, episode: "EP001", output: { width: 480, height: 854, fps: 24 }, clips });
const bytes = (value: unknown) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));

beforeAll(async () => {
  const { db, run } = await import("./db.ts");
  cut = await import("./cut.ts");
  library = await import("./library.ts");
  reviews = await import("./reviews.ts");
  db();
  const at = new Date().toISOString();
  run(
    "insert into dramas (id, title, language, look, format, parallel, per_computer, notes, mode, status, created_at, updated_at) values ('d1', 'Test', 'en', 'live action', '9:16, 480p', 1, 1, '', 'replay', 'production', ?, ?)",
    at,
    at,
  );
  run("insert into dramas (id, title, language, look, format, parallel, per_computer, notes, mode, status, created_at, updated_at) values ('d2', 'Other', 'en', 'live action', '9:16, 480p', 1, 1, '', 'replay', 'production', ?, ?)", at, at);
});

afterAll(() => rmSync(DATA, { recursive: true, force: true }));

describe("a cut's clips", () => {
  it("follow one another, each as long as its out less its in", () => {
    expect(cut.readCutPlan(plan([clip("seg01", "t02", 0, 30.04), clip("seg02", "t01", 1.5, 10), clip("seg03", "t01", 0, 4)])).clips).toEqual([
      { segment: "seg01", take: "t02", start: 0, end: 30.04 },
      { segment: "seg02", take: "t01", start: 30.04, end: 38.54 },
      { segment: "seg03", take: "t01", start: 38.54, end: 42.54 },
    ]);
  });

  it("come with the cut's frame rate, as the plan states its output", () => {
    expect(cut.readCutPlan(plan([clip("seg01", "t01", 0, 4)])).fps).toBe(24);
    expect(cut.readCutPlan({ ...plan([clip("seg01", "t01", 0, 4)]), output: { width: 720, height: 1280, fps: 30 } }).fps).toBe(30);
  });

  it("take a segment's take wherever the project sits", () => {
    expect(cut.readCutPlan(plan([{ ...clip("seg02a", "t03", 0, 2), path: "drama/episodes/EP001/segments/seg02a/t03/video.mp4" }])).clips).toEqual([
      { segment: "seg02a", take: "t03", start: 0, end: 2 },
    ]);
  });

  it.each([
    ["no plan", null, "cut.json lists no clips"],
    ["no clips", { schema_version: 1 }, "cut.json lists no clips"],
    ["an empty list", plan([]), "cut.json lists no clips"],
    ["a clip that is not an object", plan(["seg01"]), "clip 1 of cut.json is not an object"],
    ["a clip that is not a take", plan([clip("seg01", "t01", 0, 4), { ...clip("seg02", "t01", 0, 4), path: "episodes/EP001/edit/v1/cut.mp4" }]), "clip 2 of cut.json is not a segment's take: \"episodes/EP001/edit/v1/cut.mp4\""],
    ["no in", plan([{ ...clip("seg01", "t01", 0, 4), in: undefined }]), "clip 1 of cut.json has no in and out in seconds, out after in"],
    ["an out before its in", plan([clip("seg01", "t01", 4, 2)]), "clip 1 of cut.json has no in and out in seconds, out after in"],
    ["an in before the take starts", plan([clip("seg01", "t01", -1, 2)]), "clip 1 of cut.json has no in and out in seconds, out after in"],
    ["an out in words", plan([{ ...clip("seg01", "t01", 0, 4), out: "4" }]), "clip 1 of cut.json has no in and out in seconds, out after in"],
    ["no output", { schema_version: 1, clips: [clip("seg01", "t01", 0, 4)] }, "cut.json states no output frame rate (output.fps)"],
    ["a frame rate of 0", { ...plan([clip("seg01", "t01", 0, 4)]), output: { width: 480, height: 854, fps: 0 } }, "cut.json states no output frame rate (output.fps)"],
  ])("refuse %s, saying what is wrong", (_what, value, message) => {
    expect(() => cut.readCutPlan(value)).toThrow(message);
  });
});

describe("a cut's file", () => {
  let turn = 0;
  const save = (dramaId: string, relPath: string, body: Uint8Array, type: string) =>
    library.save(body, { dramaId, turnId: `t${++turn}`, relPath, type });
  const item = (id: number | bigint) => library.toItem(library.fileRow(Number(id))!);

  it("carries the clips of the cut.json in its own folder", async () => {
    const video = await save("d1", "drama/episodes/EP001/edit/v1/cut.mp4", bytes("v1 picture"), "video/mp4");
    await save("d1", "drama/episodes/EP001/edit/v1/cut.json", bytes(plan([clip("seg01", "t01", 0, 4), clip("seg02", "t01", 0, 3)])), "application/json");
    // Another version's plan, and the same path in another drama, are not this cut's.
    await save("d1", "drama/episodes/EP001/edit/v2/cut.json", bytes(plan([clip("seg01", "t09", 0, 1)])), "application/json");
    await save("d2", "drama/episodes/EP001/edit/v1/cut.json", bytes(plan([clip("seg01", "t08", 0, 1)])), "application/json");
    expect(item(video).cutPlan).toEqual({
      fps: 24,
      clips: [
        { segment: "seg01", take: "t01", start: 0, end: 4 },
        { segment: "seg02", take: "t01", start: 4, end: 7 },
      ],
    });
  });

  it("says why when its cut.json doesn't read", async () => {
    const broken = await save("d1", "drama/episodes/EP002/edit/v1/cut.mp4", bytes("broken"), "video/mp4");
    await save("d1", "drama/episodes/EP002/edit/v1/cut.json", bytes("{ not json"), "application/json");
    expect(item(broken).cutPlan).toMatchObject({ error: expect.stringContaining("cut.json is not JSON") });
    const wrong = await save("d1", "drama/episodes/EP003/edit/v1/cut.mp4", bytes("wrong"), "video/mp4");
    await save("d1", "drama/episodes/EP003/edit/v1/cut.json", bytes(plan([])), "application/json");
    expect(item(wrong).cutPlan).toEqual({ error: "cut.json lists no clips" });
  });

  it("has none when no cut.json came with it", async () => {
    const alone = await save("d1", "drama/episodes/EP004/edit/v1/cut.mp4", bytes("alone"), "video/mp4");
    expect(item(alone).cutPlan).toBeUndefined();
  });

  it("is the one thing a cut's review shows: its cut.json goes with it, not beside it", async () => {
    const rows = [
      library.fileRow(Number(await save("d1", "drama/episodes/EP005/edit/v1/cut.mp4", bytes("five"), "video/mp4")))!,
      library.fileRow(Number(await save("d1", "drama/episodes/EP005/edit/v1/cut.json", bytes(plan([clip("seg01", "t01", 0, 4)])), "application/json")))!,
    ];
    const { items, other } = reviews.itemsOf("cut", rows);
    expect(items.map((entry) => entry.files.map((file) => file.name))).toEqual([["cut.mp4"]]);
    expect(items[0].files[0].cutPlan).toEqual({ fps: 24, clips: [{ segment: "seg01", take: "t01", start: 0, end: 4 }] });
    expect(other).toEqual([]);
  });
});

describe("replay's cut.json", () => {
  const fixture = (name: string) => new Uint8Array(readFileSync(path.join("fixtures/replay", name)));

  it("is timed by the cut replay returns: its MP4's own length", async () => {
    const { mp4Seconds } = await import("./replay-fleet.ts");
    expect(mp4Seconds(fixture("cut.mp4"))).toBeCloseTo(8);
    expect(mp4Seconds(fixture("take.mp4"))).toBeCloseTo(4);
    expect(() => mp4Seconds(new TextEncoder().encode("not a movie"))).toThrow("no movie header");
  });

  it("reads as drama-cli's does, each segment's newest take filling that cut", async () => {
    const { cutPlan, mp4Seconds } = await import("./replay-fleet.ts");
    const made = { path: "drama/episodes/EP001/edit/v2/cut.mp4", type: "video/mp4", bytes: fixture("cut.mp4") };
    const take = fixture("take.mp4");
    const out = cutPlan("drama/episodes/EP001/edit/v2/cut.json", "EP001", made, [
      { segment: "seg01", take: "t02", bytes: take },
      { segment: "seg02", take: "t01", bytes: take },
      { segment: "seg03", take: "t01", bytes: take },
    ]);
    expect(out.path).toBe("drama/episodes/EP001/edit/v2/cut.json");
    const plan = JSON.parse(new TextDecoder().decode(out.bytes));
    expect(plan.clips[0].sha256).toBe(createHash("sha256").update(take).digest("hex"));
    const { clips, fps } = cut.readCutPlan(plan);
    expect(fps).toBe(24);
    expect(clips.map((entry) => [entry.segment, entry.take])).toEqual([["seg01", "t02"], ["seg02", "t01"], ["seg03", "t01"]]);
    expect(clips[0].start).toBe(0);
    expect(clips.at(-1)!.end).toBeCloseTo(mp4Seconds(made.bytes));
  });

  it("takes a sample drama's real in and out for each segment where its data gives them", async () => {
    const { cutPlan } = await import("./replay-fleet.ts");
    const made = { path: "drama/episodes/EP003/edit/v1/cut.mp4", type: "video/mp4", bytes: fixture("cut.mp4") };
    const take = fixture("take.mp4");
    const out = cutPlan("drama/episodes/EP003/edit/v1/cut.json", "EP003", made, [{ segment: "seg01", take: "t01", bytes: take }, { segment: "seg02", take: "t01", bytes: take }], [{ segment: "seg01", in: 0, out: 23.04 }]);
    const { clips } = cut.readCutPlan(JSON.parse(new TextDecoder().decode(out.bytes)));
    expect(clips[0]).toMatchObject({ segment: "seg01", start: 0, end: 23.04 });
    // A segment the data leaves out takes an equal share of the cut, as before.
    expect(clips[1].end - clips[1].start).toBeCloseTo(4);
  });
});
