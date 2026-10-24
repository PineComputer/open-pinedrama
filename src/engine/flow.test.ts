// The whole production flow in replay mode, through the engine's HTTP API: a drama from
// its screenplay through pre-production (every breakdown and shared reference approved, the
// project packed) to accepted cuts, with episodes in parallel on copies of that project,
// files saved before questions open, and idle timeouts raised while the maker reviews.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CastCard, DeliveryRow, DramaView, EpisodePage, FileItem, ReviewSummary, ReviewView, ScriptPage } from "../shared/types.ts";

const DATA = mkdtempSync(path.join(tmpdir(), "studio-flow-"));
process.env.STUDIO_DATA_DIR = DATA;
process.env.STUDIO_MODE = "replay";
process.env.STUDIO_REPLAY_SPEED = "40";
process.env.STUDIO_TOKEN = "test-token";
process.env.STUDIO_SECRET = Buffer.alloc(32, 7).toString("base64");

let fetchApp: (request: Request) => Response | Promise<Response>;
let stop: () => void;
let fleet: import("./replay-fleet.ts").ReplayFleet;

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
  fleet = new ReplayFleet();
  setFleet(fleet);
  startClock(50);
  fetchApp = app().fetch;
  stop = stopClock;
});

afterAll(() => {
  stop?.();
  rmSync(DATA, { recursive: true, force: true });
});

