// A Pine turn as the engine reads it (pine-fleet.ts, turnInfo): only files in the session's working directory, which the
// session's file API opens; a file saved to the Computer's artifacts is left out (PineSandbox docs/pine/portal/artifacts.md).
import type { AgentTurn } from "@pinesandbox/computer";
import { describe, expect, it, vi } from "vitest";
import { turnInfo } from "./pine-fleet.ts";

const file = (root: string, relativePath: string) => ({ root, relativePath, contentType: "image/png", size: 3, sha256: "abc", modifiedAt: undefined });

describe("a Pine turn's files", () => {
  it("keeps the working directory's files and leaves out those saved to the Computer's artifacts, saying so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const turn = {
      turnId: "t1",
      state: "completed",
      question: "",
      nextTurnId: "",
      result: { summary: "Done.", artifacts: [file("workdir", "drama/assets/characters/lin/v1/image-1.png"), file("artifact_store", "assets/lin.png")], usage: { cost: null } },
    } as unknown as AgentTurn;
    expect(turnInfo(turn).files.map((entry) => entry.path)).toEqual(["drama/assets/characters/lin/v1/image-1.png"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("assets/lin.png"));
    warn.mockRestore();
  });
});
