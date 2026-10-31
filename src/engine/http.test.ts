// The engine's HTTP API as the UI calls it, in process through Hono's app.request(): who may
// call it, and the answers the UI reads, in the shared types (docs/TESTING.md).
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LineageView } from "../shared/lineage.ts";
import type { ProjectView } from "../shared/project.ts";
import type { AppInfo, DramaCard } from "../shared/types.ts";

process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");
process.env.STUDIO_TOKEN = "launch-token";

const HOST = "127.0.0.1:4310";
let data: string;
let api: ReturnType<typeof import("./http.ts").app>;

/** A request from the studio's own window: loopback, this launch's cookie, its own origin. */
function call(route: string, init: RequestInit = {}, headers: Record<string, string> = {}) {
  return api.request(route, { ...init, headers: { host: HOST, cookie: "studio=launch-token", origin: `http://${HOST}`, ...headers, ...(init.headers as Record<string, string>) } });
}

// Each test gets an engine of its own, on an empty data folder, so none depends on another
// having run first: the engine's modules read the folder when they load.
beforeEach(async () => {
  data = mkdtempSync(path.join(tmpdir(), "studio-http-"));
  process.env.STUDIO_DATA_DIR = data;
  // db.ts keeps its handle on globalThis, so it outlives a module reset: close it, so the next
  // engine opens the database in this test's folder.
  const shared = globalThis as { __studioDb?: { close(): void } };
  shared.__studioDb?.close();
  delete shared.__studioDb;
  vi.resetModules();
  const { app } = await import("./http.ts");
  api = app();
});

afterEach(() => rmSync(data, { recursive: true, force: true }));

describe("who may call the engine", () => {
  it("refuses a call without this launch's cookie", async () => {
    const response = await call("/api/app", {}, { cookie: "" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "signed-out" });
  });

  it("refuses a change from another origin", async () => {
    const response = await call("/api/connection/replay", { method: "POST" }, { origin: "http://example.com" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "signed-out" });
  });

  it("answers nothing on a host other than loopback", async () => {
    const response = await call("/api/app", {}, { host: "studio.example.com" });
    expect(response.status).toBe(404);
  });
});

