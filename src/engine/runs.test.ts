// What a new session is handed is the owner's newest work by when Pine started its turn, as the
// status reports are taken (status.ts): a turn whose files were saved late (a save retried after
// a failed fetch, or an old turn settled after a restart) never hands over an older pack or
// reference in place of a newer one.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "studio-runs-"));
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

let db: typeof import("./db.ts");
let runs: typeof import("./runs.ts");

/** A turn of the session that Pine started at second n. */
function turn(id: string, session: string, n: number): void {
  db.run("insert into turns (id, session_id, state, files_saved, created_at) values (?, ?, 'completed', 1, ?)", id, session, new Date(Date.UTC(2026, 9, 30, 10, 0, n)).toISOString());
}

/** A file the turn returned, saved now (so after every file saved before it). */
function saved(turnId: string, session: string, episode: string | null, relPath: string, kind: string, subject: string | null = null): number {
  return Number(
    db.run(
      "insert into files (drama_id, episode_id, session_id, turn_id, sha, rel_path, name, type, size, kind, subject, created_at) values ('d1', ?, ?, ?, ?, ?, ?, 'application/octet-stream', 1, ?, ?, ?)",
      episode,
      session,
      turnId,
      `${turnId}-${relPath}`,
      relPath,
      path.posix.basename(relPath),
      kind,
      subject,
      new Date().toISOString(),
    ).lastInsertRowid,
  );
}

beforeAll(async () => {
  db = await import("./db.ts");
  runs = await import("./runs.ts");
  const at = new Date().toISOString();
  db.run("insert into dramas (id, title, language, look, format, parallel, per_computer, notes, mode, status, created_at, updated_at) values ('d1', 'T', 'en', '', '9:16, 480p', 2, 1, '', 'replay', 'production', ?, ?)", at, at);
  db.run("insert into episodes (id, drama_id, number, title, state, updated_at) values ('e6', 'd1', 6, 'Six', 'working', ?)", at);
  db.run(
    "insert into sessions (id, computer_id, drama_id, name, role, episode_id, state, created_at) values ('setup', 'c1', 'd1', 'setup', 'setup', null, 'open', ?), ('ep6', 'c1', 'd1', 'EP006', 'episode', 'e6', 'open', ?)",
    at,
    at,
  );
});

beforeEach(() => {
  db.run("delete from files");
  db.run("delete from turns");
});

describe("what a session is handed", () => {
  it("is the episode's pack from its newest turn, though an older turn's was saved after it", () => {
    turn("old", "ep6", 1);
    turn("new", "ep6", 2);
    const newer = saved("new", "ep6", "e6", "handoff/project.tar.part-aa", "archive");
    saved("old", "ep6", "e6", "handoff/project.tar.part-aa", "archive");
    expect(runs.episodeArchive("e6").map((file) => file.id)).toEqual([newer]);
  });

  it("is the setup's pack from its newest turn, though an older turn's was saved after it", () => {
    turn("old", "setup", 1);
    turn("new", "setup", 2);
    const newer = saved("new", "setup", null, "handoff/project.tar.part-aa", "archive");
    saved("old", "setup", null, "handoff/project.tar.part-aa", "archive");
    expect(runs.projectArchive("d1").map((file) => file.id)).toEqual([newer]);
  });

  it("is each reference from the setup's newest turn that returned it, though an older turn's was saved after it", () => {
    turn("old", "setup", 1);
    turn("new", "setup", 2);
    const newer = saved("new", "setup", null, "drama/assets/characters/ivy/v2/image-1.png", "look", "ivy");
    saved("old", "setup", null, "drama/assets/characters/ivy/v1/image-1.png", "look", "ivy");
    expect(runs.references("d1").map((file) => file.id)).toEqual([newer]);
  });
});
