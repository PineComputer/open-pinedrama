// The status report each stop returns, kept per turn: a session's newest turn with a report
// that reads is where its project stands, whatever order the turns' files were saved in.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "studio-status-"));
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

let status: typeof import("./status.ts");
let db: typeof import("./db.ts");

function report(name: string): Uint8Array {
  return readFileSync(new URL(`../../fixtures/status/${name}.json`, import.meta.url));
}

let turns = 0;
/** A turn of session s1, recorded now: later calls make later turns. */
function turn(): string {
  const id = `turn-${++turns}`;
  db.run("insert into turns (id, session_id, state, created_at) values (?, 's1', 'completed', ?)", id, new Date(Date.UTC(2026, 9, 30, 10, 0, turns)).toISOString());
  return id;
}

beforeAll(async () => {
  db = await import("./db.ts");
  status = await import("./status.ts");
  db.db();
  db.run("insert into sessions (id, computer_id, drama_id, name, role, episode_id, state, created_at) values ('s1', 'c1', 'd1', 'setup', 'setup', null, 'open', ?)", new Date().toISOString());
});

beforeEach(() => {
  db.run("delete from statuses");
  db.run("delete from turns");
});

describe("a session's status", () => {
  it("is its newest report", () => {
    const first = turn();
    const second = turn();
    status.recordStatus("s1", first, report("new"));
    status.recordStatus("s1", second, report("story"));
    expect(status.sessionStatus("s1")?.turnId).toBe(second);
    expect(status.sessionStatus("s1")?.state.bible.accepted).toBe("v1");
  });

  it("isn't replaced by an older turn's report saved later", () => {
    const older = turn();
    const newer = turn();
    status.recordStatus("s1", newer, report("story"));
    status.recordStatus("s1", older, report("new"));
    expect(status.sessionStatus("s1")?.turnId).toBe(newer);
  });

  it("follows a later turn back to an earlier report it returned again", () => {
    const [a, b, c] = [turn(), turn(), turn()];
    status.recordStatus("s1", a, report("new"));
    status.recordStatus("s1", b, report("story"));
    status.recordStatus("s1", c, report("new"));
    expect(status.sessionStatus("s1")?.turnId).toBe(c);
    expect(status.sessionStatus("s1")?.state.bible.accepted).toBeNull();
  });

  it("keeps the last report that reads when a newer one doesn't, and says why", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const good = turn();
    const bad = turn();
    status.recordStatus("s1", good, report("story"));
    status.recordStatus("s1", bad, new TextEncoder().encode('{"preset": "x"}'));
    expect(status.sessionStatus("s1")?.turnId).toBe(good);
    expect(status.statusProblems("s1")).toEqual([{ turnId: bad, error: "drama-cli's status report: bible should be present." }]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("says when a report isn't JSON at all", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bad = turn();
    status.recordStatus("s1", bad, new TextEncoder().encode("drama-cli: command not found"));
    expect(status.sessionStatus("s1")).toBeUndefined();
    expect(status.statusProblems("s1")[0].error).toMatch(/not JSON/);
    warn.mockRestore();
  });

  it("is recorded once per turn", () => {
    const only = turn();
    status.recordStatus("s1", only, report("new"));
    status.recordStatus("s1", only, report("new"));
    expect(db.all("select turn_id from statuses")).toHaveLength(1);
  });

  it("is absent before any report", () => {
    expect(status.sessionStatus("s1")).toBeUndefined();
    expect(status.statusProblems("s1")).toEqual([]);
  });
});