/** One drama from its screenplay to accepted cuts, two episodes at a time. */
async function scenario(title: string) {
  const form = new FormData();
  form.set("title", title);
  form.set("language", "en");
  form.set("parallel", "2");
  form.set("perComputer", "1");
  form.set("length", "90");
  form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
  const { id } = await call<{ id: string }>("POST", "/api/dramas", form);

  // The setup asks a question, then for the leads' looks, with their sheets saved first.
  const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
  await call("POST", `/api/reviews/${question.id}/decision`, { items: [], words: "He is 32." });
  const looks = await until("the looks review", openReview(id, (item) => item.kind === "looks"));
  const looksView = await call<ReviewView>("GET", `/api/reviews/${looks.id}`);
  expect(looksView.reviewItems.map((item) => item.key)).toEqual(["lin", "wei"]);
  expect(looksView.otherFiles.map((file) => file.kind)).toEqual(["bible"]);

  // Revising one look redraws only that one; the maker's own picture goes to the session with the note.
  const picture = new FormData();
  picture.set("file", new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "jacket.png", { type: "image/png" }));
  const reference = await call<FileItem>("POST", `/api/dramas/${id}/references`, picture);
  await expect(call("POST", `/api/dramas/${id}/references`, new FormData())).rejects.toThrow(/picture/);
  const revised = await call<ReviewView>("POST", `/api/reviews/${looks.id}/decision`, {
    words: "Fix Wei's jacket.",
    items: [
      { key: "lin", verdict: "approve", notes: [] },
      { key: "wei", verdict: "revise", notes: [{ fileId: looksView.reviewItems[1].files[0].id, x: 0.4, y: 0.6, text: "Lighter jacket.", image: reference.id }] },
    ],
  });
  expect(revised.answer).toContain(
    `- wei: Lighter jacket. (on drama/assets/characters/wei/v1/image-1.svg, at 40% across and 60% down, see the picture I attached: attachments/reference-${reference.id}-jacket.png)`,
  );
  const again = await until("the redrawn look", openReview(id, (item) => item.kind === "looks" && item.id !== looks.id));
  const redrawn = await call<ReviewView>("GET", `/api/reviews/${again.id}`);
  expect(redrawn.reviewItems.map((item) => item.key)).toEqual(["wei"]);
  // The earlier look sits beside the new one, to compare.
  expect(redrawn.reviewItems[0].previous?.map((file) => file.version)).toEqual(["v1"]);
  expect(redrawn.reviewItems[0].files[0].version).toBe("v2");
  expect(redrawn.reviewItems[0].asked?.map((note) => note.text)).toEqual(["Lighter jacket."]);
  expect(looksView.reviewItems[0].previous).toBeUndefined();
  await approveAll(again.id);

  // Pre-production: every episode's breakdown, then the looks, places and props they use, for the maker to approve.
  const shared = await until("the shared references", openReview(id, (item) => item.kind === "references"));
  const sharedView = await call<ReviewView>("GET", `/api/reviews/${shared.id}`);
  expect(sharedView.reviewItems.map((item) => item.key)).toEqual(["lin/S1", "location:home", "location:office", "prop:letter"]);
  expect(sharedView.reviewItems.map((item) => item.label)).toEqual(["lin/S1", "home", "office", "letter"]);
  expect(sharedView.otherFiles.filter((file) => file.kind === "breakdown")).toHaveLength(6);
  await approveAll(shared.id);

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
  // Each episode got the packed project, not loose references, and its breakdown came from pre-production.
  const { all } = await import("./db.ts");
  const { NO_CAP } = await import("./goals.ts");
  // The agent is told nothing of cost but that there is no cap, which drama-cli needs to make a project:
  // Pine bills it, and the studio shows what was spent.
  const costless = (goal: string) => {
    expect(goal).toContain(NO_CAP);
    expect(goal.replace(NO_CAP, "")).not.toMatch(/budget|spend|cost|\$/i);
  };
  const goals = all<{ goal: string }>("select goal from runs where kind = 'episode'");
  expect(goals.length).toBeGreaterThanOrEqual(2);
  for (const { goal } of goals) {
    expect(goal).toContain("attachments/project.tar.part-*");
    // Provider registrations belong to the session that made them: each episode registers its references again.
    expect(goal).toContain("register every reference the episode uses again from its local file in this session");
    // A segment the video model won't take is split there and then, not put to the maker.
    expect(goal).toMatch(/EP\d+'s own breakdown is yours to change when the video model won't take it/);
    costless(goal);
  }
  const setup = all<{ goal: string }>("select goal from runs where kind = 'setup'")[0].goal;
  expect(setup).toContain("(screenplay.txt, brief.md)");
  costless(setup);
  expect(drama.episodeRows.every((row) => row.stages.breakdown.state === "done")).toBe(true);
  const boards = await until("EP001 storyboards", openReview(id, (item) => item.episode === "EP001" && item.kind === "storyboards"));
  expect((await call<ReviewView>("GET", `/api/reviews/${boards.id}`)).breakdown?.path).toBe("drama/episodes/EP001/breakdown/v1/breakdown.md");

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
  // What it cost: the takes' video is billed as it settles, after their turns, and counts toward the episode and the drama.
  const billed = await until("EP001's video billed", async () => {
    const view = await call<DramaView>("GET", `/api/dramas/${id}`);
    return view.episodeRows.find((row) => row.code === "EP001")!.spent.media > 0 ? view : undefined;
  });
  const ep001 = billed.episodeRows.find((row) => row.code === "EP001")!;
  expect(ep001.spent.total).toBeGreaterThan(ep001.spent.media);
  expect(billed.spent.media).toBeGreaterThanOrEqual(ep001.spent.media);
  expect(billed.spent.total).toBeGreaterThan(ep001.spent.total);

  // Browsing: the episode receipt by receipt, with the verdict on what each review showed.
  const episode = await call<EpisodePage>("GET", `/api/dramas/${id}/episodes/EP001`);
  expect(episode.segments.map((segment) => segment.key)).toEqual(["seg01", "seg02", "seg03"]);
  expect(episode.segments[0].boards[0].files.map((file) => file.kind).sort()).toEqual(["blocking", "storyboard", "storyboard"]);
  expect(episode.segments[0].boards[0].review?.verdict).toBe("approve");
  expect(episode.segments[0].takes[0].review?.verdict).toBe("approve");
  expect(episode.cuts[0].review?.verdict).toBe("approve");
  expect(episode.breakdown?.path).toBe("drama/episodes/EP001/breakdown/v1/breakdown.md");
  expect(episode.other.some((file) => file.kind === "archive")).toBe(false);
  expect(episode.next).toBe("EP002");
  // Delivery: the cut approved, where it is known; the script; the cast with every version decided.
  const delivery = await call<DeliveryRow[]>("GET", `/api/dramas/${id}/delivery`);
  expect(delivery[0].accepted?.path).toBe("drama/episodes/EP001/edit/v1/cut.mp4");
  expect(delivery[1].accepted).toBeUndefined();
