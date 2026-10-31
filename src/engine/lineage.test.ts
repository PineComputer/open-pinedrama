// drama-cli's lineage each stop returns, kept per turn, and the drama's lineage from every
// session's newest export, merged as the status reports are: each episode from its own
// session, the shared stages from the setup, and one live update each time an export is recorded.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveMessage } from "../shared/types.ts";

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "studio-lineage-"));
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

let lineage: typeof import("./lineage.ts");
let db: typeof import("./db.ts");
let live: typeof import("./live.ts");

const TAKE = (code: string) => `episodes/${code}/segments/seg01`;
const PLATE = "assets/scenes/office/times/Day";

function exported(name: string): Record<string, any> {
  return JSON.parse(readFileSync(new URL(`../../fixtures/lineage/${name}.json`, import.meta.url), "utf8"));
}

/** The export with EP001's stages also listed as EP002's, as an episode's copy of the project would have them. */
function twoEpisodes(name: string): Uint8Array {
  const value = exported(name);
  const offset = value.nodes.length;
  const ep1 = value.nodes.filter((node: any) => node.properties.id.startsWith("episodes/EP001/"));
  const number = new Map(ep1.map((node: any, n: number) => [node.id, offset + n + 1]));
  const renamed = (text: string) => text.replaceAll("episodes/EP001/", "episodes/EP002/");
  for (const node of ep1) {
    const props = { ...node.properties, id: renamed(node.properties.id), reads: node.properties.reads.map(renamed) };
    value.nodes.push({ ...node, id: number.get(node.id), properties: props });
  }
  const links = value.links.filter((link: any[]) => number.has(link[3]));
  value.links.push(...links.map((link: any[], n: number) => [value.links.length + n + 1, number.get(link[1]) ?? link[1], link[2], number.get(link[3]), link[4], link[5]]));
  return new TextEncoder().encode(JSON.stringify(value));
}

let clock = 0;
function turn(session: string): string {
  const id = `turn-${++clock}`;
  db.run("insert into turns (id, session_id, state, created_at) values (?, ?, 'completed', ?)", id, session, new Date(Date.UTC(2026, 9, 30, 10, 0, clock)).toISOString());
  return id;
}

function stage(id: string) {
  return lineage.lineageView("d1").lineage?.nodes.find((node) => node.id === id);
}

beforeAll(async () => {
  db = await import("./db.ts");
  lineage = await import("./lineage.ts");
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
  db.run("delete from lineages");
  db.run("delete from turns");
});

describe("the drama's lineage", () => {
  it("is null until a session returns an export", () => {
    expect(lineage.lineageView("d1")).toEqual({ lineage: null, problems: [] });
  });

  it("is the setup's until an episode's session returns one", () => {
    lineage.recordLineage("setup", turn("setup"), twoEpisodes("shot"));
    expect(stage(TAKE("EP001"))?.fresh).toBe(true);
    expect(stage(TAKE("EP002"))?.fresh).toBe(true);
  });

  it("takes each episode from its own session, and the shared stages from the setup", () => {
    lineage.recordLineage("setup", turn("setup"), twoEpisodes("shot"));
    lineage.recordLineage("ep1", turn("ep1"), twoEpisodes("time-plate-replaced"));
    expect(stage(TAKE("EP001"))).toMatchObject({ fresh: false, problems: expect.arrayContaining([`Changed selection: ${PLATE}/accepted.json`]) });
    // EP001's session's copy of EP002 and of the plate are the handed-over ones, not their own work.
    expect(stage(TAKE("EP002"))?.fresh).toBe(true);
    expect(stage(PLATE)?.version).toBe("v1");
  });

  it("matches each session's newest export, whatever order they arrived in", () => {
    const older = turn("ep1");
    const newer = turn("ep1");
    lineage.recordLineage("setup", turn("setup"), twoEpisodes("shot"));
    // Saved a second apart, the older turn's export last, as a turn saved again after a failed fetch is.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 30, 11)));
    lineage.recordLineage("ep1", newer, twoEpisodes("time-plate-replaced"));
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 30, 11, 0, 1)));
    lineage.recordLineage("ep1", older, twoEpisodes("shot"));
    vi.useRealTimers();
    expect(stage(TAKE("EP001"))?.fresh).toBe(false);
  });

  it("keeps the last export that reads, and names a newer one that didn't", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    lineage.recordLineage("setup", turn("setup"), twoEpisodes("shot"));
    const bad = turn("setup");
    const spoiled = exported("shot");
    spoiled.nodes[0].properties.fresh = "no";
    lineage.recordLineage("setup", bad, new TextEncoder().encode(JSON.stringify(spoiled)));
    const view = lineage.lineageView("d1");
    expect(view.lineage?.nodes.length).toBeGreaterThan(0);
    expect(view.problems).toEqual([{ sessionId: "setup", turnId: bad, error: "drama-cli's lineage: nodes.0.properties.fresh should be true, false or null." }]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("an export recorded", () => {
  it("tells open pages once that the drama's project changed", () => {
    const heard: LiveMessage[] = [];
    const stop = live.subscribe((message) => heard.push(message));
    lineage.recordLineage("ep1", turn("ep1"), twoEpisodes("shot"));
    stop();
    expect(heard).toEqual([{ type: "changed", scope: "project:d1" }]);
  });
});
