// The canvas's SteerBar (P6.3), used as a maker uses it: pick an item, then Review it where its
// review is open, send it back or leave a note for the agent at work on it, or trace its lineage.
// The canvas steers and never records a verdict: decisions stay in the review room.
import "../test/flow.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import { parseStatus, type ProjectView } from "../../shared/project.ts";
import type { ChatView, DramaView, EpisodeRow, ReviewSummary } from "../../shared/types.ts";
import { storyboardReview } from "../test/fixtures.ts";
import { http, HttpResponse } from "msw";
import { accept, answer, calls, sent, server } from "../test/server.ts";
import { Canvas, PHASE_ONE } from "./Canvas.tsx";
import { href, renderAt } from "../test/router.tsx";

const fixture = (name: string) => JSON.parse(readFileSync(path.resolve("fixtures/status", `${name}.json`), "utf8"));
const lineageView = () => ({ lineage: parseLineage(JSON.parse(readFileSync(path.resolve("fixtures/lineage", "shot.json"), "utf8"))), problems: [] });

function row(state: EpisodeRow["state"]): EpisodeRow {
  return { id: "e1", number: 1, code: "EP001", title: "The stepmother arrives", state, stages: {} as EpisodeRow["stages"], spent: { total: 0, media: 0, partial: false }, updatedAt: "2026-10-30T10:00:00Z" };
}

function drama(episode: EpisodeRow["state"], setupOpen = true, status: DramaView["status"] = "production"): DramaView {
  return {
    id: "d1",
    title: "The Stepmother",
    status,
    crew: [
      {
        id: "c1",
        label: "Computer 1",
        state: "running",
        idleTimeoutMinutes: 180,
        sessions: [
          { id: "s0", name: "Setup", role: "setup", state: setupOpen ? "open" : "closed", waiting: false },
          { id: "s1", name: "EP001", role: "episode", episode: "EP001", state: episode === "working" ? "open" : "closed", waiting: false },
        ],
      },
    ],
    episodeRows: [row(episode)],
  } as unknown as DramaView;
}

function project(): ProjectView {
  const { budget: _budget, ...state } = parseStatus(fixture("boards"));
  return { state, sessions: [], problems: [], names: parseBibleNames(fixture("bible")) };
}

function engine(queue: ReviewSummary[] = [], sends: ChatView["sends"] = "steer", reviewId?: string) {
  for (const id of ["s0", "s1"]) answer(`/api/sessions/${id}/chat`, { sessionId: id, label: id === "s1" ? "EP001" : "", sends, ...(reviewId ? { reviewId } : {}), messages: [] });
  answer("/api/dramas/d1/project", project());
  answer("/api/dramas/d1/files", []);
  answer("/api/dramas/d1/lineage", lineageView());
  answer("/api/dramas/d1/canvas/EP001", { positions: {} });
  answer("/api/dramas/d1/canvas/EP002", { positions: {} });
  answer("/api/dramas/d1/assets", {});
  answer("/api/reviews", queue);
  accept("/api/sessions/s0/chat");
  accept("/api/sessions/s1/chat");
  accept("/api/episodes/e1/resume");
}

const openLooks: ReviewSummary = { id: "r9", dramaId: "d1", dramaTitle: "The Stepmother", kind: "looks", state: "open", question: "Ready.", items: 1, subjects: ["Lin Xiaoyu"], createdAt: "2026-10-30T10:00:00Z" };

/** React Flow's pane (its renderer, which it measures) at a laptop's board size: jsdom lays nothing out, and the shim gives a 100%-wide element 100 px. For the tests that fit a node in it. */
function boardOfSize(width: number, height: number) {
  const proto = HTMLElement.prototype;
  const was = { w: Object.getOwnPropertyDescriptor(proto, "offsetWidth")!, h: Object.getOwnPropertyDescriptor(proto, "offsetHeight")! };
  Object.defineProperties(proto, {
    offsetWidth: { get(this: HTMLElement) { return this.classList.contains("react-flow__renderer") ? width : was.w.get!.call(this); }, configurable: true },
    offsetHeight: { get(this: HTMLElement) { return this.classList.contains("react-flow__renderer") ? height : was.h.get!.call(this); }, configurable: true },
  });
  return () => Object.defineProperties(proto, { offsetWidth: was.w, offsetHeight: was.h });
}

