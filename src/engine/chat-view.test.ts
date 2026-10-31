// The conversation is the one log of what the maker decided (D70): a decision the maker sent shows in its
// session's chat as they made it, each item accepted or sent back with its version and its reason, read from the record.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "studio-chat-"));
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

let views: typeof import("./views.ts");
let records: typeof import("./records.ts");

beforeAll(async () => {
  const { db, run } = await import("./db.ts");
  views = await import("./views.ts");
  records = await import("./records.ts");
  db();
  const at = new Date().toISOString();
  run("insert into dramas (id, title, language, look, format, parallel, per_computer, notes, mode, status, created_at, updated_at) values ('d1', 'Test', 'en', 'live action', '9:16, 480p', 1, 1, '', 'replay', 'production', ?, ?)", at, at);
  run("insert into episodes (id, drama_id, number, title, state, updated_at) values ('e6', 'd1', 6, 'Six', 'working', ?)", at);
  run("insert into sessions (id, computer_id, drama_id, name, role, episode_id, state, created_at) values ('s6', 'c1', 'd1', 'EP006', 'episode', 'e6', 'open', ?)", at);
  const file = (id: number, segment: string, version: string) =>
    run(
      "insert into files (id, drama_id, episode_id, session_id, turn_id, sha, rel_path, name, type, size, kind, segment, version, created_at) values (?, 'd1', 'e6', 's6', 't1', ?, ?, 'video.mp4', 'video/mp4', 1, 'take', ?, ?, ?)",
      id,
      `sha${id}`.padEnd(64, "0"),
      `episodes/EP006/segments/${segment}/${version}/video.mp4`,
      segment,
      version,
      at,
    );
  file(1, "seg01", "t02");
  file(2, "seg03", "t02");
  const decision = {
    submissionId: "sub1",
    words: "Good, seg01 is it.",
    items: [
      { key: "seg01", verdict: "approve", notes: [], base: [1] },
      { key: "seg03", verdict: "revise", notes: [{ text: "Open on Luca's face." }], base: [2] },
    ],
  };
  run(
    "insert into reviews (id, drama_id, episode_id, session_id, turn_id, kind, state, question, decision, answer, created_at) values ('r1', 'd1', 'e6', 's6', 't1', 'takes', 'answered', '', ?, 'ANSWER', ?)",
    JSON.stringify(decision),
    at,
  );
  run("insert into messages (session_id, kind, text, at) values ('s6', 'input', 'ANSWER', ?)", at);
  run("insert into messages (session_id, kind, text, at) values ('s6', 'input', 'Make it warmer.', ?)", at);
});

describe("a session's chat", () => {
  it("shows a decision as the maker made it: each item, its version, its verdict and its reason, and their words", () => {
    const chat = views.chatView(records.session("s6")!);
    const [decided, said] = chat.messages;
    expect(decided.decision).toEqual({
      reviewId: "r1",
      kind: "takes",
      words: "Good, seg01 is it.",
      items: [
        { label: "seg01", version: "t02", verdict: "approve", notes: [] },
        { label: "seg03", version: "t02", verdict: "revise", notes: ["Open on Luca's face."] },
      ],
    });
    expect(said.decision).toBeUndefined();
    expect(said.text).toBe("Make it warmer.");
  });
});
