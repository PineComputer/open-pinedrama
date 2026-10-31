// A redo is one submission to the session that owns the items: sent once, whatever the retries; sent again only after
// the engine refused it; left "sending" when its outcome isn't known, for the maker to check (Codex's rebuttal, IA §14.6).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "studio-redo-"));
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

const chat = vi.fn<(sessionId: string, text: string) => Promise<void>>();
vi.mock("./dramas.ts", () => ({ chat: (sessionId: string, text: string) => chat(sessionId, text) }));

let redo: typeof import("./redo.ts");
let StudioError: typeof import("./errors.ts").StudioError;

beforeAll(async () => {
  (await import("./db.ts")).db();
  redo = await import("./redo.ts");
  StudioError = (await import("./errors.ts")).StudioError;
});

beforeEach(() => chat.mockReset());

describe("a redo", () => {
  it("is sent once under its submission, however often it is sent again", async () => {
    chat.mockResolvedValue();
    expect(await redo.redo("ep6", "sub-1", "Redo seg03 take t02.")).toEqual({ id: "sub-1", sessionId: "ep6", state: "sent" });
    expect(await redo.redo("ep6", "sub-1", "Redo seg03 take t02.")).toMatchObject({ state: "sent" });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat).toHaveBeenCalledWith("ep6", "Redo seg03 take t02.");
  });

  it("is recorded as refused with the engine's words, and may be sent again under the same submission", async () => {
    chat.mockRejectedValueOnce(new StudioError("session-ended", "This session has ended.", 409));
    await expect(redo.redo("setup", "sub-2", "Redo Case file v1.")).rejects.toThrow("This session has ended.");
    expect(redo.submission("sub-2")).toEqual({ id: "sub-2", sessionId: "setup", state: "refused", message: "This session has ended." });
    chat.mockResolvedValueOnce();
    expect(await redo.redo("setup", "sub-2", "Redo Case file v1.")).toEqual({ id: "sub-2", sessionId: "setup", state: "sent" });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("stays sending when its outcome is unknown, and is not sent twice", async () => {
    chat.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(redo.redo("ep6", "sub-3", "Redo seg03 storyboard v1.")).rejects.toThrow("socket hang up");
    expect(redo.submission("sub-3")).toMatchObject({ state: "sending" });
    expect(await redo.redo("ep6", "sub-3", "Redo seg03 storyboard v1.")).toMatchObject({ state: "sending" });
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("refuses a submission that went to another session, or none", async () => {
    chat.mockResolvedValue();
    await redo.redo("ep6", "sub-4", "Redo.");
    await expect(redo.redo("ep7", "sub-4", "Redo.")).rejects.toThrow("This submission went to another session.");
    await expect(redo.redo("ep6", "", "Redo.")).rejects.toThrow("A redo needs its submissionId.");
    expect(chat).toHaveBeenCalledTimes(1);
  });
});