async function pick(name: RegExp) {
  const user = userEvent.setup();
  // Picked from the keyboard: a mouse press on a node starts React Flow's drag, which jsdom can't drive.
  (await screen.findByRole("button", { name })).focus();
  await user.keyboard("{Enter}");
  // The bar's buttons and, under them, what a send-back or note asks for.
  return { user, bar: (await screen.findByRole("toolbar", { name: /^Steer/ })).closest(".ds-steer") as HTMLElement };
}

describe("the SteerBar", () => {
  it("offers Review only where the item's review is open, at that item", async () => {
    engine([openLooks]);
    answer("/api/reviews/r9", { ...storyboardReview(), id: "r9", kind: "looks", episode: undefined, reviewItems: [{ key: "lin", label: "lin", files: [] }], otherFiles: [] });
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { bar } = await pick(/^林/);
    expect(await within(bar).findByRole("link", { name: "Review" })).toHaveAttribute("href", "/r/r9?key=lin");
  });

  it("offers no Review where no review holds the item", async () => {
    engine();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { bar } = await pick(/^林/);
    expect(within(bar).queryByRole("link", { name: "Review" })).toBeNull();
  });

  it("offers no Review where the open review holds other items", async () => {
    engine([openLooks]);
    answer("/api/reviews/r9", { ...storyboardReview(), id: "r9", kind: "looks", episode: undefined, reviewItems: [{ key: "wei", label: "wei", files: [] }], otherFiles: [] });
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { bar } = await pick(/^林/);
    expect(await within(bar).findByRole("button", { name: "Send back" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(bar).queryByRole("link", { name: "Review" })).toBeNull();
  });

  it("sends a reasoned send-back to the agent at work, naming the item as the bible does", async () => {
    engine();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, bar } = await pick(/^林/);
    await user.click(within(bar).getByRole("button", { name: "Send back" }));
    const send = within(bar).getByRole("button", { name: "Send to the agent" });
    expect(send).toBeDisabled();
    await user.type(within(bar).getByRole("textbox", { name: "Why it goes back" }), "She should look older.");
    await user.click(send);
    const posted = calls("POST", "/api/sessions/s0/chat");
    expect(posted).toHaveLength(1);
    const text = (posted[0].body as { text: string }).text;
    expect(text).toBe("Please redo 林's look: She should look older.");
    expect(text).not.toMatch(/\blin\b|assets\/|\//);
  });

  it("sends a note on a segment to its episode's agent, by episode and segment number", async () => {
    engine();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, bar } = await pick(/^Storyboard · line-art/);
    await user.click(within(bar).getByRole("button", { name: "Note" }));
    await user.type(within(bar).getByRole("textbox", { name: "Your note" }), "Keep the lamp lit.");
    await user.click(within(bar).getByRole("button", { name: "Send to the agent" }));
    expect((calls("POST", "/api/sessions/s1/chat")[0].body as { text: string }).text).toBe("A note on segment 1 of EP001 (x): Keep the lamp lit.");
  });

  it("sends back an item under review in its review room, not to the agent", async () => {
    engine([openLooks]);
    answer("/api/reviews/r9", { ...storyboardReview(), id: "r9", kind: "looks", episode: undefined, reviewItems: [{ key: "lin", label: "lin", files: [] }], otherFiles: [] });
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { bar } = await pick(/^林/);
    expect(await within(bar).findByRole("link", { name: "Send back in its review" })).toHaveAttribute("href", "/r/r9?key=lin");
    expect(within(bar).queryByRole("button", { name: "Send back" })).toBeNull();
  });

  it("says plainly when the item's agent isn't running, and offers Resume, never queueing the words", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<Canvas drama={drama("stopped")} />, "/d/d1/canvas");
    const { bar } = await pick(/^Storyboard · line-art/);
    await user.click(within(bar).getByRole("button", { name: "Send back" }));
    expect(within(bar).getByText(/EP001's agent isn't running: Its Computer stopped/)).toBeInTheDocument();
    expect(within(bar).queryByRole("textbox")).toBeNull();
    await user.click(within(bar).getByRole("button", { name: "Resume EP001" }));
    expect(calls("POST", "/api/episodes/e1/resume")).toHaveLength(1);
    expect(sent.filter((request) => request.path.endsWith("/chat"))).toEqual([]);
  });

  it("says so when an episode waits in line, with nothing to resume", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<Canvas drama={drama("queued")} />, "/d/d1/canvas");
    const { bar } = await pick(/^Storyboard · line-art/);
    await user.click(within(bar).getByRole("button", { name: "Note" }));
    expect(within(bar).getByText(/EP001's agent isn't running: In line/)).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /^Resume/ })).toBeNull();
  });

  it("sends nothing while the agent waits on a review, and points to that review", async () => {
    const user = userEvent.setup();
    engine([], "review", "r5");
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { bar } = await pick(/^Storyboard · line-art/);
    await user.click(within(bar).getByRole("button", { name: "Note" }));
    expect(await within(bar).findByText(/EP001's agent waits on your review/)).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Open the review it waits on" })).toHaveAttribute("href", "/r/r5");
    expect(within(bar).queryByRole("textbox")).toBeNull();
    expect(sent.filter((request) => request.method === "POST")).toEqual([]);
  });

  it("sends nothing while the agent waits on an answer", async () => {
    const user = userEvent.setup();
    engine([], "answer");
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { bar } = await pick(/^林/);
    await user.click(within(bar).getByRole("button", { name: "Send back" }));
    expect(await within(bar).findByText(/The setup's agent waits on your answer/)).toBeInTheDocument();
    expect(within(bar).queryByRole("textbox")).toBeNull();
  });

  it("opens the item's lineage on its home", async () => {
    engine();
    const { router } = await renderAt(<Canvas drama={drama("working")} />, "/d/d1/e/EP001/canvas");
    const { user, bar } = await pick(/^林/);
    // The pick is in the URL, so Back from Lineage returns to it (Codex round 3, fix 3).
    await waitFor(() => expect(href(router)).toBe("/d/d1/e/EP001/canvas?item=assets%2Fcharacters%2Flin"));
    await user.click(within(bar).getByRole("button", { name: "Lineage" }));
    // Lineage centred on the item's stage, drama-cli's folder (a board id such as character:lin isn't a stage Graph has), on its home.
    await waitFor(() => expect(href(router)).toBe("/d/d1/assets/characters/lin?view=lineage"));
  });

  it("never records a verdict", async () => {
    engine([openLooks]);
    answer("/api/reviews/r9", { ...storyboardReview(), id: "r9", kind: "looks", episode: undefined, reviewItems: [{ key: "lin", label: "lin", files: [] }], otherFiles: [] });
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, bar } = await pick(/^林/);
    await within(bar).findByRole("link", { name: "Review" });
    await user.click(within(await screen.findByRole("region", { name: /what it is made from/ })).getByRole("button", { name: "Close" }));
    expect(sent.filter((request) => request.method === "POST" && /\/decision$/.test(request.path))).toEqual([]);
    expect(screen.queryByRole("button", { name: /^(Accept|Approve)/ })).toBeNull();
  });
});

describe("a picked item's hand actions and panel (P6.8)", () => {
  const breakdown = { id: 7, name: "breakdown.md", path: "/work/drama/episodes/EP001/breakdown/v1/breakdown.md", type: "text/markdown", size: 1, kind: "breakdown", episode: "EP001", url: "/f/7?v=1", createdAt: "2026-10-30T10:00:00Z" };
  const sheet = { id: 8, name: "image-1.png", path: "/work/drama/episodes/EP001/multi_panel_storyboard/seg01/line-art/v1/image-1.png", type: "image/png", size: 1, kind: "storyboard", url: "/f/8?v=1", createdAt: "2026-10-30T10:00:00Z" };

  function withBreakdown() {
    engine();
    answer("/api/dramas/d1/files", [breakdown, sheet]);
    server.use(http.get("/f/7", () => HttpResponse.text("# EP001\n\n## seg01\n- Shot 1 (wide · static · 4s) 林 walks into the 办公室.\n- Shot 2 (close · 3s) She stops.\n\n## seg02\n- Shot 1 (wide) Elsewhere.")));
  }


  const folder = "/work/drama/episodes/EP001/multi_panel_storyboard/seg01/line-art/v1";
  const look = { id: 9, name: "image-1.png", path: "/work/drama/assets/characters/lin/v1/image-1.jpg", type: "image/png", size: 1, kind: "look", url: "/f/9?v=1", createdAt: "2026-10-30T09:00:00Z" };
  const spec = { id: 10, name: "spec.json", path: `${folder}/spec.json`, type: "application/json", size: 1, kind: "spec", url: "/f/10?v=1", createdAt: "2026-10-30T10:00:00Z" };
  const request = { id: 11, name: "request.json", path: `${folder}/request.json`, type: "application/json", size: 1, kind: "request", url: "/f/11?v=1", createdAt: "2026-10-30T10:00:00Z" };

  function withSpec() {
    withBreakdown();
    answer("/api/dramas/d1/files", [breakdown, sheet, look, spec, request]);
    const content = [
      { type: "text", text: "Image 1: 林's look.\nShe walks in, as in Image 1, past Image 2." },
      { type: "image_url", image_url: { url: "@/Users/maker/drama/assets/characters/lin/v1/image-1.jpg" }, role: "reference_image" },
      { type: "image_url", image_url: { url: "asset://asset-1" }, role: "reference_image" },
      // As drama-cli writes a project picture today: relative to the project.
      { type: "image_url", image_url: { url: "@assets/characters/lin/v1/image-1.jpg" }, role: "reference_image" },
    ];
    server.use(http.get("/f/10", () => HttpResponse.text(JSON.stringify({ model: "sd25", content, duration: 12, ratio: "9:16", resolution: "480p", seed: 42 }))));
    server.use(http.get("/f/11", () => HttpResponse.text(JSON.stringify({ model: "sd25", content, duration: 12 }))));
  }

  async function panelOf(name: RegExp, part?: "Prompt") {
    const picked = await pick(name);
    const panel = await screen.findByRole("region", { name: /what it is made from/ });
    // The prompt, versions, request and details open on demand (IA §15).
    if (part) await picked.user.click(within(panel).getByRole("button", { name: part }));
    return { ...picked, panel };
  }

  it("shows the picture an asset-library id stands for, once drama-cli's record of it has come back", async () => {
    withSpec();
    answer("/api/dramas/d1/assets", { "asset-1": look });
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { panel } = await panelOf(/^Storyboard · line-art/, "Prompt");
    // Image 2 is asset://asset-1: in the words and among the numbered pictures.
    await waitFor(() => expect(panel.querySelectorAll(".prompt .pchip")[2].querySelector("img")).toHaveAttribute("src", "/f/9?v=1"));
    expect(panel.querySelector(".refs li:nth-child(2) img")).toHaveAttribute("src", "/f/9?v=1");
  });

  it("labels a node with the model its spec.json names, and with none where no spec came back", async () => {
    withSpec();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const board = (await screen.findByRole("button", { name: /^Storyboard · line-art/ })).closest(".cnode")!;
    await waitFor(() => expect(board.querySelector(".lab .model")).toHaveTextContent("sd25"));
    const lin = screen.getByRole("button", { name: /^林/ }).closest(".cnode")!;
    expect(lin.querySelector(".lab .model")).toBeNull();
  });

  it("shows the prompt drama-cli sent, each Image N as a chip with the picture it names", async () => {
    withSpec();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { panel } = await panelOf(/^Storyboard · line-art/, "Prompt");
    await waitFor(() => expect(within(panel).getByRole("region", { name: /^(Prompt|Versions|Request|Details)$/ }).textContent).toContain("She walks in, as in Image 1, past Image 2."));
    const chips = [...panel.querySelectorAll(".prompt .pchip")];
    expect(chips.map((chip) => chip.textContent)).toEqual(["Image 1", "Image 1", "Image 2"]);
    // A picture sent from the project is the returned file at that path; one from the asset library has none until its record comes back.
    expect(chips[0].querySelector("img")).toHaveAttribute("src", "/f/9?v=1");
    expect(chips[2].querySelector("img")).toBeNull();
    // Above the prompt, the pictures it names, numbered as its Image N; one from the asset library keeps its number with no picture.
    expect([...panel.querySelectorAll(".refs li b")].map((number) => number.textContent)).toEqual(["1", "2", "3"]);
    expect(panel.querySelector(".refs li:nth-child(3) img")).toHaveAttribute("src", "/f/9?v=1");
    expect(panel.querySelector(".refs li:nth-child(2) .none")).not.toBeNull();
  });

  it("shows a look's prompt and model too", async () => {
    engine();
    const lookSpec = { ...spec, id: 12, path: "/work/drama/assets/characters/lin/v1/spec.json", url: "/f/12?v=1" };
    answer("/api/dramas/d1/files", [look, lookSpec]);
    server.use(http.get("/f/12", () => HttpResponse.text(JSON.stringify({ provider: "openai", model: "gpt-image-2", prompt: "A full-body turnaround of 林.", aspect_ratio: "16:9", size: "2K" }))));
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { panel } = await panelOf(/^林/, "Prompt");
    await waitFor(() => expect(within(panel).getByRole("region", { name: /^(Prompt|Versions|Request|Details)$/ })).toHaveTextContent("A full-body turnaround of 林."));
    expect([...panel.querySelectorAll(".nfoot .pill")].map((pill) => pill.textContent)).toEqual(["gpt-image-2", "16:9 · 2K"]);
  });

  it("lists the settings the spec states as the panel's pills, and nothing it doesn't", async () => {
    withSpec();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { panel } = await panelOf(/^Storyboard · line-art/, "Prompt");
    await waitFor(() => expect([...panel.querySelectorAll(".nfoot .pill")].map((pill) => pill.textContent)).toEqual(["sd25", "9:16 · 480p · 12s · seed 42"]));
  });

  it("shows the request as a JSON tree", async () => {
    withSpec();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, panel } = await panelOf(/^Storyboard · line-art/);
    await user.click(within(panel).getByRole("button", { name: "Request" }));
    expect(await within(panel).findByRole("tree", { name: "Request" })).toHaveTextContent(/"sd25"/);
  });

  it("says so until the agent returns the version's spec", async () => {
    withBreakdown();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { panel } = await panelOf(/^Storyboard · line-art/, "Prompt");
    expect(within(panel).getByRole("region", { name: /^(Prompt|Versions|Request|Details)$/ })).toHaveTextContent("The agent hasn't returned this version's spec.json and request.json.");
  });

  it("says why a version is stale in drama-cli's own words, and adds no Why where nothing is wrong", async () => {
    withBreakdown();
    const view = lineageView();
    view.lineage.nodes.find((node) => node.id === "assets/characters/lin")!.problems = ["Changed file: bible/v1/bible.json"];
    answer("/api/dramas/d1/lineage", view);
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, panel } = await panelOf(/^林/);
    // In the panel's state line, shown by default (IA §15): it is what the maker needs to know.
    expect(panel.querySelector(".nstate .why")).toHaveTextContent("Changed file: bible/v1/bible.json");
    await user.keyboard("{Escape}");
    const take = await panelOf(/^Take · t01/);
    expect(take.panel.querySelector(".nstate .why")).toBeNull();
  });

  it("says what drama-cli's lineage made it from and what uses it, in the panel's Details", async () => {
    withBreakdown();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, panel } = await panelOf(/^Take · t01/);
    await user.click(within(panel).getByRole("button", { name: "Details" }));
    expect(within(panel).getByRole("region", { name: /^(Prompt|Versions|Request|Details)$/ })).toHaveTextContent(/Used by—Reads.*Storyboard · line-art · v1.*林/);
  });

  it("lists a look's versions from its cast card, newest first, each with what the maker decided", async () => {
    withSpec();
    answer("/api/dramas/d1/cast", [{ kind: "look", subject: "lin", episodes: [], looks: [{ look: "base", versions: [
      { turnId: "u1", files: [{ ...look, version: "v1" }], review: { reviewId: "r1", kind: "looks", state: "answered", verdict: "revise", notes: [{ text: "Older, please." }] } },
      { turnId: "u2", files: [{ ...look, version: "v2" }], review: { reviewId: "r2", kind: "looks", state: "answered", verdict: "approve", notes: [] } },
    ] }] }]);
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, panel } = await panelOf(/^林/);
    await user.click(within(panel).getByRole("button", { name: "Versions" }));
    await waitFor(() => expect(panel.querySelectorAll(".versions > li")).toHaveLength(2));
    const [newest, older] = [...panel.querySelectorAll(".versions > li")];
    expect(newest).toHaveTextContent(/Version · v2.*Approved/);
    expect(older).toHaveTextContent(/Version · v1.*Sent back.*Older, please\./);
  });

  it("lists the segment's versions, each with what the maker decided", async () => {
    withBreakdown();
    answer("/api/dramas/d1/episodes/EP001", { segments: [{ key: "seg01", boards: [{ turnId: "u1", files: [{ ...sheet, version: "v1", style: "line-art" }], review: { reviewId: "r1", kind: "storyboards", state: "answered", verdict: "revise", notes: [{ text: "Brighter lamp." }] } }], stills: [], takes: [] }] });
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, panel } = await panelOf(/^Storyboard · line-art/);
    await user.click(within(panel).getByRole("button", { name: "Versions" }));
    await waitFor(() => expect(panel.querySelector(".versions > li")).not.toBeNull());
    const version = panel.querySelector(".versions > li")!;
    expect(version).toHaveTextContent("Version · v1");
    expect(version).toHaveTextContent("Sent back");
    expect(version).toHaveTextContent("Brighter lamp.");
  });

  it("lists each stage's own versions only, never another stage's of the same segment", async () => {
    withBreakdown();
    const of = (turnId: string, kind: string, version: string, style?: string) => ({ turnId, files: [{ ...sheet, id: Number(turnId.slice(1)) + 100, kind, version, ...(style ? { style } : {}) }] });
    answer("/api/dramas/d1/episodes/EP001", {
      segments: [
        {
          key: "seg01",
          boards: [of("u1", "storyboard", "v2", "line-art"), of("u2", "storyboard", "v1", "photoreal"), of("u3", "storyboard", "v1", "line-art")],
          stills: [of("u4", "blocking", "v1"), of("u5", "frame", "v1")],
          takes: [of("u6", "take", "t02"), of("u7", "take", "t01")],
        },
      ],
    });
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const versionsOf = async (name: RegExp) => {
      const { user, panel } = await panelOf(name);
      await user.click(within(panel).getByRole("button", { name: "Versions" }));
      await waitFor(() => expect(panel.querySelector(".versions")).not.toBeNull());
      const rows = [...panel.querySelectorAll(".versions > li b")].map((row) => row.textContent);
      await user.keyboard("{Escape}");
      return rows;
    };
    expect(await versionsOf(/^Blocking · v1/)).toEqual(["Version · v1"]);
    expect(await versionsOf(/^First frame · v1/)).toEqual(["Version · v1"]);
    expect(await versionsOf(/^Storyboard · line-art/)).toEqual(["Version · v2", "Version · v1"]);
    expect(await versionsOf(/^Take · t01/)).toEqual(["Version · t02", "Version · t01"]);
  });

  it("places the picked node's bar inside the board's visible area, under the pills, and again after a dock", async () => {
    withBreakdown();
    const restore = boardOfSize(1000, 900);
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/e/EP001/canvas");
    // React Flow writes the viewport and each node's absolute place on the page, and measures its pane as the page lays it out.
    const translate = (element: Element) => (element as HTMLElement).style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)(?:\s*scale\(([\d.]+)\))?/)!.slice(1).map(Number);
    const screen = () => {
      const [vx, vy, zoom] = translate(document.querySelector(".react-flow__viewport")!);
      const node = document.querySelector('.react-flow__node[data-id="episodes/EP001/segments/seg01"]')!;
      const [x, y] = translate(node);
      return { left: x * zoom + vx, top: y * zoom + vy, width: (node as HTMLElement).offsetWidth * zoom };
    };
    const { user, panel } = await panelOf(/^Take · t01/);
    const pane = (document.querySelector(".react-flow__renderer") as HTMLElement).offsetWidth;
    // The bar (56 px) stands above the node, and its top is never above the pills' 64 px.
    await waitFor(() => {
      const under = screen();
      expect(under.left + under.width / 2).toBeCloseTo(pane / 2, 0);
      expect(under.top - 56).toBeGreaterThanOrEqual(64);
    });
    await user.click(within(panel).getByRole("button", { name: "Dock right" }));
    // Docked, the node is centred in what the docked panel (420 px) leaves of the board.
    await waitFor(() => expect(screen().left + screen().width / 2).toBeCloseTo((pane - 420) / 2, 0));
    expect(screen().top - 56).toBeGreaterThanOrEqual(64);
    localStorage.removeItem("studio.canvas.dock");
    restore();
  });

  it("zooms a picked node to a readable size, and back to where the board was on Escape (D37)", async () => {
    withBreakdown();
    const restore = boardOfSize(1000, 900);
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/e/EP001/canvas");
    const zoom = () => Number((document.querySelector(".react-flow__viewport") as HTMLElement).style.transform.match(/scale\(([\d.]+)\)/)![1]);
    await waitFor(() => expect(zoom()).toBeCloseTo(0.55, 2));
    const { user } = await panelOf(/^Take · t01/);
    await waitFor(() => expect(zoom()).toBeGreaterThan(0.55));
    expect(zoom()).toBeLessThanOrEqual(1.5);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(zoom()).toBeCloseTo(0.55, 2));
    restore();
  });

  it("plays a take on its node: media-chrome's bar on hover and on the picked node, in the editors' order, muted (D39)", async () => {
    engine();
    const take = { id: 30, name: "video.mp4", path: "/work/drama/episodes/EP001/segments/seg01/t01/video.mp4", type: "video/mp4", size: 1, kind: "take", url: "/f/30?v=1", createdAt: "2026-10-30T10:00:00Z" };
    answer("/api/dramas/d1/files", [take]);
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/e/EP001/canvas");
    const node = () => screen.getByRole("button", { name: /^Take · t01/ }).closest(".cnode")!;
    await waitFor(() => expect(node().querySelector("video")).not.toBeNull());
    expect(node().querySelector("video")!.muted).toBe(true);
    expect(node().querySelector(".vbar")).toBeNull();
    const user = userEvent.setup();
    await user.hover(node().querySelector(".card")!);
    expect(node().querySelector(".vbar")).not.toBeNull();
    await user.unhover(node().querySelector(".card")!);
    expect(node().querySelector(".vbar")).toBeNull();
    await pick(/^Take · t01/);
    const bar = node().querySelector(".vbar")!;
    expect([...bar.children].map((part) => part.tagName.toLowerCase())).toEqual(["media-play-button", "media-time-display", "media-time-range", "media-duration-display", "media-mute-button", "media-fullscreen-button"]);
  });

  it("shows each node's picture or video whole, at the file's own ratio and size, as liblib's nodes do", async () => {
    engine();
    const take = { id: 30, name: "video.mp4", path: "/work/drama/episodes/EP001/segments/seg01/t01/video.mp4", type: "video/mp4", size: 1, kind: "take", url: "/f/30?v=1", createdAt: "2026-10-30T10:00:00Z" };
    answer("/api/dramas/d1/files", [look, take]);
    // The design's and the canvas's own rules, as the page applies them (jsdom computes styles from the sheets it has).
    const sheet = document.createElement("style");
    sheet.textContent = ["design/studio.css", "src/ui/screens/canvas.css"].map((file) => readFileSync(path.resolve(file), "utf8")).join("\n");
    document.head.append(sheet);
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/e/EP001/canvas");
    const node = (name: RegExp) => screen.getByRole("button", { name }).closest(".react-flow__node") as HTMLElement;
    await waitFor(() => expect(node(/^Take · t01/).querySelector("video")).not.toBeNull());
    // A look sheet loads at 2048 × 1152, the take at 720 × 1280 (jsdom loads neither, so each says its size as a browser would).
    const picture = node(/^林/).querySelector("img")!;
    Object.defineProperties(picture, { naturalWidth: { value: 2048 }, naturalHeight: { value: 1152 } });
    fireEvent.load(picture);
    const video = node(/^Take · t01/).querySelector("video")!;
    Object.defineProperties(video, { videoWidth: { value: 720 }, videoHeight: { value: 1280 } });
    fireEvent.loadedMetadata(video);
    await waitFor(() => expect(node(/^林/).querySelector(".dims")).toHaveTextContent("2048 × 1152"));
    expect(getComputedStyle(node(/^林/).querySelector(".card")!).aspectRatio).toBe("2048 / 1152");
    expect(getComputedStyle(node(/^Take · t01/).querySelector(".card")!).aspectRatio).toBe("720 / 1280");
    // drama-cli's width, the height the file's ratio gives under the label: a wide sheet is short, a vertical take tall.
    expect(node(/^林/).style.height).toBe(`${28 + Math.round((300 * 1152) / 2048)}px`);
    expect(node(/^Take · t01/).style.height).toBe(`${28 + Math.round((300 * 1280) / 720)}px`);
    expect(getComputedStyle(picture).objectFit).toBe("contain");
    expect(getComputedStyle(video).objectFit).toBe("contain");
    sheet.remove();
  });

  it("says when the versions can't be read, rather than that there are none", async () => {
    withBreakdown();
    server.use(http.get("/api/dramas/d1/episodes/EP001", () => HttpResponse.json({ code: "internal", error: "boom" }, { status: 500 })));
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, panel } = await panelOf(/^Take · t01/);
    await user.click(within(panel).getByRole("button", { name: "Versions" }));
    expect(await within(panel).findByText("The versions couldn't be read. Try again in a moment.")).toBeInTheDocument();
    expect(within(panel).queryByText("No version returned yet.")).toBeNull();
  });

  it("says by default where the version stands and what needs the maker, and opens the rest on demand (IA §15)", async () => {
    withBreakdown();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, panel } = await panelOf(/^Storyboard · line-art/);
    expect(panel.querySelector(".nstate")).toHaveTextContent("current v1");
    expect(within(panel).queryByRole("region", { name: /^(Prompt|Versions|Request|Details)$/ })).toBeNull();
    await user.click(within(panel).getByRole("button", { name: "Details" }));
    expect(within(panel).getByRole("button", { name: "Details" })).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByRole("region", { name: "Details" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Details" }));
    expect(within(panel).queryByRole("region", { name: "Details" })).toBeNull();
  });

  it("lands on the version a link names, with its panel on that version and its picture (Codex round 3, fix 3)", async () => {
    engine();
    const older = { ...sheet, id: 20, path: sheet.path.replace("/v1/", "/v0/"), url: "/f/20?v=1" };
    const view = lineageView();
    const board = view.lineage.nodes.find((node) => node.kind === "storyboard")!;
    answer("/api/dramas/d1/files", [breakdown, { ...sheet, path: sheet.path.replace("/v1/", "/v2/") }, older]);
    board.version = "v2";
    board.accepted = "v2";
    board.shows = board.shows!.replace("/v1/", "/v2/");
    answer("/api/dramas/d1/lineage", view);
    await renderAt(<Canvas drama={drama("working")} />, `/d/d1/e/EP001/canvas?item=${encodeURIComponent(board.id)}&version=v0`);
    const panel = await screen.findByRole("region", { name: /what it is made from/ });
    expect(panel.querySelector(".nstate")).toHaveTextContent("v0, the current is v2 · accepted v2");
    const bar = (await screen.findByRole("toolbar", { name: /^Steer/ })).closest(".ds-steer") as HTMLElement;
    expect(within(bar).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/f/20?v=1&download=1");
  });

  it("offers the hand actions disabled, saying why, and they do nothing", async () => {
    withBreakdown();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user, bar } = await pick(/^Storyboard · line-art/);
    const panel = await screen.findByRole("region", { name: /what it is made from/ });
    // They stand with what opens on demand, under the prompt, versions, request or details (IA §15).
    await user.click(within(panel).getByRole("button", { name: "Prompt" }));
    for (const button of [within(panel).getByRole("button", { name: "Generate" }), within(panel).getByRole("button", { name: "Upload" })]) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(/^Phase 2/);
    }
    expect([PHASE_ONE.generate("x"), PHASE_ONE.upload("x")]).toEqual([undefined, undefined]);
    expect(sent.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("downloads the item's picture from its bar", async () => {
    withBreakdown();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { bar } = await pick(/^Storyboard · line-art/);
    expect(within(bar).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/f/8?v=1&download=1");
  });

  it("moves the minimap aside while a panel is open under its node", async () => {
    withBreakdown();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    expect(await screen.findByRole("img", { name: "Minimap: move the view" })).toBeInTheDocument();
    await panelOf(/^Storyboard · line-art/);
    expect(screen.queryByRole("img", { name: "Minimap: move the view" })).toBeNull();
  });

  it("opens the panel under the node, or docked right on asking, and keeps the maker's choice", async () => {
    withBreakdown();
    const { unmount } = await renderAt(<Canvas drama={drama("working")} />, "/d/d1/e/EP001/canvas");
    const { user, panel } = await panelOf(/^Storyboard · line-art/);
    expect(panel.closest(".react-flow__node-toolbar")).not.toBeNull();
    await user.click(within(panel).getByRole("button", { name: "Dock right" }));
    const docked = await screen.findByRole("region", { name: /what it is made from/ });
    expect(docked).toHaveClass("docked");
    expect(docked.closest(".react-flow__node-toolbar")).toBeNull();
    expect(localStorage.getItem("studio.canvas.dock")).toBe("right");
    unmount();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/e/EP001/canvas");
    await pick(/^Storyboard · line-art/);
    expect(await screen.findByRole("region", { name: /what it is made from/ })).toHaveClass("docked");
    localStorage.removeItem("studio.canvas.dock");
  });

  it("lets go of the item on Escape, with its bar and panel", async () => {
    withBreakdown();
    await renderAt(<Canvas drama={drama("working")} />, "/d/d1/canvas");
    const { user } = await pick(/^Storyboard · line-art/);
    await screen.findByRole("region", { name: /what it is made from/ });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("region", { name: /what it is made from/ })).toBeNull());
    expect(screen.queryByRole("toolbar", { name: /^Steer/ })).toBeNull();
  });
});
