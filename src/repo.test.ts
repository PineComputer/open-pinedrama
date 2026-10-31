// The repo names the person only by their online name, merecdesperez44323-lab (the sprint's worker rules; master,
// 2026-10-30): no tracked file may carry the other one again. The name is spelled in parts so this file doesn't.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const name = ["yu", "run"].join("");

describe("the repo", () => {
  it("names the person only as merecdesperez44323-lab in every tracked file", () => {
    let found = "";
    try {
      // git grep exits 1 when nothing matches: that is the pass.
      found = execFileSync("git", ["grep", "-I", "-i", "-n", "-w", name, "--", "."], { encoding: "utf8" });
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error;
    }
    expect(found).toBe("");
  });
});