describe("the answers the UI reads", () => {
  it("starts with no mode, and replay once chosen", async () => {
    const before = (await (await call("/api/app")).json()) as AppInfo;
    expect(before.mode).toBe("none");

    const chosen = await call("/api/connection/replay", { method: "POST" });
    expect(chosen.status).toBe(200);
    expect(((await chosen.json()) as AppInfo).mode).toBe("replay");
    expect(existsSync(path.join(data, "studio.db"))).toBe(true);
  });

  it("gives a replayed sample the same id on every fresh studio, so a rebuild keeps its URLs (QA Y5)", async () => {
    expect((await call("/api/connection/replay", { method: "POST" })).status).toBe(200);
    const start = async (language: string) => {
      const made = await call("/api/dramas/sample", { method: "POST", body: JSON.stringify({ language, sample: "bride-on-bail" }), headers: { "content-type": "application/json" } });
      expect(made.status).toBe(200);
      return ((await made.json()) as { id: string }).id;
    };
    // This test's data folder is empty, as a rebuilt studio's is: the id is the sample's and language's, nothing random.
    const base = `drama_${createHash("sha256").update("sample:bride-on-bail:en").digest("hex").slice(0, 16)}`;
    expect(await start("en")).toBe(base);
    // Started again in the same studio, it is another drama, numbered in the order it was started.
    expect(await start("en")).toBe(`${base}-2`);
    expect(await start("zh")).toBe(`drama_${createHash("sha256").update("sample:bride-on-bail:zh").digest("hex").slice(0, 16)}`);
  });

  it("lists the sample drama once it is made, as a card", async () => {
    expect((await call("/api/connection/replay", { method: "POST" })).status).toBe(200);
    expect(await (await call("/api/dramas")).json()).toEqual([]);

    const made = await call("/api/dramas/sample", { method: "POST", body: JSON.stringify({ language: "en" }), headers: { "content-type": "application/json" } });
    expect(made.status).toBe(200);
    const { id } = (await made.json()) as { id: string };

    const cards = (await (await call("/api/dramas")).json()) as DramaCard[];
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id, title: "The Stepmother", mode: "replay", preset: "en-us-live-sfw", rehearsal: false });
  });

  it("backdates a sample only in replay: a rehearsal on Pine is stamped when it starts", async () => {
    const { setFleet } = await import("./computers.ts");
    const limits = { maxComputers: null, maxIdleSeconds: null, maxRuntimeSeconds: null, idleAdjustable: false };
    const { get } = await import("./db.ts");
    const stamp = () => get<{ backdate_ms: number; created_at: string }>("select backdate_ms, created_at from dramas order by rowid desc limit 1")!;
    expect((await call("/api/connection/replay", { method: "POST" })).status).toBe(200);
    expect((await call("/api/dramas/sample", { method: "POST", body: JSON.stringify({ language: "en" }), headers: { "content-type": "application/json" } })).status).toBe(200);
    expect(stamp().backdate_ms).toBeGreaterThan(0);
    // A stand-in for a Pine project: the sample route reads only the fleet's mode and project.
    setFleet({ mode: "pine", project: "p1" } as unknown as import("./fleet.ts").Fleet, limits);
    const before = Date.now();
    expect((await call("/api/dramas/sample", { method: "POST", body: JSON.stringify({ language: "en" }), headers: { "content-type": "application/json" } })).status).toBe(200);
    expect(stamp().backdate_ms).toBe(0);
    expect(Date.parse(stamp().created_at)).toBeGreaterThanOrEqual(before - 1000);
    setFleet(undefined, limits);
  });

  it("says on a card what the agent last said and when, leaving out a fact not known yet", async () => {
    expect((await call("/api/connection/replay", { method: "POST" })).status).toBe(200);
    const made = await call("/api/dramas/sample", { method: "POST", body: JSON.stringify({ language: "en" }), headers: { "content-type": "application/json" } });
    const { id } = (await made.json()) as { id: string };
    // No status report yet: no scale and no logline, rather than zeros or a guess.
    const [fresh] = (await (await call("/api/dramas")).json()) as DramaCard[];
    expect(fresh.facts.scale).toBeUndefined();
    expect(fresh.facts.logline).toBeUndefined();
    const { run } = await import("./db.ts");
    run("insert into sessions (id, computer_id, drama_id, name, role, state, created_at) values ('s9', 'c9', ?, 'n', 'setup', 'open', ?)", id, "2099-01-01T00:00:00Z");
    run("insert into messages (session_id, kind, text, at) values ('s9', 'progress', 'Rewriting it into Fountain', '2099-01-01T00:01:00Z')");
    run("insert into messages (session_id, kind, text, at) values ('s9', 'input', 'Start the drama.', '2099-01-01T00:00:30Z')");
    const [card] = (await (await call("/api/dramas")).json()) as DramaCard[];
    expect(card.facts).toMatchObject({ lastLine: "Rewriting it into Fountain", lastActivity: "2099-01-01T00:01:00Z" });
    // Genres only as the maker's notes state them: none when they state none.
    run("update dramas set notes = ? where id = ?", "Selling point: the slap.", id);
    expect((((await (await call("/api/dramas")).json()) as DramaCard[])[0]).facts.genres).toBeUndefined();
    // On their "Genres:" line, in the brief's "Genres:" line (or "类型：").
    run("update dramas set notes = ? where id = ?", "Selling point: the slap.\nGenres: Family, Period", id);
    expect((((await (await call("/api/dramas")).json()) as DramaCard[])[0]).facts.genres).toEqual(["Family", "Period"]);
    run("update dramas set notes = ? where id = ?", "类型：家庭、年代", id);
    expect((((await (await call("/api/dramas")).json()) as DramaCard[])[0]).facts.genres).toEqual(["家庭", "年代"]);
  });

  it("gives a card a cover from the drama's own work: its newest take's last frame, else a photoreal storyboard, else none", async () => {
    expect((await call("/api/connection/replay", { method: "POST" })).status).toBe(200);
    const made = await call("/api/dramas/sample", { method: "POST", body: JSON.stringify({ language: "zh" }), headers: { "content-type": "application/json" } });
    const { id } = (await made.json()) as { id: string };
    const { get, run } = await import("./db.ts");
    const card = async () => ((await (await call("/api/dramas")).json()) as DramaCard[]).find((item) => item.id === id)!;
    const file = (name: string, kind: string, type: string, style: string | null, at: string) => {
      run("insert into files (drama_id, rel_path, name, kind, type, size, sha, style, created_at) values (?, ?, ?, ?, ?, 1, ?, ?, ?)", id, `drama/${name}`, name, kind, type, `sha-${name}`, style, at);
      return get<{ id: number }>("select id from files where drama_id = ? and name = ?", id, name)!.id;
    };
    const coverId = async () => (await card()).cover?.url.match(/^\/api\/files\/(\d+)\?/)?.[1];
    // Nothing yet, and never a look sheet or line art: the designed empty cover.
    file("lin.jpg", "look", "image/jpeg", null, "2099-01-01T00:00:00Z");
    file("board.png", "storyboard", "image/png", "line-art", "2099-01-01T00:00:30Z");
    expect((await card()).cover).toBeUndefined();
    const photo = file("photo.png", "storyboard", "image/png", "photoreal", "2099-01-01T00:01:00Z");
    expect(await coverId()).toBe(String(photo));
    // Any take's last frame, the newest, over a photoreal board.
    file("seg01-last_frame.jpg", "last-frame", "image/jpeg", null, "2099-01-01T00:02:00Z");
    const newest = file("seg02-last_frame.jpg", "last-frame", "image/jpeg", null, "2099-01-01T00:03:00Z");
    expect(await coverId()).toBe(String(newest));
    expect((await card()).cover?.video).toBeFalsy();
    // A Chinese drama's card names its own preset.
    expect((await card()).preset).toBe("zh-cn-live-sfw");
  });

  it("says plainly when a drama doesn't exist", async () => {
    const response = await call("/api/dramas/no-such-drama");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not-found" });
  });

  it("serves a drama's project, null until a session has reported", async () => {
    expect((await call("/api/connection/replay", { method: "POST" })).status).toBe(200);
    const made = await call("/api/dramas/sample", { method: "POST", body: JSON.stringify({ language: "en" }), headers: { "content-type": "application/json" } });
    const { id } = (await made.json()) as { id: string };
    const response = await call(`/api/dramas/${id}/project`);
    expect(response.status).toBe(200);
    expect((await response.json()) as ProjectView).toEqual({ state: null, sessions: [], problems: [], names: null });
  });

  it("answers a drama's lineage, null before any stop returns one", async () => {
    expect((await call("/api/connection/replay", { method: "POST" })).status).toBe(200);
    const made = await call("/api/dramas/sample", { method: "POST", body: JSON.stringify({ language: "en" }), headers: { "content-type": "application/json" } });
    const { id } = (await made.json()) as { id: string };
    const response = await call(`/api/dramas/${id}/lineage`);
    expect(response.status).toBe(200);
    expect((await response.json()) as LineageView).toEqual({ lineage: null, problems: [] });
    expect((await call("/api/dramas/no-such-drama/lineage")).status).toBe(404);
  });

  describe("where the maker moved the canvas's nodes (view state, never production state)", () => {
    async function sample() {
      expect((await call("/api/connection/replay", { method: "POST" })).status).toBe(200);
      const made = await call("/api/dramas/sample", { method: "POST", body: JSON.stringify({ language: "en" }), headers: { "content-type": "application/json" } });
      return ((await made.json()) as { id: string }).id;
    }
    const put = (id: string, episode: string, body: unknown) => call(`/api/dramas/${id}/canvas/${episode}`, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

    it("keeps an episode's positions, and none before any were moved", async () => {
      const id = await sample();
      expect(await (await call(`/api/dramas/${id}/canvas/EP001`)).json()).toEqual({ positions: {} });
      const positions = { "assets/characters/lin": { x: 10, y: -20.5 }, "group:EP001 seg01": { x: 300, y: 0 }, "episodes/EP001/segments/seg01": { x: 16, y: 64 } };
      expect((await put(id, "EP001", { positions })).status).toBe(200);
      expect(await (await call(`/api/dramas/${id}/canvas/EP001`)).json()).toEqual({ positions });
    });

    it("replaces an episode's positions, and leaves another episode's alone", async () => {
      const id = await sample();
      await put(id, "EP001", { positions: { "assets/characters/lin": { x: 1, y: 2 } } });
      await put(id, "EP002", { positions: { "episodes/EP002/segments/seg01": { x: 3, y: 4 } } });
      await put(id, "EP001", { positions: { "assets/scenes/home": { x: 5, y: 6 } } });
      expect(await (await call(`/api/dramas/${id}/canvas/EP001`)).json()).toEqual({ positions: { "assets/scenes/home": { x: 5, y: 6 } } });
      expect(await (await call(`/api/dramas/${id}/canvas/EP002`)).json()).toEqual({ positions: { "episodes/EP002/segments/seg01": { x: 3, y: 4 } } });
    });

    it("lays an episode out again by forgetting its positions", async () => {
      const id = await sample();
      await put(id, "EP001", { positions: { "assets/characters/lin": { x: 1, y: 2 } } });
      await put(id, "EP002", { positions: { "assets/characters/lin": { x: 7, y: 8 } } });
      expect((await call(`/api/dramas/${id}/canvas/EP001`, { method: "DELETE" })).status).toBe(200);
      expect(await (await call(`/api/dramas/${id}/canvas/EP001`)).json()).toEqual({ positions: {} });
      expect(await (await call(`/api/dramas/${id}/canvas/EP002`)).json()).toEqual({ positions: { "assets/characters/lin": { x: 7, y: 8 } } });
    });

    it("refuses positions that aren't finite numbers for nodes the layout makes, naming the field", async () => {
      const id = await sample();
      for (const [positions, field] of [
        [{ "assets/characters/lin": { x: "1", y: 2 } }, "positions.assets/characters/lin.x"],
        [{ "assets/characters/lin": { x: 1 } }, "positions.assets/characters/lin.y"],
        [{ "episodes/EP002/segments/seg01": { x: 1, y: 2 } }, "positions.episodes/EP002/segments/seg01"],
        [{ "group:EP002 seg01": { x: 1, y: 2 } }, "positions.group:EP002 seg01"],
        [{ "character:lin": { x: 1, y: 2 } }, "positions.character:lin"],
      ] as const) {
        const response = await put(id, "EP001", { positions });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: "invalid-positions", detail: field });
      }
      const huge = await put(id, "EP001", { positions: { "assets/characters/lin": { x: 1e400, y: 2 } } });
      expect(await huge.json()).toMatchObject({ code: "invalid-positions" });
      expect((await put(id, "EP001", {})).status).toBe(400);
      expect(await (await call(`/api/dramas/${id}/canvas/EP001`)).json()).toEqual({ positions: {} });
    });

    it("says plainly when the drama doesn't exist", async () => {
      expect((await call("/api/dramas/no-such-drama/canvas/EP001")).status).toBe(404);
    });
  });

  it("says plainly when the drama of a project doesn't exist", async () => {
    const response = await call("/api/dramas/no-such-drama/project");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not-found" });
  });

  it("says plainly when a session doesn't exist", async () => {
    const response = await call("/api/sessions/no-such-session/status");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not-found" });
  });

  it("says how many Computers are still stopping, for the desktop app to ask before it quits", async () => {
    expect((await call("/api/connection/replay", { method: "POST" })).status).toBe(200);
    expect(((await (await call("/api/app")).json()) as AppInfo).stopping).toBe(0);
    const { run } = await import("./db.ts");
    const at = new Date().toISOString();
    run("insert into computers (id, drama_id, mode, label, credentials, state, created_at, updated_at) values ('c1', 'd1', 'replay', 'one', '', 'stopping', ?, ?), ('c2', 'd1', 'replay', 'two', '', 'running', ?, ?)", at, at, at, at);
    expect(((await (await call("/api/app")).json()) as AppInfo).stopping).toBe(1);
  });
});
