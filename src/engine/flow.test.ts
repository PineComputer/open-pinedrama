// The whole production flow in replay mode, through the engine's HTTP API: a drama from
// its screenplay to accepted cuts, with episodes in parallel, files saved before questions
// open, and idle timeouts raised while the maker reviews.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DramaView, ReviewSummary, ReviewView } from "../shared/types.ts";

const DATA = mkdtempSync(path.join(tmpdir(), "studio-flow-"));
process.env.STUDIO_DATA_DIR = DATA;
process.env.STUDIO_MODE = "replay";
process.env.STUDIO_REPLAY_SPEED = "40";
process.env.STUDIO_TOKEN = "test-token";
process.env.STUDIO_SECRET = Buffer.alloc(32, 7).toString("base64");

let fetchApp: (request: Request) => Response | Promise<Response>;
let stop: () => void;

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { host: "127.0.0.1:4310", origin: "http://127.0.0.1:4310", cookie: "studio=test-token" } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { ...init.headers, "content-type": "application/json" };
  }
  const response = await fetchApp(new Request(`http://127.0.0.1:4310${url}`, init));
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(`${method} ${url}: ${json.error}`);
  return json;
}

async function until<T>(what: string, probe: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await probe();
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const openReview = (dramaId: string, filter: (review: ReviewSummary) => boolean) => () =>
  call<ReviewSummary[]>("GET", `/api/inbox?drama=${dramaId}`).then((items) => items.find((item) => item.state === "open" && filter(item)));

async function approveAll(id: string, words = "Approved.") {
  const review = await call<ReviewView>("GET", `/api/reviews/${id}`);
  return call<ReviewView>("POST", `/api/reviews/${id}/decision`, {
    words,
    items: review.reviewItems.map((item) => ({ key: item.key, verdict: "approve", notes: [] })),
  });
}

beforeAll(async () => {
  const { db } = await import("./db.ts");
  const { setFleet } = await import("./computers.ts");
  const { ReplayFleet } = await import("./replay-fleet.ts");
  const { startClock, stopClock } = await import("./scheduler.ts");
  const { app } = await import("./http.ts");
  db();
  setFleet(new ReplayFleet());
  startClock(50);
  fetchApp = app().fetch;
  stop = stopClock;
});

afterAll(() => {
  stop?.();
  rmSync(DATA, { recursive: true, force: true });
});

describe("a drama in replay", () => {
  it("goes from a screenplay to accepted cuts, two episodes at a time", async () => {
    const form = new FormData();
    form.set("title", "Test drama");
    form.set("language", "en");
    form.set("parallel", "2");
    form.set("perComputer", "1");
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);

    // The setup asks a question, then for the leads' looks, with their sheets saved first.
    const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
    await call("POST", `/api/reviews/${question.id}/decision`, { items: [], words: "He is 32." });
    const looks = await until("the looks review", openReview(id, (item) => item.kind === "looks"));
    const looksView = await call<ReviewView>("GET", `/api/reviews/${looks.id}`);
    expect(looksView.reviewItems.map((item) => item.key)).toEqual(["lin", "wei"]);
    expect(looksView.otherFiles.map((file) => file.kind).sort()).toEqual(["bible", "location", "location", "prop"]);

    // Revising one look redraws only that one.
    const revised = await call<ReviewView>("POST", `/api/reviews/${looks.id}/decision`, {
      words: "Fix Wei's jacket.",
      items: [
        { key: "lin", verdict: "approve", notes: [] },
        { key: "wei", verdict: "revise", notes: [{ fileId: looksView.reviewItems[1].files[0].id, x: 0.4, y: 0.6, text: "Lighter jacket." }] },
      ],
    });
    expect(revised.answer).toContain("- wei: Lighter jacket. (on drama/assets/characters/wei/v1/image-1.svg, at 40% across and 60% down)");
    const again = await until("the redrawn look", openReview(id, (item) => item.kind === "looks" && item.id !== looks.id));
    expect((await call<ReviewView>("GET", `/api/reviews/${again.id}`)).reviewItems.map((item) => item.key)).toEqual(["wei"]);
    await approveAll(again.id);

    // Production: two episodes at once, each waiting for its storyboards, on its own Computer.
    const drama = await until("two episodes waiting", async () => {
      const view = await call<DramaView>("GET", `/api/dramas/${id}`);
      return view.episodeRows.filter((row) => row.state === "waiting").length === 2 ? view : undefined;
    });
    expect(drama.status).toBe("production");
    expect(drama.episodeRows).toHaveLength(6);
    expect(drama.episodeRows.filter((row) => row.state === "queued")).toHaveLength(4);
    expect(new Set(drama.episodeRows.filter((row) => row.computer).map((row) => row.computer)).size).toBe(2);
    await until("idle timeouts raised for the reviews", async () => {
      const view = await call<DramaView>("GET", `/api/dramas/${id}`);
      return view.crew.every((computer) => computer.idleTimeoutMinutes === 180) ? view : undefined;
    });

    // EP001 through storyboards, takes and the cut; then EP003 takes its place.
    for (const kind of ["storyboards", "takes", "cut"] as const) {
      const review = await until(`EP001 ${kind}`, openReview(id, (item) => item.episode === "EP001" && item.kind === kind));
      await approveAll(review.id);
    }
    const after = await until("EP001 done and EP003 started", async () => {
      const view = await call<DramaView>("GET", `/api/dramas/${id}`);
      const rows = Object.fromEntries(view.episodeRows.map((row) => [row.code, row]));
      return rows.EP001.state === "done" && rows.EP003.state !== "queued" ? view : undefined;
    });
    expect(after.episodeRows.find((row) => row.code === "EP001")!.stages.cut.state).toBe("done");
  }, 30_000);
});