// The cut handed back again when the episode finished is the one approved, not a new one unreviewed.
expect(delivery[0].latest?.review?.verdict).toBe("approve");
// The season download: the approved cut, named by episode, in a folder named for the drama.
const zip = await fetchApp(new Request(`http://127.0.0.1:4310/api/dramas/${id}/season.zip`, { headers: { host: "127.0.0.1:4310", cookie: "studio=test-token" } }));
expect(zip.headers.get("content-type")).toBe("application/zip");
const archive = Buffer.from(await zip.arrayBuffer());
expect(archive.length).toBe(Number(zip.headers.get("content-length")));
expect(archive.includes(Buffer.from(`${title}/EP001`))).toBe(true);
expect(archive.includes(Buffer.from(`${title}/EP002`))).toBe(false);
  const script = await call<ScriptPage>("GET", `/api/dramas/${id}/script`);
  expect(script.bible?.kind).toBe("bible");
  expect(script.breakdowns.map((entry) => entry.code)).toEqual(["EP001", "EP002", "EP003", "EP004", "EP005", "EP006"]);
  expect(script.inputs.map((file) => file.name)).toEqual(["screenplay.txt", "brief.md"]);
  // The brief, written from New drama in the form the drama skill reads.
  const brief = await (await fetchApp(new Request(`http://127.0.0.1:4310${script.inputs[1].url}`, { headers: { host: "127.0.0.1:4310", cookie: "studio=test-token" } }))).text();
  expect(brief).toContain(`- Title: ${title}\n`);
  expect(brief).toContain("- Episode length: about a minute and a half (80 to 110 seconds).");
  expect(brief).not.toMatch(/budget/i);
  const cast = await call<CastCard[]>("GET", `/api/dramas/${id}/cast`);
  const wei = cast.find((card) => card.subject === "wei")!;
  expect(wei.looks[0].versions.map((version) => [version.files[0].version, version.review?.verdict])).toEqual([
    ["v2", "approve"],
    ["v1", "revise"],
  ]);
  expect(cast.find((card) => card.subject === "lin")!.looks.map((look) => look.look)).toEqual(["base", "S1"]);
  // Where each appears, by the episodes' breakdowns.
  expect(cast.find((card) => card.subject === "lin")!.episodes).toEqual(["EP001", "EP002", "EP003", "EP004", "EP005", "EP006"]);
  expect(cast.find((card) => card.subject === "office")!.episodes).toEqual([]);
}

