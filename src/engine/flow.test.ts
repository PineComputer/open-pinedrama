// The whole production flow in replay mode, through the engine's HTTP API: a drama from
// its screenplay through pre-production (every breakdown and shared reference approved, the
// project packed) to accepted cuts, with episodes in parallel on copies of that project,
// files saved before questions open, and idle timeouts raised while the maker reviews.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_ATTACHMENT, MAX_ATTACHMENT_MIB, MAX_REFERENCE, MAX_REFERENCE_MIB } from "../shared/types.ts";
import type { CastCard, ChatView, DeliveryRow, DramaView, EpisodePage, FileItem, ReviewSummary, ReviewView, ScriptPage, SessionRecord, SubmissionView } from "../shared/types.ts";

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
  call<ReviewSummary[]>("GET", `/api/reviews?drama=${dramaId}`).then((items) => items.find((item) => item.state === "open" && filter(item)));

/** The setup's first stop: the screenplay rewritten into drama-cli's Fountain, accepted in the maker's words. */
async function acceptRewrite(dramaId: string) {
  const rewrite = await until("the screenplay rewrite", openReview(dramaId, () => true));
  await call("POST", `/api/reviews/${rewrite.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "Yes, this is my script.", verdict: "approve" });
  return rewrite;
}

async function approveAll(id: string, words = "Approved.") {
  const review = await call<ReviewView>("GET", `/api/reviews/${id}`);
  return call<ReviewView>("POST", `/api/reviews/${id}/decision`, {
    submissionId: crypto.randomUUID(),
    words,
    items: review.reviewItems.map((item) => ({ key: item.key, verdict: "approve", notes: [], base: item.files.map((f) => f.id) })),
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
  form.set("preset", "en-us-live-sfw");
  form.set("screenplayLanguage", "en");
  form.set("screenplay", "0");
  form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
  const { id } = await call<{ id: string }>("POST", "/api/dramas", form);

  // The rewrite's question names the screenplay version it recorded, and takes a verdict, never read from the words.
  const rewrite = await until("the screenplay rewrite", openReview(id, () => true));
  expect((await call<ReviewView>("GET", `/api/reviews/${rewrite.id}`)).rewrite).toMatch(/^v\d+$/);
  await expect(call("POST", `/api/reviews/${rewrite.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "Yes, this is my script." })).rejects.toThrow("Accept screenplay");
  // A file goes with an answer to the agent's own question, never with a rewrite's verdict (Script owns that).
  const screenplay = new FormData();
  screenplay.set("file", new File(["EPISODE 1\nLin enters. Wei waits."], "full-screenplay.pdf", { type: "application/pdf" }));
  const attached = await call<FileItem>("POST", `/api/dramas/${id}/references`, screenplay);
  // The route keeps main's limit, and says it from its constant.
  const huge = new FormData();
  huge.set("file", new File([new Uint8Array(MAX_REFERENCE + 1)], "huge.pdf", { type: "application/pdf" }));
  await expect(call("POST", `/api/dramas/${id}/references`, huge)).rejects.toThrow(`huge.pdf is over ${MAX_REFERENCE_MIB} MiB`);
  await expect(
    call("POST", `/api/reviews/${rewrite.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "Yes, this is my script.", verdict: "approve", file: attached.id }),
  ).rejects.toThrow("Only an answer to the agent's question");
  // The setup asks a question, then for the leads' looks, with their sheets saved first.
  await acceptRewrite(id);
  const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
  // Only a file added to this drama goes; the one attached reaches the session, named in the answer.
  await expect(call("POST", `/api/reviews/${question.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "He is 32.", file: 999_999 })).rejects.toThrow("isn't one added");
  const answered = await call<ReviewView>("POST", `/api/reviews/${question.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "He is 32.", file: attached.id });
  expect(answered.answer).toBe(`He is 32.\nThe file I attached: attachments/reference-${attached.id}-full-screenplay.pdf`);
  expect(answered.decision?.file).toBe(attached.id);
  const looks = await until("the looks review", openReview(id, (item) => item.kind === "looks"));
  const looksView = await call<ReviewView>("GET", `/api/reviews/${looks.id}`);
  // A review of items takes no file.
  await expect(
    call("POST", `/api/reviews/${looks.id}/decision`, {
      submissionId: crypto.randomUUID(),
      words: "Fine.",
      items: looksView.reviewItems.map((item) => ({ key: item.key, verdict: "approve", notes: [], base: item.files.map((f) => f.id) })),
      file: attached.id,
    }),
  ).rejects.toThrow("Only an answer to the agent's question");
  expect(looksView.reviewItems.map((item) => item.key)).toEqual(["lin", "wei"]);
  // The bible comes back as Markdown and as its bible.json, as a real stop returns them.
  expect(looksView.otherFiles.map((file) => file.name)).toEqual(["bible.md", "bible.json"]);

  // Revising one look redraws only that one; the maker's own picture goes to the session with the note.
  const picture = new FormData();
  picture.set("file", new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "jacket.png", { type: "image/png" }));
  const reference = await call<FileItem>("POST", `/api/dramas/${id}/references`, picture);
  await expect(call("POST", `/api/dramas/${id}/references`, new FormData())).rejects.toThrow(/picture/);
  const revised = await call<ReviewView>("POST", `/api/reviews/${looks.id}/decision`, {
    submissionId: crypto.randomUUID(),
    words: "Fix Wei's jacket.",
    items: [
      { key: "lin", verdict: "approve", notes: [], base: looksView.reviewItems[0].files.map((f) => f.id) },
      { key: "wei", verdict: "revise", notes: [{ fileId: looksView.reviewItems[1].files[0].id, x: 0.4, y: 0.6, text: "Lighter jacket.", image: reference.id }], base: looksView.reviewItems[1].files.map((f) => f.id) },
    ],
  });
  expect(revised.answer).toContain(
    `- wei: Lighter jacket. (on ${looksView.reviewItems[1].files[0].path}, at 40% across and 60% down, see the picture I attached: attachments/reference-${reference.id}-jacket.png)`,
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
    // A restored project's config is pointed at this session's folder by the same init, keeping its settings.
    expect(goal).toContain("tar -xf - -C drama && drama-cli init drama --preset en-us-live-sfw --inputs.screenplay drama/inputs/screenplay.txt --inputs.brief drama/inputs/brief.md --screenplay-language en`");
    // Provider registrations belong to the session that made them: each episode registers its references again.
    expect(goal).toContain("register every reference the episode uses again from its local file in this session");
    // A segment the video model won't take is split there and then, not put to the maker.
    expect(goal).toMatch(/EP\d+'s own breakdown is yours to change when the video model won't take it/);
    // A reference not yet accepted stops the episode only where drama-cli refuses for it, never on the agent's own
    // reading ahead: every step that doesn't read it goes on first.
    expect(goal).toContain("Stop and ask me only when a drama-cli command refuses because a reference it reads is not accepted");
    expect(goal).not.toMatch(/needs one that is not accepted, stop and ask me/);
    costless(goal);
  }
  const setup = all<{ goal: string }>("select goal from runs where kind = 'setup'")[0].goal;
  // The maker chose drama-cli init's inputs in New drama and the studio wrote brief.md: the agent runs init as given.
  expect(setup).toContain("from my screenplay, attached as screenplay.txt.");
  expect(setup).toContain(
    "`mkdir -p drama/inputs && cp attachments/screenplay.txt drama/inputs/screenplay.txt && cp attachments/brief.md drama/inputs/brief.md && drama-cli init drama --preset en-us-live-sfw --inputs.screenplay drama/inputs/screenplay.txt --inputs.brief drama/inputs/brief.md --screenplay-language en`",
  );
  // The shared references are what drama-cli's status lists the accepted breakdowns as needing, not the agent's own
  // reading of "uses": a scene a heading sets at night needs its night plate (short_drama#634).
  expect(setup).toContain("then make every reference `drama-cli status --config drama/drama-cli.cfg.yaml` lists as needed by the accepted breakdowns");
  expect(setup).not.toMatch(/make every look, location and key prop that any breakdown uses/);
  expect(setup).toContain("My settings, which are final:");
  expect(setup).toContain("Episode length: about a minute and a half (80 to 110 seconds).");
  expect(setup).toContain("Where a source disagrees with my settings, follow my settings.");
  costless(setup);
  expect(drama.episodeRows.every((row) => row.stages.breakdown.state === "done")).toBe(true);
  const boards = await until("EP001 storyboards", openReview(id, (item) => item.episode === "EP001" && item.kind === "storyboards"));
  const boardsView = await call<ReviewView>("GET", `/api/reviews/${boards.id}`);
  expect(boardsView.breakdown?.path).toBe("drama/episodes/EP001/breakdown/v1/breakdown.md");
  // Its row's picture is a storyboard, not the blocking beside it.
  expect(boardsView.reviewItems.flatMap((item) => item.files).find((file) => file.url === boards.thumb?.url)?.kind).toBe("storyboard");

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
  // Every session, the setup's and each episode's, may publish to its Computer's artifacts (Codex's rc3 run, C10).
  expect(fleet.sessionsCreated.length).toBeGreaterThan(2);
  expect(new Set(fleet.sessionsCreated.map((session) => session.artifactAccess))).toEqual(new Set(["read_write"]));
  // The setup handed over, from the maker's inputs; each episode started on the project it handed over.
  const history = await call<SessionRecord[]>("GET", `/api/dramas/${id}/session-history`);
  expect(history.filter((session) => session.scope === "setup").map((session) => [session.startedFrom, session.handedOver])).toEqual([["inputs", true]]);
  expect(new Set(history.filter((session) => session.scope !== "setup").map((session) => [session.startedFrom, session.handedOver].join()))).toEqual(new Set(["project,false"]));
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
  // The storyboards in their tab, the blocking reference they were drawn from in its own; the storyboard review's verdict on both.
  expect(episode.segments[0].boards[0].files.map((file) => file.style)).toEqual(["line-art", "photoreal"]);
  expect(episode.segments[0].stills[0].files.map((file) => file.kind)).toEqual(["blocking"]);
  expect(episode.segments[0].boards[0].review?.verdict).toBe("approve");
  expect(episode.segments[0].stills[0].review?.verdict).toBe("approve");
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
  // Script is the screenplay's home (IA §16): the bible and the breakdowns are Story's and the episodes'.
  expect(Object.keys(script).sort()).toEqual(["inputs", "screenplayFile", "versions"]);
  // The maker's screenplay, and the brief the studio wrote from New drama.
  expect(script.inputs.map((file) => file.name)).toEqual(["screenplay.txt", "brief.md"]);
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

  it("refuses a screenplay over what a Computer can be handed, saying that limit from its constant", async () => {
    const form = new FormData();
    form.set("title", "Too large");
    form.set("screenplay", "0");
    form.append("files", new File([new Uint8Array(MAX_ATTACHMENT + 1)], "huge.pdf", { type: "application/pdf" }));
    await expect(call("POST", "/api/dramas", form)).rejects.toThrow(`huge.pdf is over ${MAX_ATTACHMENT_MIB} MiB`);
  });

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
    // The status report keeps its name too: every stop that names it has it recorded, and the
    // project stands where the last one says (EP001's cut accepted).
    const naming_status = all<{ id: string }>("select t.id from turns t join sessions s on s.id = t.session_id where s.episode_id = ? and t.question like '%(handoff/status.json)%'", episode.id);
    expect(naming_status.length).toBeGreaterThan(1);
    const recorded = all<{ turn_id: string }>("select turn_id from statuses where report is not null");
    expect(naming_status.filter((turn) => !recorded.some((row) => row.turn_id === turn.id))).toEqual([]);
    const { projectView } = await import("./status.ts");
    const [drama] = all<{ id: string }>("select id from dramas where title = 'Test drama, named files'");
    expect(projectView(drama.id).state?.episodes.EP001.cut.accepted).toBe("v1");
    // So does the lineage: every stop that names it has it recorded, and the drama's lineage ends at that cut.
    const naming_lineage = all<{ id: string }>("select t.id from turns t join sessions s on s.id = t.session_id where s.episode_id = ? and t.question like '%(handoff/lineage.json)%'", episode.id);
    expect(naming_lineage.length).toBeGreaterThan(1);
    const kept = all<{ turn_id: string }>("select turn_id from lineages where export is not null");
    expect(naming_lineage.filter((turn) => !kept.some((row) => row.turn_id === turn.id))).toEqual([]);
    const { lineageView } = await import("./lineage.ts");
    expect(lineageView(drama.id).lineage?.nodes.find((node) => node.id === "episodes/EP001/edit")?.accepted).toBe("v1");
  }, 30_000);

  // The Computer goes away while a turn's files are being saved: the parts saved before it went
  // are not a pack to carry on from, and the last turn whose files were all saved still is.
  it("never resumes from a pack whose turn's files were not all saved", async () => {
    const { all, get, run } = await import("./db.ts");
    const { episodeArchive, projectArchive } = await import("./runs.ts");
    const drama = get<{ id: string }>("select id from dramas where title = 'Test drama, named files'")!;
    const episode = get<{ id: string }>("select id from episodes where drama_id = ? and number = 1", drama.id)!;
    const project = projectArchive(drama.id);
    const own = episodeArchive(episode.id);
    expect(project.length).toBeGreaterThan(0);
    expect(own.length).toBeGreaterThan(0);
    const at = new Date().toISOString();
    for (const [session, episodeId, relPath] of [
      [project[0].session_id!, null, "handoff/project.tar.part-ab"],
      [own[0].session_id!, episode.id, "handoff/EP001.tar.part-ab"],
    ] as const) {
      const turn = `turn_partial_${session}`;
      run("insert into turns (id, session_id, state, files_saved, save_error, created_at, ended_at) values (?, ?, 'completed', 0, ?, ?, ?)",
        turn, session, "the Computer can't be reached", at, at);
      run(`insert into files (drama_id, episode_id, session_id, turn_id, sha, rel_path, name, type, size, kind, created_at)
           values (?, ?, ?, ?, 'partial', ?, ?, 'application/octet-stream', 1, 'archive', ?)`,
        drama.id, episodeId, session, turn, relPath, path.posix.basename(relPath), at);
    }
    expect(all("select id from files where turn_id like 'turn_partial_%'").length).toBe(2);
    expect(projectArchive(drama.id).map((pack) => pack.id)).toEqual(project.map((pack) => pack.id));
    expect(episodeArchive(episode.id).map((pack) => pack.id)).toEqual(own.map((pack) => pack.id));
  }, 30_000);

  // A Computer stops while its episode waits on the maker, who resumes the episode. The new session
  // asks about the same storyboards, unchanged: they are still in front of the maker, as items.
  // Asked with the storyboards returned again, or only named.
  it.each(["ask", "name"] as const)("shows a resumed episode's storyboards again when its new session asks about them unchanged (%s)", async (stops) => {
    const { get, run } = await import("./db.ts");
    const { computerRef, markStopped } = await import("./computers.ts");
    const { resumeEpisode } = await import("./dramas.ts");
    run("update dramas set status = 'done'");
    fleet.stops = stops;
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Resumed drama", language: "en", preset: "en-us-live-sfw", screenplayLanguage: "en", screenplay: "0", parallel: "1", perComputer: "1" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    await acceptRewrite(id);
    const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
    await call("POST", `/api/reviews/${question.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "He is 32." });
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
    // EP001's first session was lost with its Computer; the resumed one started on the project and EP001's own pack.
    const ep001 = (await call<SessionRecord[]>("GET", `/api/dramas/${id}/session-history`)).filter((session) => session.scope === "EP001");
    expect(ep001.map((session) => [session.state, session.startedFrom])).toEqual([
      ["lost", "project"],
      ["open", "episode-pack"],
    ]);
  }, 30_000);

  // Codex's IA review, 14.6: a decision is taken once. The same submission again gets the first result and sends
  // nothing; another window's for a decided review is refused; a send that failed may be tried again under its id.
  it("takes each decision once, whatever repeats or races it", async () => {
    const { get, run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "ask";
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Decided once", language: "en", preset: "en-us-live-sfw", screenplayLanguage: "en", screenplay: "0", parallel: "1", perComputer: "1" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    // The rewrite's question takes a verdict; the setup's plain question after it ignores one.
    const decide = (review: string, submissionId: string, words: string) => call<ReviewView>("POST", `/api/reviews/${review}/decision`, { submissionId, items: [], words, verdict: "approve" });
    const turns = (review: string) => get<{ n: number }>("select count(*) as n from turns where session_id = (select session_id from reviews where id = ?)", review)!.n;

    // A send that fails reopens the review; the same submission, tried again, goes.
    const rewrite = await until("the screenplay rewrite", openReview(id, () => true));
    const answer = fleet.answer;
    fleet.answer = async () => {
      throw new Error("the line dropped");
    };
    await expect(decide(rewrite.id, "first", "Yes, this is my script.")).rejects.toThrow(/the line dropped/);
    fleet.answer = answer;
    const sent = await decide(rewrite.id, "first", "Yes, this is my script.");
    expect(sent.state).toBe("answered");
    // The same submission again, a reply lost on the way say: the first result, and nothing sent.
    const before = turns(rewrite.id);
    const again = await decide(rewrite.id, "first", "Yes, this is my script.");
    expect([again.state, again.answer]).toEqual([sent.state, sent.answer]);
    expect(turns(rewrite.id)).toBe(before);

    // Two windows send at once: one decision goes, the other is refused.
    const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
    const raced = await Promise.allSettled([decide(question.id, "window-a", "He is 32."), decide(question.id, "window-b", "He is 40.")]);
    expect(raced.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect((raced[1] as PromiseRejectedResult).reason.message).toMatch(/already decided/);
    expect(get<{ answer: string }>("select answer from reviews where id = ?", question.id)!.answer).toContain("He is 32.");

    // A second press while the first is still on its way: the first one only.
    const looks = await until("the looks", openReview(id, (item) => item.kind === "looks"));
    const view = await call<ReviewView>("GET", `/api/reviews/${looks.id}`);
    const approve = () => call<ReviewView>("POST", `/api/reviews/${looks.id}/decision`, { submissionId: "press", words: "Approved.", items: view.reviewItems.map((item) => ({ key: item.key, verdict: "approve", notes: [], base: item.files.map((f) => f.id) })) });
    const atFirst = turns(looks.id);
    // A draft made on another version (a second window, a stale client): the engine refuses it and sends nothing
    // (Codex's IA round 3, Conflict; D47), and the review stays open for a decision on what it shows now.
    const stale = call("POST", `/api/reviews/${looks.id}/decision`, { submissionId: "stale", words: "Approved.", items: view.reviewItems.map((item) => ({ key: item.key, verdict: "approve", notes: [], base: [-1] })) });
    await expect(stale).rejects.toThrow(/newer version/);
    expect(turns(looks.id)).toBe(atFirst);
    expect((await call<ReviewView>("GET", `/api/reviews/${looks.id}`)).state).toBe("open");
    const [first, second] = await Promise.all([approve(), approve()]);
    expect(first.state).toBe("answered");
    expect(["sending", "answered"]).toContain(second.state);
    expect(turns(looks.id)).toBe(atFirst + 1);

    // A studio that lost the answer finds the decision by its submission (Codex's IA round 3, Interrupt): taken, so it
    // never sends it again; a submission nothing took is no submission at all.
    expect(await call("GET", "/api/submissions/press")).toMatchObject({ id: "press", state: "sent" });
    await expect(call("GET", "/api/submissions/never-sent")).rejects.toThrow(/No such submission/);
  });

  // The maker reviews only what they chose: the studio approves the rest as the agent stops for it, but never a photoreal
  // storyboard, a take or a cut. The person alone reviews the photoreal storyboard (D141) and watches every video version
  // (Take) and every cut (D76), whatever they chose.
  it("approves on its own what the maker chose not to review, never a photoreal storyboard, a take or a cut", async () => {
    const { all, run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "ask";
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Unreviewed drama", language: "en", preset: "en-us-live-sfw", screenplayLanguage: "en", screenplay: "0", parallel: "2", perComputer: "1", reviewing: "none" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    // A question always waits for the maker.
    await acceptRewrite(id);
    const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
    await call("POST", `/api/reviews/${question.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "He is 32." });
    // Looks and references go on by themselves. EP001's storyboards show its photoreal boards, so they wait for the maker
    // under every setting, and so do its takes and its cut.
    const boards = await until("EP001's storyboards", openReview(id, (item) => item.episode === "EP001" && item.kind === "storyboards"));
    for (const reviewing of ["key", "none"]) await call("PATCH", `/api/dramas/${id}`, { reviewing });
    expect((await openReview(id, (item) => item.id === boards.id)())?.state).toBe("open");
    await approveAll(boards.id);
    const takes = await until("EP001's takes", openReview(id, (item) => item.episode === "EP001" && item.kind === "takes"));
    for (const reviewing of ["key", "none"]) await call("PATCH", `/api/dramas/${id}`, { reviewing });
    expect((await openReview(id, (item) => item.id === takes.id)())?.state).toBe("open");
    await approveAll(takes.id);
    const cut = await until("EP001's cut", openReview(id, (item) => item.episode === "EP001" && item.kind === "cut"));
    for (const reviewing of ["key", "none"]) await call("PATCH", `/api/dramas/${id}`, { reviewing });
    expect((await openReview(id, (item) => item.id === cut.id)())?.state).toBe("open");
    const answers = all<{ kind: string; answer: string }>("select kind, answer from reviews where drama_id = ? and state = 'answered'", id);
    const unreviewed = (kind: string) => answers.filter((row) => row.kind === kind).map((row) => row.answer.includes("Approved without review"));
    expect(["looks", "references"].map((kind) => unreviewed(kind).length > 0 && unreviewed(kind).every(Boolean))).toEqual([true, true]);
    expect([...unreviewed("storyboards"), ...unreviewed("takes"), ...unreviewed("cut")]).not.toContain(true);
  }, 60_000);

  // The maker's edit of a cut (Apply): bound to the cut it was made on and to each take's file, sent once per submission
  // as the goal to build it with drama-cli edit, and never sent when a take it uses is not the file the maker chose.
  it("sends a cut's edit once, as the goal to build it, and never on inputs that changed", async () => {
    const { all, run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "ask";
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Edited drama", language: "en", preset: "en-us-live-sfw", screenplayLanguage: "en", screenplay: "0", parallel: "1", perComputer: "1", reviewing: "every" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    await acceptRewrite(id);
    const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
    await call("POST", `/api/reviews/${question.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "He is 32." });
    for (const kind of ["looks", "references", "storyboards", "takes"]) {
      const review = await until(kind, openReview(id, (item) => item.kind === kind && (item.episode ?? "EP001") === "EP001"), 30_000);
      await approveAll(review.id);
    }
    const summary = await until("EP001's cut", openReview(id, (item) => item.episode === "EP001" && item.kind === "cut"), 30_000);
    const review = await call<ReviewView>("GET", `/api/reviews/${summary.id}`);
    const cut = review.reviewItems[0].files.find((file) => file.kind === "cut")!;
    const plan = cut.cutPlan && "clips" in cut.cutPlan ? cut.cutPlan : undefined;
    expect(plan?.clips.length).toBeGreaterThan(0);
    const takes = (await call<FileItem[]>("GET", `/api/dramas/${id}/files?episode=${review.episodeId}`)).filter((file) => file.kind === "take");
    const shaOf = (segment: string, take: string) => takes.find((file) => file.segment === segment && file.version === take)!.sha;
    const clips = [...plan!.clips].reverse().map((clip) => ({ segment: clip.segment, take: clip.take, sha: shaOf(clip.segment, clip.take), in: 0.5, out: clip.end - clip.start, audio: "silence" }));
    const decision = (edit: unknown) => ({ submissionId: "apply-1", words: "", items: [{ key: review.reviewItems[0].key, verdict: "revise", notes: [], base: review.reviewItems[0].files.map((f) => f.id) }], edit });

    await expect(call("POST", `/api/reviews/${review.id}/decision`, decision({ base: cut.id, clips: [{ ...clips[0], sha: "not-the-file" }, ...clips.slice(1)] }))).rejects.toThrow("inputs changed");
    expect(all<{ state: string }>("select state from reviews where id = ?", review.id)[0].state).toBe("open");

    const sent = await call<ReviewView>("POST", `/api/reviews/${review.id}/decision`, decision({ base: cut.id, clips }));
    const again = await call<ReviewView>("POST", `/api/reviews/${review.id}/decision`, decision({ base: cut.id, clips }));
    expect([sent.state, again.state].every((state) => ["sending", "answered"].includes(state))).toBe(true);
    const [row] = all<{ answer: string; decision: string }>("select answer, decision from reviews where id = ?", review.id);
    expect(row.answer).toContain("drama-cli edit build EP001");
    expect(row.answer).toContain("drama-cli edit validate EP001");
    expect(row.answer).toContain(`1. ${takes.find((file) => file.segment === clips[0].segment && file.version === clips[0].take)!.path}, from 0.5 s`);
    expect(JSON.parse(row.decision).edit.clips.map((clip: { segment: string }) => clip.segment)).toEqual(clips.map((clip) => clip.segment));
  }, 90_000);

  // The maker stops a drama: its Computers stop, nothing new starts, and Try again carries on.
  it("stops when the maker says, and carries on when they try again", async () => {
    const { all, run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "ask";
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Stopped drama", language: "en", preset: "en-us-live-sfw", screenplayLanguage: "en", screenplay: "0", parallel: "1", perComputer: "1" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    await acceptRewrite(id);
    await until("the setup question", openReview(id, (item) => item.kind === "question"));
    await call("POST", `/api/dramas/${id}/stop`);
    const stopped = await call<DramaView>("GET", `/api/dramas/${id}`);
    expect([stopped.status, stopped.setup.reason]).toEqual(["stopped", "by-maker"]);
    expect(all("select id from computers where drama_id = ? and state != 'stopped'", id)).toEqual([]);
    expect(await openReview(id, () => true)()).toBeUndefined();
    await call("POST", `/api/dramas/${id}/resume`);
    await until("the setup question again", openReview(id, (item) => item.kind === "question"));
    // The session history keeps the one the stop ended beside the one that carried on, each with its Computer, oldest first.
    const history = await call<SessionRecord[]>("GET", `/api/dramas/${id}/session-history`);
    expect(history.map((session) => [session.scope, session.state])).toEqual([
      ["setup", "lost"],
      ["setup", "open"],
    ]);
    // Resume starts the drama's stopped Computer again (computers.ts restart): the same PC-1, a new session on it.
    expect(history.map((session) => session.computer)).toEqual(["PC-1", "PC-1"]);
    expect(history[0].closedAt).toBeDefined();
    expect(history[1].closedAt).toBeUndefined();
    // A stopped setup never handed over, and its restart starts from the maker's inputs again, no pack (Codex's rc2, C4).
    expect(history.map((session) => [session.startedFrom, session.handedOver])).toEqual([
      ["inputs", false],
      ["inputs", false],
    ]);
  }, 30_000);

  // Or ask about files it neither returns nor names. It may be asking something else entirely (a reference it
  // couldn't make), so the studio asks the maker in words, with what it finds in the agent's folder beside the question.
  it("asks in words, with the agent's pictures beside it, when a question points at no files", async () => {
    const { run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "bare";
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Test drama, bare questions", language: "en", preset: "en-us-live-sfw", screenplayLanguage: "en", screenplay: "0", parallel: "1", perComputer: "1" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    await acceptRewrite(id);
    const question = await until("the setup question", openReview(id, () => true));
    await call("POST", `/api/reviews/${question.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "He is 32." });
    const looks = await until("the leads' looks, asked in words", openReview(id, (item) => item.id !== question.id));
    expect(looks.kind).toBe("question");
    const view = await call<ReviewView>("GET", `/api/reviews/${looks.id}`);
    expect(view.reviewItems).toEqual([]);
    expect(view.otherFiles.filter((file) => file.kind === "look").map((file) => file.subject)).toEqual(["lin", "wei"]);
    await call("POST", `/api/reviews/${looks.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "Approved." });
    await until("the shared references, asked in words", openReview(id, (item) => item.id !== looks.id && item.id !== question.id));
  }, 30_000);

  // Replay's other sample dramas tell their own names: Bride on Bail's setup stops on its screenplay's red line, as
  it("gives a replayed review a stable id, from its drama, its scope and its place, so a link survives a rebuild (D73)", async () => {
    const { createHash } = await import("node:crypto");
    fleet.stops = "ask";
    const { id } = await call<{ id: string }>("POST", "/api/dramas/sample", { language: "en", sample: "double-life-rewrite" });
    const rewrite = await until("the screenplay rewrite", openReview(id, () => true));
    // The same seed makes the same drama id (D43) and so the same review id: the setup's first stop.
    expect(rewrite.id).toBe(`rev_${createHash("sha256").update(`${id}:setup:1`).digest("hex").slice(0, 16)}`);
  });

  // drama-cli refuses the bible for one, and goes on with its own leads once the maker has decided.
  it("plays another sample drama with its own names, started as long ago as its data says", async () => {
    const { run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "ask";
    const { id } = await call<{ id: string }>("POST", "/api/dramas/sample", { language: "en", sample: "bride-on-bail" });
    const drama = await call<DramaView>("GET", `/api/dramas/${id}`);
    expect(drama.title).toBe("Bride on Bail");
    // Started 2 minutes ago (fixtures/replay/dramas.json): its start, messages and questions are stamped then.
    const { get: row } = await import("./db.ts");
    const ago = (at: string) => (Date.now() - Date.parse(at)) / 60_000;
    expect(ago(row<{ created_at: string }>("select created_at from dramas where id = ?", id)!.created_at)).toBeGreaterThan(1.9);
    await acceptRewrite(id);
    const age = await until("the setup question", openReview(id, (item) => item.kind === "question"));
    await call("POST", `/api/reviews/${age.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "He is 32." });
    const looks = await until("the leads' looks", openReview(id, (item) => item.kind === "looks"));
    expect(ago(row<{ created_at: string }>("select created_at from reviews where id = ?", age.id)!.created_at)).toBeGreaterThan(1.9);
    expect(ago(row<{ at: string }>("select max(m.at) at from messages m join sessions s on s.id = m.session_id where s.drama_id = ?", id)!.at)).toBeGreaterThan(1.9);
    expect((await call<ReviewView>("GET", `/api/reviews/${looks.id}`)).question).toContain("Ivy Bell and Luca Moreno");
    const { projectView } = await import("./status.ts");
    expect(Object.values(projectView(id).names?.characters ?? {}).map((character) => character.name)).toEqual(["Ivy Bell", "Luca Moreno", "Ethan Cole", "Margaret Cole", "Walter Cole", "Sgt. Ray Dunn", "Reverend Hale", "Tess Park"]);
    // Its bible gives each place and prop its description, which Story's Scenes and Props show.
    expect(projectView(id).names?.descriptions.locations.garden).toMatch(/arch of roses/);
    expect(projectView(id).names?.descriptions.props.file).toMatch(/manila folder/);
  }, 30_000);

  it("takes a message to a scope in its open session only, once per submission, and opens no session for one (D71, UI-only tag)", async () => {
    const { run, all, get } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "ask";
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Messages", language: "en", parallel: "1", perComputer: "1", length: "90", preset: "en-us-live-sfw", screenplayLanguage: "en", screenplay: "0" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    const send = (scope: string, submissionId: string, text = "Make the office brighter.") => call<SubmissionView>("POST", `/api/dramas/${id}/messages`, { scope, submissionId, text });
    const kept = (submissionId: string) => get<{ state: string }>("select state from scope_messages where id = ?", submissionId)?.state;
    const sessionsOf = (code: string) => all<{ id: string }>("select s.id from sessions s join episodes e on e.id = s.episode_id where s.drama_id = ? and e.number = ?", id, Number(code.slice(2))).length;
    // The setup's session waits on the screenplay rewrite's verdict, which is given on Script, never in words.
    const rewrite = await until("the screenplay rewrite", openReview(id, () => true));
    const setupSession = get<{ session_id: string }>("select session_id from reviews where id = ?", rewrite.id)!.session_id;
    expect(await call<ChatView>("GET", `/api/sessions/${setupSession}/chat`)).toMatchObject({ sends: "review", reviewId: rewrite.id, rewrite: expect.stringMatching(/^v\d+$/) });
    await expect(send("setup", "sub-0")).rejects.toThrow(/Decide this in its review/);
    expect(kept("sub-0")).toBeUndefined();
    await acceptRewrite(id);
    // Its plain question takes a message as the answer, in the session that asked it, once per submission id.
    const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
    const asked = get<{ session_id: string }>("select session_id from reviews where id = ?", question.id)!.session_id;
    expect(await send("setup", "sub-1", "He is 32.")).toMatchObject({ id: "sub-1", state: "sent", sessionId: asked });
    expect(await send("setup", "sub-1", "He is 32.")).toMatchObject({ id: "sub-1", state: "sent", sessionId: asked });
    expect(await call("GET", "/api/submissions/sub-1")).toMatchObject({ id: "sub-1", state: "sent", sessionId: asked });
    expect(get<{ state: string }>("select state from reviews where id = ?", question.id)?.state).not.toBe("open");
    await approveAll((await until("the looks", openReview(id, (item) => item.kind === "looks"))).id);
    await approveAll((await until("the shared references", openReview(id, (item) => item.kind === "references"))).id);
    const boards = await until("EP001 storyboards", openReview(id, (item) => item.episode === "EP001" && item.kind === "storyboards"));
    await until("the setup session closed", async () => get("select id from sessions where drama_id = ? and role = 'setup' and state = 'open'", id) === undefined || undefined);
    // A scope with no open session refuses, in words that say so, and nothing is kept or opened: the setup after its
    // handover, EP002 waiting its turn; EP001's session waits on its storyboards, decided in their review.
    await expect(send("setup", "sub-2")).rejects.toThrow(/The setup has no open session in this version/);
    await expect(send("EP002", "sub-3")).rejects.toThrow(/EP002 has no open session in this version/);
    await expect(send("EP001", "sub-4")).rejects.toThrow(/Decide this in its review/);
    await expect(send("EP009", "sub-5")).rejects.toThrow(/no EP009/);
    await expect(send("setup", "sub-6", " ")).rejects.toThrow(/Write a message first/);
    // A finished episode has no session either: a message to it opens none.
    for (const kind of ["storyboards", "takes", "cut"] as const) await approveAll((kind === "storyboards" ? boards : await until(`EP001 ${kind}`, openReview(id, (item) => item.episode === "EP001" && item.kind === kind))).id);
    await until("EP001 done", async () => (await call<DramaView>("GET", `/api/dramas/${id}`)).episodeRows.find((row) => row.code === "EP001")?.state === "done" || undefined);
    await expect(send("EP001", "sub-7", "Trim the last shot.")).rejects.toThrow(/EP001 is done; this version can't reopen a finished episode/);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(sessionsOf("EP001")).toBe(1);
    // Stopped, an episode's Computer is gone: the refusal names main's Resume. A stopped project takes no message.
    await call("POST", `/api/dramas/${id}/stop`);
    await expect(send("EP002", "sub-8")).rejects.toThrow(/The project is stopped/);
    run("update dramas set status = 'production' where id = ?", id);
    run("update episodes set state = 'stopped' where drama_id = ? and number = 2", id);
    await expect(send("EP002", "sub-9")).rejects.toThrow(/EP002's Computer stopped: Resume it to continue in a new session with its files/);
    run("update dramas set status = 'stopped' where id = ?", id);
    expect(["sub-2", "sub-3", "sub-4", "sub-5", "sub-6", "sub-7", "sub-8", "sub-9"].map(kept).filter(Boolean)).toEqual([]);
  }, 60_000);

  // Codex's rc2 run, C7 (qa/rc2-trace/t9-turn-states.json): the setup asks three questions above a last paragraph that
  // isn't one, and its status report has no bible and no episodes. The studio must stop for the maker, never ask the agent
  // to pack and list episodes, and never start an episode; whether the turn returned its report or not.
  it.each([true, false])("stops for the maker when the setup's project isn't ready by drama-cli's report, however the agent phrased it (report returned: %s)", async (reported) => {
    const { run, all, get } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = "ask";
    const T9 = "Ingestion and screenplay review are complete; no bible, images, forbidden references, storyboards, or video were generated.\n\nThe TXT screenplay was preserved unchanged, and its content matches the supplied PDF after whitespace normalization. The project is initialized in `drama/` with 9:16, 480p, and `budget_usd: null`.\n\nPlease clarify:\n1. Is `51-1 夜 内 家` Episode 51? The source has no Episode 51 heading.\n2. What should the second Episode 10 scene currently labeled `10-1` be numbered?\n3. Are `邵一帆/邵一凡` and later `陈一帆/陈一凡` the same son, with the latter being his renamed form?\n\nOnce clarified, I can create a separate Fountain-form rewrite that preserves the source words and continue only after your review.";
    const status = readFileSync(path.resolve("fixtures", "status", "new.json"));
    const played = { run: fleet.run, wait: fleet.wait, openFile: fleet.openFile };
    const scripted = new Set<string>();
    fleet.run = async (computer, session, goal, key) => {
      const info = await played.run.call(fleet, computer, session, goal, key);
      if (/vertical short drama from my screenplay/.test(goal)) scripted.add(info.turnId);
      return info;
    };
    fleet.wait = async (computer, session, turnId, timeout) =>
      scripted.has(turnId)
        ? { turnId, state: "completed", question: "", summary: T9, nextTurnId: "", files: reported ? [{ path: "handoff/status.json", size: status.length, sha256: "", type: "application/json" }] : [], cost: 0.04, media: 0 }
        : played.wait.call(fleet, computer, session, turnId, timeout);
    fleet.openFile = async (computer, session, file) =>
      file === "handoff/status.json" ? new Response(status).body! : played.openFile.call(fleet, computer, session, file);
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries({ title: `T9 ${reported}`, language: "en", parallel: "1", perComputer: "1", length: "60", preset: "zh-cn-live-sfw", screenplayLanguage: "zh", screenplay: "0" })) form.set(key, value);
      form.append("files", new File(["第1集\n1-1 日 内 家\n人物：邵一帆"], "screenplay.txt", { type: "text/plain" }));
      const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
      // A question for the maker, in the agent's own words.
      const review = await until("the setup's questions", openReview(id, (item) => item.kind === "question"));
      expect((await call<ReviewView>("GET", `/api/reviews/${review.id}`)).question).toBe(T9);
      // No run the studio wrote itself (no "pack … list the episodes"), no episode, no production.
      expect(all("select r.kind from runs r join sessions s on s.id = r.session_id where s.drama_id = ? and r.kind != 'setup'", id)).toEqual([]);
      const drama = await call<DramaView>("GET", `/api/dramas/${id}`);
      expect([drama.status, drama.episodeRows.length]).toEqual(["setup", 0]);
      expect(get("select id from sessions where drama_id = ? and role = 'episode'", id)).toBeUndefined();
      // Without the report, the maker is told what is missing and what to ask for.
      expect(get<{ note: string }>("select note from dramas where id = ?", id)!.note).toEqual(reported ? "" : expect.stringMatching(/without drama-cli's status report.*handoff\/status\.json/));
      await call("POST", `/api/dramas/${id}/stop`);
    } finally {
      Object.assign(fleet, played);
    }
  }, 30_000);

  it("refuses a sample drama it doesn't have", async () => {
    await expect(call("POST", "/api/dramas/sample", { language: "en", sample: "nope" })).rejects.toThrow(/sample-unknown|No sample drama/);
  });

  // A take sent back past the take cap isn't shot: the agent asks the maker, returning drama-cli's refusal, or
  // naming it, which the stop carries for its card, and no review shows it as a file.
  it.each(["ask", "name"] as const)("asks about the take cap with drama-cli's refusal (%s)", async (stops) => {
    const { run } = await import("./db.ts");
    run("update dramas set status = 'done'");
    fleet.stops = stops;
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: `Capped drama, ${stops}`, language: "en", preset: "en-us-live-sfw", screenplayLanguage: "en", screenplay: "0", parallel: "1", perComputer: "1" })) form.set(key, value);
    form.append("files", new File(["EPISODE 1\nLin enters."], "screenplay.txt", { type: "text/plain" }));
    const { id } = await call<{ id: string }>("POST", "/api/dramas", form);
    await acceptRewrite(id);
    const question = await until("the setup question", openReview(id, (item) => item.kind === "question"));
    await call("POST", `/api/reviews/${question.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "He is 32." });
    for (const kind of ["looks", "references"] as const) await approveAll((await until(kind, openReview(id, (item) => item.kind === kind))).id);
    await approveAll((await until("EP001 storyboards", openReview(id, (item) => item.episode === "EP001" && item.kind === "storyboards"))).id);
    const sendBack = async (review: ReviewSummary) => {
      const view = await call<ReviewView>("GET", `/api/reviews/${review.id}`);
      expect(view.refusals).toEqual([]);
      const items = view.reviewItems.map((item) => ({ key: item.key, verdict: item.key === "seg01" ? "revise" : "approve", notes: item.key === "seg01" ? [{ text: "Try again." }] : [], base: item.files.map((f) => f.id) }));
      await call("POST", `/api/reviews/${review.id}/decision`, { submissionId: crypto.randomUUID(), words: "seg01 again.", items });
    };
    // t01, then two new takes, shoot.max_new_takes in the replayed project.
    let seen: string[] = [];
    for (let n = 0; n < 3; n++) {
      const takes = await until(`EP001 takes ${n + 1}`, openReview(id, (item) => item.episode === "EP001" && item.kind === "takes" && !seen.includes(item.id)));
      seen = [...seen, takes.id];
      await sendBack(takes);
    }
    const capped = await until("the take cap's question", openReview(id, (item) => item.episode === "EP001" && item.kind === "question"));
    const view = await call<ReviewView>("GET", `/api/reviews/${capped.id}`);
    expect(view.refusals).toEqual([
      {
        code: "SetLimitExceeded.max_new_takes",
        message: "seg01 has had 2 new paid takes, the limit shoot.max_new_takes (2); ask the person before shooting it again",
        param: "shoot.max_new_takes",
        action: "ask_person",
      },
    ]);
    expect(view.refusalsError).toBeUndefined();
    expect(view.otherFiles.filter((file) => file.kind === "refusal")).toEqual([]);
    const { stopKind } = await import("../shared/refusal.ts");
    expect(stopKind(view.refusals[0])).toEqual({ kind: "cap", key: "shoot.max_new_takes" });
    // Sent back again without the limit raised, the same refusal comes back, the same file afresh: this stop has it too.
    await call("POST", `/api/reviews/${capped.id}/decision`, { submissionId: crypto.randomUUID(), items: [], words: "Revise:\n- seg01: once more" });
    const again = await until("the take cap's question again", openReview(id, (item) => item.episode === "EP001" && item.kind === "question" && item.id !== capped.id));
    expect((await call<ReviewView>("GET", `/api/reviews/${again.id}`)).refusals).toEqual(view.refusals);
  }, 30_000);
});
