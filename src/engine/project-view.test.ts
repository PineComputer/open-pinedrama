// The drama's project from every session's newest report, with episodes made in parallel on
// copies of the setup's project: each episode from its own session, the rest from the setup,
// and one live update each time a report is recorded.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LiveMessage } from "../shared/types.ts";

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "studio-project-"));
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

let status: typeof import("./status.ts");
let db: typeof import("./db.ts");
let live: typeof import("./live.ts");

function report(name: string): Record<string, any> {
  return JSON.parse(readFileSync(new URL(`../../fixtures/status/${name}.json`, import.meta.url), "utf8"));
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/** The same report with EP001 also listed as EP002, as an episode's copy of the project would have it. */
function twoEpisodes(name: string): Record<string, any> {
  const value = report(name);
  value.episodes.EP002 = structuredClone(value.episodes.EP001);
  return value;
}

let clock = 0;
function turn(session: string): string {
  const id = `turn-${++clock}`;
  db.run("insert into turns (id, session_id, state, created_at) values (?, ?, 'completed', ?)", id, session, new Date(Date.UTC(2026, 9, 30, 10, 0, clock)).toISOString());
  return id;
}

beforeAll(async () => {
  db = await import("./db.ts");
  status = await import("./status.ts");
  live = await import("./live.ts");
  const at = new Date().toISOString();
  db.run("insert into dramas (id, title, language, look, format, parallel, per_computer, notes, mode, status, created_at, updated_at) values ('d1', 'T', 'en', '', '9:16, 480p', 2, 1, '', 'replay', 'production', ?, ?)", at, at);
  db.run("insert into episodes (id, drama_id, number, title, state, updated_at) values ('e1', 'd1', 1, 'One', 'working', ?), ('e2', 'd1', 2, 'Two', 'working', ?)", at, at);
  db.run(
    "insert into sessions (id, computer_id, drama_id, name, role, episode_id, state, created_at) values ('setup', 'c1', 'd1', 'setup', 'setup', null, 'open', ?), ('ep1', 'c1', 'd1', 'EP001', 'episode', 'e1', 'open', ?), ('ep2', 'c2', 'd1', 'EP002', 'episode', 'e2', 'open', ?)",
    at,
    at,
    at,
  );
});

beforeEach(() => {
  db.run("delete from statuses");
  db.run("delete from turns");
});

describe("the drama's project", () => {
  it("is null until a session returns a report", () => {
    expect(status.projectView("d1")).toEqual({ state: null, sessions: [], problems: [] });
  });

  it("is the setup's report until an episode's session reports", () => {
    status.recordStatus("setup", turn("setup"), bytes(twoEpisodes("needs")));
    const view = status.projectView("d1");
    expect(view.state?.episodes.EP001.storyboards).toEqual({});
    expect(view.sessions.map((s) => [s.sessionId, s.role, s.episode])).toEqual([["setup", "setup", null]]);
  });

  it("takes each episode from its own session, and the rest from the setup", () => {
    status.recordStatus("setup", turn("setup"), bytes(twoEpisodes("needs")));
    status.recordStatus("ep1", turn("ep1"), bytes(twoEpisodes("boards")));
    const view = status.projectView("d1");
    expect(view.state?.episodes.EP001.storyboards.seg01["line-art"].accepted).toBe("v1");
    // EP001's session's copy of EP002 is the handed-over one, not EP002's work.
    expect(view.state?.episodes.EP002.storyboards).toEqual({});
    expect(view.state?.bible.accepted).toBe("v1");
  });

  it("never lets one episode's session overwrite another episode", () => {
    status.recordStatus("setup", turn("setup"), bytes(twoEpisodes("needs")));
    status.recordStatus("ep1", turn("ep1"), bytes(twoEpisodes("boards")));
    // EP002's session reports later, with EP001 as it was handed over.
    status.recordStatus("ep2", turn("ep2"), bytes(twoEpisodes("needs")));
    const view = status.projectView("d1");
    expect(view.state?.episodes.EP001.storyboards.seg01["line-art"].accepted).toBe("v1");
    expect(view.state?.episodes.EP002.storyboards).toEqual({});
  });

  it("matches each session's newest report, whatever order the reports arrived in", () => {
    const setupOld = turn("setup");
    const ep1Old = turn("ep1");
    const setupNew = turn("setup");
    const ep1New = turn("ep1");
    status.recordStatus("ep1", ep1New, bytes(twoEpisodes("boards")));
    status.recordStatus("setup", setupNew, bytes(twoEpisodes("story")));
    status.recordStatus("ep1", ep1Old, bytes(twoEpisodes("needs")));
    status.recordStatus("setup", setupOld, bytes(report("new")));
    const view = status.projectView("d1");
    expect(view.sessions.map((s) => [s.sessionId, s.turnId])).toEqual([["setup", setupNew], ["ep1", ep1New]]);
    expect(view.state?.bible.accepted).toBe("v1");
    expect(view.state?.episodes.EP001.storyboards.seg01["line-art"].accepted).toBe("v1");
  });

  it("lists each session's budget as its project counts it, without adding them up", () => {
    const setupReport = report("story");
    setupReport.budget.spent_usd = 3.5;
    const episodeReport = twoEpisodes("boards");
    episodeReport.budget.spent_usd = 9.25;
    status.recordStatus("setup", turn("setup"), bytes(setupReport));
    status.recordStatus("ep1", turn("ep1"), bytes(episodeReport));
    expect(status.projectView("d1").sessions.map((s) => s.budget.spentUsd)).toEqual([3.5, 9.25]);
    expect(status.projectView("d1").state).not.toHaveProperty("budget");
  });

  it("names a newer report that didn't read", () => {
    status.recordStatus("setup", turn("setup"), bytes(report("story")));
    const bad = turn("setup");
    status.recordStatus("setup", bad, new TextEncoder().encode("{}"));
    expect(status.projectView("d1").problems).toEqual([{ sessionId: "setup", turnId: bad, error: "drama-cli's status report: preset should be present." }]);
  });
});

describe("a report recorded", () => {
  it("tells open pages once that the drama's project changed", () => {
    const heard: LiveMessage[] = [];
    const stop = live.subscribe((message) => heard.push(message));
    status.recordStatus("ep1", turn("ep1"), bytes(twoEpisodes("boards")));
    stop();
    expect(heard).toEqual([{ type: "changed", scope: "project:d1" }]);
  });

  it("tells them again when it didn't read, so the problem shows", () => {
    const heard: LiveMessage[] = [];
    const stop = live.subscribe((message) => heard.push(message));
    status.recordStatus("ep1", turn("ep1"), new TextEncoder().encode("{}"));
    stop();
    expect(heard).toEqual([{ type: "changed", scope: "project:d1" }]);
  });
});

describe("the setup panel's step", () => {
  it("comes from the setup's report once the bible is accepted", async () => {
    const { setupReached } = await import("./views.ts");
    status.recordStatus("setup", turn("setup"), bytes(report("story")));
    expect(setupReached("d1")).toBe(4);
    status.recordStatus("setup", turn("setup"), bytes(twoEpisodes("boards")));
    expect(setupReached("d1")).toBe(5);
  });

  it("comes from the conversation before that", async () => {
    const { setupReached } = await import("./views.ts");
    status.recordStatus("setup", turn("setup"), bytes(report("new")));
    expect(setupReached("d1")).toBe(0);
  });
});
