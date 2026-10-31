// The maker stops one episode while others go on: its session ends, its open review ends with
// it, and Resume puts it back in line. Paid work already sent isn't sent again; the report says
// how many takes are still generating, for the maker to know before they stop.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LiveMessage } from "../shared/types.ts";

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "studio-stop-"));
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

let db: typeof import("./db.ts");
let dramas: typeof import("./dramas.ts");
let live: typeof import("./live.ts");
let project: typeof import("../shared/project.ts");

beforeAll(async () => {
  db = await import("./db.ts");
  dramas = await import("./dramas.ts");
  live = await import("./live.ts");
  project = await import("../shared/project.ts");
  db.db();
});

beforeEach(() => {
  for (const table of ["dramas", "episodes", "sessions", "reviews"]) db.run(`delete from ${table}`);
  const at = new Date().toISOString();
  db.run("insert into dramas (id, title, language, look, format, parallel, per_computer, notes, mode, status, created_at, updated_at) values ('d1', 'T', 'en', '', '9:16, 480p', 2, 1, '', 'replay', 'production', ?, ?)", at, at);
  db.run(
    "insert into episodes (id, drama_id, number, title, state, session_id, updated_at) values ('e1', 'd1', 1, 'One', 'waiting', 's1', ?), ('e2', 'd1', 2, 'Two', 'working', 's2', ?), ('e3', 'd1', 3, 'Three', 'queued', null, ?), ('e4', 'd1', 4, 'Four', 'done', null, ?)",
    at, at, at, at,
  );
  db.run("insert into sessions (id, computer_id, drama_id, name, role, episode_id, state, created_at) values ('s1', 'c1', 'd1', 'EP001', 'episode', 'e1', 'open', ?), ('s2', 'c2', 'd1', 'EP002', 'episode', 'e2', 'open', ?)", at, at);
  db.run("insert into reviews (id, drama_id, episode_id, session_id, turn_id, kind, state, question, created_at) values ('r1', 'd1', 'e1', 's1', 't1', 'storyboards', 'open', 'Review EP001', ?)", at);
});

const episode = (id: string) => db.get<{ state: string; session_id: string | null }>("select state, session_id from episodes where id = ?", id)!;

describe("stopping one episode", () => {
  it("ends its session and its open review, and leaves the others going", async () => {
    const heard: LiveMessage[] = [];
    const stop = live.subscribe((message) => heard.push(message));
    await dramas.stopEpisode("e1");
    stop();
    expect(episode("e1")).toEqual({ state: "stopped", session_id: null });
    expect(db.get<{ state: string }>("select state from sessions where id = 's1'")?.state).toBe("closed");
    expect(db.get<{ state: string; ended_by: string }>("select state, ended_by from reviews where id = 'r1'")).toEqual({ state: "ended", ended_by: "episode-stop" });
    expect(episode("e2").state).toBe("working");
    expect(db.get<{ state: string }>("select state from sessions where id = 's2'")?.state).toBe("open");
    expect(heard).toContainEqual({ type: "changed", scope: "drama:d1" });
  });

  it("takes a waiting episode out of line before it starts", async () => {
    await dramas.stopEpisode("e3");
    expect(episode("e3").state).toBe("stopped");
  });

  it("goes back in line on Resume, to carry on from what was kept", async () => {
    await dramas.stopEpisode("e2");
    dramas.resumeEpisode("e2");
    expect(db.get<{ state: string; resume: number }>("select state, resume from episodes where id = 'e2'")).toEqual({ state: "queued", resume: 1 });
  });

  it("refuses an episode that is finished or already stopped, and one that doesn't exist", async () => {
    await expect(dramas.stopEpisode("e4")).rejects.toMatchObject({ code: "episode-not-running" });
    await dramas.stopEpisode("e1");
    await expect(dramas.stopEpisode("e1")).rejects.toMatchObject({ code: "episode-not-running" });
    await expect(dramas.stopEpisode("nope")).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("a decision its session can't take", () => {
  it("ends the review, recorded as undelivered, when its Computer is gone", async () => {
    const reviews = await import("./reviews.ts");
    db.run("insert into reviews (id, drama_id, episode_id, session_id, turn_id, kind, state, question, created_at) values ('r2', 'd1', 'e1', 's1', 't2', 'question', 'open', 'Which is scene 1-3?', ?)", new Date().toISOString());
    await reviews.decide("r2", { submissionId: crypto.randomUUID(), items: [], words: "Day." });
    expect(db.get<{ state: string; ended_by: string }>("select state, ended_by from reviews where id = 'r2'")).toEqual({ state: "ended", ended_by: "undelivered" });
  });
});

describe("takes still generating", () => {
  it("are counted from the report, by drama-cli's own in-flight states", () => {
    const report = JSON.parse(readFileSync(new URL("../../fixtures/status/boards.json", import.meta.url), "utf8"));
    report.episodes.EP001.segments.seg01.takes = [
      { version: "t01", state: "downloaded", accepted: false },
      { version: "t02", state: "running", accepted: false },
      { version: "t03", state: "unknown", accepted: false },
      { version: "t04", state: "failed", accepted: false },
    ];
    const state = project.parseStatus(report);
    expect(project.takesInFlight(state.episodes.EP001)).toBe(2);
    expect(project.takesInFlight(project.parseStatus(JSON.parse(readFileSync(new URL("../../fixtures/status/boards.json", import.meta.url), "utf8"))).episodes.EP001)).toBe(0);
  });
});

describe("resuming a drama the maker stopped", () => {
  it("goes back to production and puts the episodes the stop left stopped back in line, to carry on from what was kept", async () => {
    const at = new Date().toISOString();
    db.run("update dramas set status = 'stopped', reason = 'by-maker' where id = 'd1'");
    db.run("update episodes set state = 'stopped' where id in ('e1', 'e2')");
    db.run("insert into episodes (id, drama_id, number, title, state, updated_at) values ('e5', 'd1', 5, 'Five', 'failed', ?)", at);
    dramas.resumeDrama("d1");
    expect(db.get<{ status: string; reason: string }>("select status, reason from dramas where id = 'd1'")).toEqual({ status: "production", reason: "" });
    const rows = db.all<{ id: string; state: string; resume: number }>("select id, state, resume from episodes order by id");
    expect(rows).toEqual([
      { id: "e1", state: "queued", resume: 1 },
      { id: "e2", state: "queued", resume: 1 },
      { id: "e3", state: "queued", resume: 0 },
      { id: "e4", state: "done", resume: 0 },
      { id: "e5", state: "failed", resume: 0 },
    ]);
  });

  it("starts the setup again for a drama stopped before it had episodes", () => {
    db.run("delete from episodes");
    db.run("update dramas set status = 'stopped', reason = 'by-maker' where id = 'd1'");
    dramas.resumeDrama("d1");
    expect(db.get<{ status: string }>("select status from dramas where id = 'd1'")?.status).toBe("setup");
  });

  it("refuses a drama that isn't stopped", () => {
    expect(() => dramas.resumeDrama("d1")).toThrow(expect.objectContaining({ code: "drama-not-stopped" }));
  });
});
