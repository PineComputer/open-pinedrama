// The engine's HTTP API as the UI calls it, in process through Hono's app.request(): who may
// call it, and the answers the UI reads, in the shared types (docs/TESTING.md).
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect((await response.json()) as ProjectView).toEqual({ state: null, sessions: [], problems: [] });
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