describe("a drama in replay", () => {
  it("goes from a screenplay to accepted cuts, two episodes at a time", () => scenario("Test drama"), 30_000);

  // Pine's agent may stop for the maker by ending its turn, files and question in its summary,
  // rather than asking: the same reviews open, and each decision goes as the session's next run.
  it("does the same when the agent ends its turn at each stop instead of asking", async () => {
    const { run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "finish";
    await scenario("Test drama, finished turns");
    const { all } = await import("./db.ts");
    expect(all<{ kind: string }>("select kind from runs where kind = 'decision'").length).toBeGreaterThan(5);
  }, 30_000);

  // Or ask without returning its files, naming them in the question: the studio fetches what it names.
  it("does the same when the agent's questions only name their files", async () => {
    const { run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "name";
    await scenario("Test drama, named files");
    // The episode's pack keeps its name at every stop: each stop's is fetched again, and a resume gets the last.
    const { all } = await import("./db.ts");
    const { episodeArchive } = await import("./runs.ts");
    const [episode] = all<{ id: string }>("select e.id from episodes e join dramas d on d.id = e.drama_id where d.title = 'Test drama, named files' and e.number = 1");
    const packs = all<{ turn_id: string }>("select turn_id from files where episode_id = ? and kind = 'archive' order by id", episode.id);
    const naming = all<{ id: string }>("select t.id from turns t join sessions s on s.id = t.session_id where s.episode_id = ? and t.question like '%(handoff/EP001.tar.part-aa)%'", episode.id);
    expect(naming.length).toBeGreaterThan(1);
    expect(naming.filter((turn) => !packs.some((pack) => pack.turn_id === turn.id))).toEqual([]);
    expect(episodeArchive(episode.id).map((pack) => pack.turn_id)).toEqual([packs.at(-1)!.turn_id]);
  }, 30_000);

  // A Computer stops while its episode waits on the maker, who resumes the episode. The new session
  // asks about the same storyboards, unchanged: they are still in front of the maker, as items.
  it("shows a resumed episode's storyboards again when its new session asks about them unchanged", async () => {
    const { get, run } = await import("./db.ts");
    const { computerRef, markStopped } = await import("./computers.ts");
    const { resumeEpisode } = await import("./dramas.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "name";
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Resumed drama", language: "en", parallel: "1", perComputer: "1" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
    await call("POST", `/api/reviews/${question.id}/decision`, { items: [], words: "He is 32." });
    await approveAll((await until("the looks", openReview(id, (item) => item.kind === "looks"))).id);
    await approveAll((await until("the shared references", openReview(id, (item) => item.kind === "references"))).id);
    const first = await until("EP001 storyboards", openReview(id, (item) => item.episode === "EP001" && item.kind === "storyboards"));
    const episode = get<{ id: string; session_id: string }>("select id, session_id from episodes where drama_id = ? and number = 1", id)!;
    const computer = get<import("./records.ts").ComputerRow>("select c.* from computers c join sessions s on s.computer_id = c.id where s.id = ?", episode.session_id)!;
    await fleet.stop(computerRef(computer));
    // Together, so the line doesn't hand the free place to the next episode first.
    markStopped(computer, "Its Computer stopped.");
    resumeEpisode(episode.id);
    const again = await until("EP001 storyboards again", openReview(id, (item) => item.episode === "EP001" && item.id !== first.id));
    expect(again.kind).toBe("storyboards");
    const ids = (review: ReviewView) => review.reviewItems.flatMap((item) => item.files.map((file) => file.id));
    expect(ids(await call<ReviewView>("GET", `/api/reviews/${again.id}`))).toEqual(ids(await call<ReviewView>("GET", `/api/reviews/${first.id}`)));
  }, 30_000);

  // The maker stops a drama: its Computers stop, nothing new starts, and Try again carries on.
  it("stops when the maker says, and carries on when they try again", async () => {
    const { all, run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "ask";
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Stopped drama", language: "en", parallel: "1", perComputer: "1" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    await until("the setup question", openReview(id, (item) => item.kind === "question"));
    await call("POST", `/api/dramas/${id}/stop`);
    const stopped = await call<DramaView>("GET", `/api/dramas/${id}`);
    expect([stopped.status, stopped.setup.reason]).toEqual(["stopped", "by-maker"]);
    expect(all("select id from computers where drama_id = ? and state != 'stopped'", id)).toEqual([]);
    expect(await openReview(id, () => true)()).toBeUndefined();
    await call("POST", `/api/dramas/${id}/retry`);
    await until("the setup question again", openReview(id, (item) => item.kind === "question"));
  }, 30_000);

  // Or ask about files it neither returns nor names. It may be asking something else entirely (a reference it
  // couldn't make), so the studio asks the maker in words, with what it finds in the agent's folder beside the question.
  it("asks in words, with the agent's pictures beside it, when a question points at no files", async () => {
    const { run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "bare";
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Test drama, bare questions", language: "en", parallel: "1", perComputer: "1" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    const question = await until("the setup question", openReview(id, () => true));
    await call("POST", `/api/reviews/${question.id}/decision`, { items: [], words: "He is 32." });
    const looks = await until("the leads' looks, asked in words", openReview(id, (item) => item.id !== question.id));
    expect(looks.kind).toBe("question");
    const view = await call<ReviewView>("GET", `/api/reviews/${looks.id}`);
    expect(view.reviewItems).toEqual([]);
    expect(view.otherFiles.filter((file) => file.kind === "look").map((file) => file.subject)).toEqual(["lin", "wei"]);
    await call("POST", `/api/reviews/${looks.id}/decision`, { items: [], words: "Approved." });
    await until("the shared references, asked in words", openReview(id, (item) => item.id !== looks.id && item.id !== question.id));
  }, 30_000);
});
