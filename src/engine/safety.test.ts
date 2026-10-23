// What keeps the studio safe to leave running: who may call its API, how returned files are
// served, and that work and Computers stay where the maker put them, through failures.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATA = mkdtempSync(path.join(tmpdir(), "studio-safety-"));
process.env.STUDIO_DATA_DIR = DATA;
process.env.STUDIO_REPLAY_SPEED = "40";
process.env.STUDIO_TOKEN = "test-token";
process.env.STUDIO_SECRET = Buffer.alloc(32, 9).toString("base64");

type Modules = {
  db: typeof import("./db.ts");
  computers: typeof import("./computers.ts");
  scheduler: typeof import("./scheduler.ts");
  dramas: typeof import("./dramas.ts");
  library: typeof import("./library.ts");
  replay: typeof import("./replay-fleet.ts");
  http: typeof import("./http.ts");
};
let m: Modules;

const HOST = "127.0.0.1:4310";
const SIGNED_IN = { host: HOST, origin: `http://${HOST}`, cookie: "studio=test-token" };

function request(method: string, url: string, headers: Record<string, string>, body?: string) {
  return m.http.app().fetch(new Request(`http://${HOST}${url}`, { method, headers, body }));
}

async function until<T>(what: string, probe: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = probe();
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const screenplay = { name: "screenplay.txt", type: "text/plain", bytes: new TextEncoder().encode("EPISODE 1\nLin enters.") };
const newDrama = (title: string) => ({ title, language: "en", look: "", format: "", parallel: 1, perComputer: 1, notes: "", files: [screenplay] });
const computersOf = (dramaId: string) => m.db.all<{ id: string; state: string; failures: number }>("select * from computers where drama_id = ? order by created_at", dramaId);

beforeAll(async () => {
  m = {
    db: await import("./db.ts"),
    computers: await import("./computers.ts"),
    scheduler: await import("./scheduler.ts"),
    dramas: await import("./dramas.ts"),
    library: await import("./library.ts"),
    replay: await import("./replay-fleet.ts"),
    http: await import("./http.ts"),
  };
  m.db.db();
});

afterAll(() => {
  m.scheduler.stopClock();
  rmSync(DATA, { recursive: true, force: true });
});

describe("the API", () => {
  it("answers only the studio's own window", async () => {
    expect((await request("GET", "/api/dramas", { host: HOST })).status).toBe(401);
    expect((await request("GET", "/api/dramas", { host: HOST, cookie: "studio=guess" })).status).toBe(401);
    expect((await request("GET", "/api/dramas", SIGNED_IN)).status).toBe(200);
    const foreign = await request("POST", "/api/connection/replay", { ...SIGNED_IN, origin: "http://localhost:3000" });
    expect(foreign.status).toBe(403);
    expect((await request("GET", "/api/dramas", { host: "studio.example.com", cookie: "studio=test-token" })).status).toBe(404);
  });

  it("lets a window in through the printed link", async () => {
    const opened = await request("GET", "/api/open?ticket=test-token", { host: HOST });
    expect(opened.status).toBe(302);
    expect(opened.headers.get("set-cookie")).toMatch(/^studio=test-token;.*HttpOnly/);
    expect((await request("GET", "/api/open?ticket=old", { host: HOST })).status).toBe(403);
  });

  it("serves returned files so they can't act as the studio's pages", async () => {
    const page = await m.library.save(new TextEncoder().encode("<script>fetch('/api/dramas')</script>"), { dramaId: "d", relPath: "out/page.html", type: "text/html" });
    const picture = await m.library.save(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"), { dramaId: "d", relPath: "out/a.svg", type: "image/svg+xml" });
    const html = await request("GET", `/api/files/${page}`, SIGNED_IN);
    expect(html.headers.get("content-type")).toBe("application/octet-stream");
    expect(html.headers.get("content-disposition")).toMatch(/^attachment/);
    const svg = await request("GET", `/api/files/${picture}`, SIGNED_IN);
    expect(svg.headers.get("content-disposition")).toBeNull();
    expect(svg.headers.get("content-security-policy")).toMatch(/^sandbox/);
    expect(svg.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("the production line", () => {
  it("never runs a drama made in the other mode", async () => {
    m.computers.setFleet(new m.replay.ReplayFleet());
    m.scheduler.startClock(20);
    const pineDrama = await m.dramas.createDrama(newDrama("Made on Pine"), "pine");
    const replayDrama = await m.dramas.createDrama(newDrama("Made in replay"), "replay");
    await until("the replay drama's Computer", () => computersOf(replayDrama).find((row) => row.state === "running"));
    expect(computersOf(pineDrama)).toHaveLength(0);
    m.scheduler.stopClock();
  });

  it("retries a failed Create as the same Computer, then waits for the maker", async () => {
    const fleet = new m.replay.ReplayFleet();
    const create = fleet.createComputer.bind(fleet);
    let refusals = 3;
    fleet.createComputer = async (...args) => {
      if (refusals-- > 0) throw new Error("Create answered nothing");
      return create(...args);
    };
    const start = fleet.startComputer.bind(fleet);
    fleet.startComputer = async (...args) => {
      if (refusals-- > 0) throw new Error("Start answered nothing");
      return start(...args);
    };
    m.computers.setFleet(fleet);
    m.scheduler.startClock(20);
    const id = await m.dramas.createDrama(newDrama("Flaky"), "replay");
    const failed = await until("the failed start", () => computersOf(id).find((row) => row.state === "failed"));
    // No new identity while the first one can still be started; after enough failures, the line waits.
    m.db.run("update computers set failures = ?, updated_at = ? where id = ?", m.computers.START_ATTEMPTS, new Date(0).toISOString(), failed.id);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(computersOf(id)).toHaveLength(1);
    expect(computersOf(id)[0].state).toBe("failed");
    refusals = 0;
    m.computers.retryStarts(id);
    await until("the same Computer running", () => computersOf(id).find((row) => row.state === "running"));
    expect(computersOf(id).map((row) => row.id)).toEqual([failed.id]);
    m.scheduler.stopClock();
  });

  it("keeps the project connected while a Computer won't stop", async () => {
    const fleet = new m.replay.ReplayFleet();
    Object.defineProperty(fleet, "mode", { value: "pine" });
    fleet.stop = async () => {
      throw new Error("stop refused");
    };
    m.computers.setFleet(fleet);
    m.scheduler.startClock(20);
    const id = await m.dramas.createDrama(newDrama("Stubborn"), "pine");
    const computer = await until("its Computer", () => computersOf(id).find((row) => row.state === "running"));
    m.scheduler.stopClock();
    const response = await request("DELETE", "/api/connection", SIGNED_IN);
    expect(response.status).toBe(502);
    expect(((await response.json()) as { code: string }).code).toBe("stop-failed");
    expect(computersOf(id).find((row) => row.id === computer.id)?.state).toBe("running");
    expect(m.computers.hasFleet()).toBe(true);
  });
});
