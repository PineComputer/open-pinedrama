// Browsing shows what each review decided on, and nothing more: a takes review says nothing
// about storyboards the same turn returned, and approving several cuts at once approves none
// of them in particular.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATA = mkdtempSync(path.join(tmpdir(), "studio-browse-"));
process.env.STUDIO_DATA_DIR = DATA;
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

let browse: typeof import("./browse.ts");

beforeAll(async () => {
  const { db, run } = await import("./db.ts");
  browse = await import("./browse.ts");
  db();
  const at = new Date().toISOString();
  run(
    "insert into dramas (id, title, language, look, format, parallel, per_computer, notes, mode, status, created_at, updated_at) values ('d1', 'Test', 'en', 'live action', '9:16, 480p', 1, 1, '', 'replay', 'production', ?, ?)",
    at,
    at,
  );
  run("insert into episodes (id, drama_id, number, title, state, updated_at) values ('e1', 'd1', 1, 'One', 'waiting', ?)", at);
  const file = (id: number, turn: string, relPath: string, kind: string, segment: string | null, version: string, type: string) =>
    run(
      "insert into files (id, drama_id, episode_id, session_id, turn_id, sha, rel_path, name, type, size, kind, segment, version, created_at) values (?, 'd1', 'e1', 's1', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
      id,
      turn,
      `sha${id}`.padEnd(64, "0"),
      relPath,
      path.basename(relPath),
      type,
      kind,
      segment,
      version,
      at,
    );
  // One turn returned seg01's storyboard and its take; the maker reviewed the takes.
  file(1, "t1", "episodes/EP001/multi_panel_storyboard/seg01/line-art/v1/image-1.png", "storyboard", "seg01", "v1", "image/png");
  file(2, "t1", "episodes/EP001/segments/seg01/t01/video.mp4", "take", "seg01", "t01", "video/mp4");
  // Another returned two cuts at once, and the maker approved "the cut".
  file(3, "t2", "episodes/EP001/edit/v1/cut.mp4", "cut", null, "v1", "video/mp4");
  file(4, "t2", "episodes/EP001/edit/v2/cut.mp4", "cut", null, "v2", "video/mp4");
  const review = (id: string, turn: string, kind: string, key: string) =>
    run(
      "insert into reviews (id, drama_id, episode_id, session_id, turn_id, kind, state, question, decision, answer, created_at) values (?, 'd1', 'e1', 's1', ?, ?, 'answered', '', ?, '', ?)",
      id,
      turn,
      kind,
      JSON.stringify({ words: "", items: [{ key, verdict: "approve", notes: [] }] }),
      at,
    );
  review("r1", "t1", "takes", "seg01");
  review("r2", "t2", "cut", "cut");
  // The setup checked the original (v1), then returned a rewrite (v2) and asks the maker to accept it.
  file(5, "t3", "drama/screenplay/v1/screenplay.fountain", "other", null, "", "text/plain");
  file(6, "t4", "drama/screenplay/v2/screenplay.fountain", "screenplay-version", null, "v2", "text/plain");
  file(7, "t4", "drama/screenplay/v2/review.md", "screenplay-review", null, "v2", "text/markdown");
  run(
    "insert into reviews (id, drama_id, episode_id, session_id, turn_id, kind, state, question, decision, answer, created_at) values ('r3', 'd1', null, 's1', 't4', 'question', 'open', 'Accept the rewrite?', null, '', ?)",
    at,
  );
});

afterAll(() => rmSync(DATA, { recursive: true, force: true }));

describe("browsing", () => {
  it("puts a verdict only on what its review judged", () => {
    const page = browse.episodePage("d1", "EP001")!;
    expect(page.segments[0].takes[0].review?.verdict).toBe("approve");
    expect(page.segments[0].boards[0].review).toBeUndefined();
  });

  it("approves no single cut when the review showed several", () => {
    const [row] = browse.deliveryRows("d1");
    expect(row.accepted).toBeUndefined();
    expect(row.ambiguous).toBe(true);
    expect(row.latest?.together).toBe(2);
  });

  it("shows the newest screenplay version and its review, waiting while its question is open", () => {
    const current = browse.scriptPage("d1").screenplay!;
    expect([current.version, current.file?.id, current.review?.id, current.pending]).toEqual(["v2", 6, 7, true]);
  });
});
