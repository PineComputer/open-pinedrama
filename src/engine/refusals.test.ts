// The refusals a stop returns, kept per turn: as they read, or, when they don't, why not, so the
// stop's card shows that instead of a kind it can't know.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "studio-refusals-"));
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

let refusals: typeof import("./refusals.ts");

beforeAll(async () => {
  (await import("./db.ts")).db();
  refusals = await import("./refusals.ts");
});

const bytes = (text: string) => new TextEncoder().encode(text);
const RED_LINE = { code: "RedLine", message: "Bible v2 is not usable: lin is 15, below defaults.min_character_age (18)", param: null, action: "ask_person" };

describe("a stop's refusals", () => {
  it("are kept for its turn as they read", () => {
    refusals.recordRefusals("s1", "t1", bytes(`${JSON.stringify({ error: RED_LINE })}\n`));
    expect(refusals.turnRefusals("t1")).toEqual({ refusals: [RED_LINE] });
  });

  it("say why when they don't read", () => {
    refusals.recordRefusals("s1", "t2", bytes("drama-cli refused\n"));
    expect(refusals.turnRefusals("t2")).toEqual({ refusals: [], refusalsError: "The refusals, line 1: the line should be one JSON object." });
  });

  it("are none for a turn that returned none", () => {
    expect(refusals.turnRefusals("t3")).toEqual({ refusals: [] });
  });

  it("stay as the turn first returned them", () => {
    refusals.recordRefusals("s1", "t1", bytes(`${JSON.stringify({ error: { ...RED_LINE, message: "later" } })}\n`));
    expect(refusals.turnRefusals("t1")).toEqual({ refusals: [RED_LINE] });
  });
});
