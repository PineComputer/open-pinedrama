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
  views: typeof import("./views.ts");
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
/** Ends the earlier tests' dramas and Computers, so a test's own drama has the line to itself. */
function quiet() {
  m.db.run("update dramas set status = 'done' where status in ('setup', 'production')");
  m.db.run("update computers set state = 'stopped', binding = null where state in ('starting', 'running', 'stopping', 'failed')");
}

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
    views: await import("./views.ts"),
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

  it("keeps within the project's limits: Computers at once, and idle time", async () => {
    const fleet = new m.replay.ReplayFleet();
    fleet.limits = async () => ({ maxComputers: 1, maxIdleSeconds: 1800, idleAdjustable: true, maxRuntimeSeconds: null });
    quiet();
    m.computers.setFleet(fleet);
    await m.computers.refreshLimits();
    m.scheduler.startClock(20);
    const first = await m.dramas.createDrama(newDrama("First in line"), "replay");
    const second = await m.dramas.createDrama(newDrama("Second in line"), "replay");
    const running = await until("one Computer", () => [...computersOf(first), ...computersOf(second)].find((row) => row.state === "running"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const live = m.db.all<{ id: string; idle_timeout: number }>("select * from computers where drama_id in (?, ?) and state in ('starting', 'running')", first, second);
    expect(live.map((row) => row.id)).toEqual([running.id]);
    expect(live[0].idle_timeout).toBe(1800);
    const waiting = m.views.dramaView(m.db.get("select * from dramas where id = ?", computersOf(first).length ? second : first)!);
    expect(waiting.atLimit).toBe(1);
    m.scheduler.stopClock();
  });

  it("waits out a busy project without counting it as a failure", async () => {
    const fleet = new m.replay.ReplayFleet();
    const create = fleet.createComputer.bind(fleet);
    let busy = 1;
    fleet.createComputer = async (...args) => {
      if (busy-- > 0) throw Object.assign(new Error("The project runs as many Computers as it may."), { retryLater: true });
      return create(...args);
    };
    quiet();
    m.computers.setFleet(fleet);
    m.scheduler.startClock(20);
    const id = await m.dramas.createDrama(newDrama("Busy project"), "replay");
    const waited = await until("the busy start", () => computersOf(id).find((row) => row.state === "failed"));
    expect(waited.failures).toBe(0);
    m.db.run("update computers set updated_at = ? where id = ?", new Date(0).toISOString(), waited.id);
    await until("the same Computer running", () => computersOf(id).find((row) => row.state === "running"));
    expect(computersOf(id).map((row) => row.id)).toEqual([waited.id]);
    m.scheduler.stopClock();
  });

  it("holds a drama whose project doesn't offer the drama skill, before any run", async () => {
    const fleet = new m.replay.ReplayFleet();
    fleet.skills = async () => ["pdf", "docx"];
    quiet();
    m.computers.setFleet(fleet);
    m.scheduler.startClock(20);
    const id = await m.dramas.createDrama(newDrama("No skill"), "replay");
    const held = await until("the hold", () => m.db.get<{ status: string; reason: string }>("select * from dramas where id = ? and status = 'stopped'", id));
    expect(held.reason).toBe("no-drama-skill");
    expect(m.db.all("select r.key from runs r join sessions s on s.id = r.session_id where s.drama_id = ?", id)).toHaveLength(0);
    expect(m.db.all("select id from sessions where drama_id = ? and state = 'open'", id)).toHaveLength(0);
    m.scheduler.stopClock();
  });

  it("asks for the longer idle timeout at start where it can't be changed later", async () => {
    const fleet = new m.replay.ReplayFleet();
    fleet.limits = async () => ({ maxComputers: null, maxIdleSeconds: null, idleAdjustable: false, maxRuntimeSeconds: null });
    let changes = 0;
    fleet.setIdleTimeout = async (_ref, seconds) => {
      changes += 1;
      return seconds;
    };
    quiet();
    m.computers.setFleet(fleet);
    m.scheduler.startClock(20);
    const id = await m.dramas.createDrama(newDrama("Fixed idle"), "replay");
    const computer = await until("its Computer", () => m.db.get<{ idle_timeout: number }>("select * from computers where drama_id = ? and state = 'running'", id));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(computer.idle_timeout).toBe(3 * 60 * 60);
    expect(changes).toBe(0);
    m.scheduler.stopClock();
  });

  it("never starts a Computer made in another project", async () => {
    const before = new m.replay.ReplayFleet();
    Object.defineProperty(before, "project", { value: "project-a" });
    quiet();
    m.computers.setFleet(before);
    m.scheduler.startClock(20);
    const id = await m.dramas.createDrama(newDrama("Switched projects"), "replay");
    const first = await until("its Computer", () => computersOf(id).find((row) => row.state === "running"));
    m.scheduler.stopClock();
    const after = new m.replay.ReplayFleet();
    Object.defineProperty(after, "project", { value: "project-b" });
    let restarts = 0;
    const start = after.startComputer.bind(after);
    after.startComputer = async (credentials, ...rest) => {
      if (credentials.includes(first.id)) restarts += 1;
      return start(credentials, ...rest);
    };
    m.computers.setFleet(after);
    expect(computersOf(id).find((row) => row.id === first.id)?.state).toBe("stopped");
    m.scheduler.startClock(20);
    await until("a Computer of the new project", () => computersOf(id).find((row) => row.id !== first.id && row.state === "running"));
    expect(restarts).toBe(0);
    m.scheduler.stopClock();
  });

  it("gives no new session to a Computer near the end of its running time, and starts it afresh", async () => {
    const fleet = new m.replay.ReplayFleet();
    let starts = 0;
    const start = fleet.startComputer.bind(fleet);
    fleet.startComputer = async (...args) => {
      starts += 1;
      return start(...args);
    };
    // The first start has an hour left; a fresh one, a week.
    fleet.stopBy = async () => new Date(Date.now() + (starts === 1 ? 60 * 60_000 : 7 * 24 * 3_600_000));
    let stops = 0;
    const stopComputer = fleet.stop.bind(fleet);
    fleet.stop = async (ref) => {
      stops += 1;
      return stopComputer(ref);
    };
    quiet();
    m.computers.setFleet(fleet);
    m.scheduler.startClock(20);
    const id = await m.dramas.createDrama(newDrama("Near its limit"), "replay");
    const session = await until("the setup session", () => m.db.get<{ computer_id: string }>("select * from sessions where drama_id = ? and role = 'setup'", id));
    expect(stops).toBe(1);
    expect(starts).toBe(2);
    expect(computersOf(id).map((row) => row.id)).toEqual([session.computer_id]);
    m.scheduler.stopClock();
  });

  it("carries on in the same session after a turn breaks off", async () => {
    const fleet = new m.replay.ReplayFleet();
    const wait = fleet.wait.bind(fleet);
    let broken = false;
    fleet.wait = async (...args) => {
      const info = await wait(...args);
      if (broken) return info;
      broken = true;
      return { ...info, state: "failed", summary: "The Computer's services restarted." };
    };
    quiet();
    m.computers.setFleet(fleet);
    m.scheduler.startClock(20);
    const id = await m.dramas.createDrama(newDrama("Broken off"), "replay");
    const resent = await until("the continue run", () =>
      m.db.get<{ session_id: string; goal: string }>("select r.* from runs r join sessions s on s.id = r.session_id where s.drama_id = ? and r.kind = 'continue'", id),
    );
    expect(resent.goal).toMatch(/broke off/);
    expect(m.db.get<{ state: string }>("select state from sessions where id = ?", resent.session_id)?.state).toBe("open");
    expect(m.db.get<{ status: string }>("select status from dramas where id = ?", id)?.status).toBe("setup");
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
