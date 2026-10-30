// The canvas's SteerBar (P6.3), used as a maker uses it: pick an item, then Review it where its
// review is open, send it back or leave a note for the agent at work on it, or trace its lineage.
// The canvas steers and never records a verdict: decisions stay in the review room.
import "../test/flow.ts";
import { render, screen, waitFor, within } from "@testing-library/react";
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

function engine(inbox: ReviewSummary[] = [], sends: ChatView["sends"] = "steer", reviewId?: string) {
  for (const id of ["s0", "s1"]) answer(`/api/sessions/${id}/chat`, { sessionId: id, label: id === "s1" ? "EP001" : "", sends, ...(reviewId ? { reviewId } : {}), messages: [] });
  answer("/api/dramas/d1/project", project());
  answer("/api/dramas/d1/files", []);
  answer("/api/dramas/d1/lineage", lineageView());
  answer("/api/dramas/d1/canvas/EP001", { positions: {} });
  answer("/api/dramas/d1/canvas/EP002", { positions: {} });
  answer("/api/inbox", inbox);
  accept("/api/sessions/s0/chat");
  accept("/api/sessions/s1/chat");
  accept("/api/episodes/e1/resume");
}

const openLooks: ReviewSummary = { id: "r9", dramaId: "d1", dramaTitle: "The Stepmother", kind: "looks", state: "open", question: "Ready.", items: 1, createdAt: "2026-10-30T10:00:00Z" };

async function pick(name: RegExp) {
  const user = userEvent.setup();
  // Picked from the keyboard: a mouse press on a node starts React Flow's drag, which jsdom can't drive.
  (await screen.findByRole("button", { name })).focus();
  await user.keyboard("{Enter}");
  return { user, bar: await screen.findByRole("toolbar", { name: /^Steer/ }) };
}

describe("the SteerBar", () => {
  it("offers Review only where the item's review is open, at that item", async () => {
    engine([openLooks]);
    answer("/api/reviews/r9", { ...storyboardReview(), id: "r9", kind: "looks", episode: undefined, reviewItems: [{ key: "lin", label: "lin", files: [] }], otherFiles: [] });
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^林/);
    expect(await within(bar).findByRole("link", { name: "Review" })).toHaveAttribute("href", "/r/r9?item=lin");
  });

  it("offers no Review where no review holds the item", async () => {
    engine();
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^林/);
    expect(within(bar).queryByRole("link", { name: "Review" })).toBeNull();
  });

  it("offers no Review where the open review holds other items", async () => {
    engine([openLooks]);
    answer("/api/reviews/r9", { ...storyboardReview(), id: "r9", kind: "looks", episode: undefined, reviewItems: [{ key: "wei", label: "wei", files: [] }], otherFiles: [] });
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^林/);
    expect(await within(bar).findByRole("button", { name: "Send back" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(bar).queryByRole("link", { name: "Review" })).toBeNull();
  });

  it("sends a reasoned send-back to the agent at work, naming the item as the bible does", async () => {
    engine();
    render(<Canvas drama={drama("working")} />);
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
    render(<Canvas drama={drama("working")} />);
    const { user, bar } = await pick(/^Seg 1-1 · /);
    await user.click(within(bar).getByRole("button", { name: "Note" }));
    await user.type(within(bar).getByRole("textbox", { name: "Your note" }), "Keep the lamp lit.");
    await user.click(within(bar).getByRole("button", { name: "Send to the agent" }));
    expect((calls("POST", "/api/sessions/s1/chat")[0].body as { text: string }).text).toBe("A note on segment 1 of EP001 (x): Keep the lamp lit.");
  });

  it("sends back an item under review in its review room, not to the agent", async () => {
    engine([openLooks]);
    answer("/api/reviews/r9", { ...storyboardReview(), id: "r9", kind: "looks", episode: undefined, reviewItems: [{ key: "lin", label: "lin", files: [] }], otherFiles: [] });
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^林/);
    expect(await within(bar).findByRole("link", { name: "Send back in its review" })).toHaveAttribute("href", "/r/r9?item=lin");
    expect(within(bar).queryByRole("button", { name: "Send back" })).toBeNull();
  });

  it("says plainly when the item's agent isn't running, and offers Resume, never queueing the words", async () => {
    const user = userEvent.setup();
    engine();
    render(<Canvas drama={drama("stopped")} />);
    const { bar } = await pick(/^Seg 1-1 · /);
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
    render(<Canvas drama={drama("queued")} />);
    const { bar } = await pick(/^Seg 1-1 · /);
    await user.click(within(bar).getByRole("button", { name: "Note" }));
    expect(within(bar).getByText(/EP001's agent isn't running: In line/)).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /^Resume/ })).toBeNull();
  });

  it("sends nothing while the agent waits on a review, and points to that review", async () => {
    const user = userEvent.setup();
    engine([], "review", "r5");
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^Seg 1-1 · /);
    await user.click(within(bar).getByRole("button", { name: "Note" }));
    expect(await within(bar).findByText(/EP001's agent waits on your review/)).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Open the review it waits on" })).toHaveAttribute("href", "/r/r5");
    expect(within(bar).queryByRole("textbox")).toBeNull();
    expect(sent.filter((request) => request.method === "POST")).toEqual([]);
  });

  it("sends nothing while the agent waits on an answer", async () => {
    const user = userEvent.setup();
    engine([], "answer");
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^林/);
    await user.click(within(bar).getByRole("button", { name: "Send back" }));
    expect(await within(bar).findByText(/The setup's agent waits on your answer/)).toBeInTheDocument();
    expect(within(bar).queryByRole("textbox")).toBeNull();
  });

  it("opens the item's lineage in Graph", async () => {
    engine();
    render(<Canvas drama={drama("working")} />);
    const { user, bar } = await pick(/^林/);
    await user.click(within(bar).getByRole("button", { name: "Lineage" }));
    expect(location.pathname + location.search).toBe("/d/d1/graph?item=character%3Alin");
    window.history.pushState(null, "", "/");
  });

  it("never records a verdict", async () => {
    engine([openLooks]);
    answer("/api/reviews/r9", { ...storyboardReview(), id: "r9", kind: "looks", episode: undefined, reviewItems: [{ key: "lin", label: "lin", files: [] }], otherFiles: [] });
    render(<Canvas drama={drama("working")} />);
    const { user, bar } = await pick(/^林/);
    await within(bar).findByRole("link", { name: "Review" });
    await user.click(within(bar).getByRole("button", { name: "Close" }));
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

  it("shows a segment's shots from the breakdown on its card", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const card = (await screen.findByRole("button", { name: /^Seg 1-1 · / })).closest(".ds-cnode")!;
    await waitFor(() => expect(card.textContent).toContain("Shot 1 (wide · static · 4s) 林 walks into the 办公室."));
    expect(card.textContent).not.toContain("Elsewhere");
  });

  const folder = "/work/drama/episodes/EP001/multi_panel_storyboard/seg01/line-art/v1";
  const look = { id: 9, name: "image-1.png", path: "/work/drama/assets/characters/lin/v1/image-1.png", type: "image/png", size: 1, kind: "look", url: "/f/9?v=1", createdAt: "2026-10-30T09:00:00Z" };
  const spec = { id: 10, name: "spec.json", path: `${folder}/spec.json`, type: "application/json", size: 1, kind: "spec", url: "/f/10?v=1", createdAt: "2026-10-30T10:00:00Z" };
  const request = { id: 11, name: "request.json", path: `${folder}/request.json`, type: "application/json", size: 1, kind: "request", url: "/f/11?v=1", createdAt: "2026-10-30T10:00:00Z" };

  function withSpec() {
    withBreakdown();
    answer("/api/dramas/d1/files", [breakdown, sheet, look, spec, request]);
    const content = [
      { type: "text", text: "Image 1: 林's look.\nShe walks in, as in Image 1, past Image 2." },
      { type: "image_url", image_url: { url: "@/Users/maker/drama/assets/characters/lin/v1/image-1.png" }, role: "reference_image" },
      { type: "image_url", image_url: { url: "asset://asset-1" }, role: "reference_image" },
    ];
    server.use(http.get("/f/10", () => HttpResponse.text(JSON.stringify({ model: "sd25", content, duration: 12, ratio: "9:16", resolution: "480p", seed: 42 }))));
    server.use(http.get("/f/11", () => HttpResponse.text(JSON.stringify({ model: "sd25", content, duration: 12 }))));
  }

  async function panelOf(name: RegExp) {
    const picked = await pick(name);
    return { ...picked, panel: await screen.findByRole("region", { name: /what it is made from/ }) };
  }

  it("shows the prompt drama-cli sent, each Image N as a chip with the picture it names", async () => {
    withSpec();
    render(<Canvas drama={drama("working")} />);
    const { panel } = await panelOf(/^Seg 1-1 · /);
    await waitFor(() => expect(within(panel).getByRole("tabpanel").textContent).toContain("She walks in, as in Image 1, past Image 2."));
    const chips = [...panel.querySelectorAll(".prompt .chip")];
    expect(chips.map((chip) => chip.textContent)).toEqual(["Image 1", "Image 1", "Image 2"]);
    // A picture sent from the project is the returned file at that path; one from the asset library has none here.
    expect(chips[0].querySelector("img")).toHaveAttribute("src", "/f/9?v=1");
    expect(chips[2].querySelector("img")).toBeNull();
  });

  it("lists the settings the spec states, and nothing it doesn't", async () => {
    withSpec();
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^Seg 1-1 · /);
    await user.click(within(panel).getByRole("tab", { name: "Settings" }));
    await waitFor(() => expect(within(panel).getByRole("tabpanel").textContent).toBe("Modelsd25Ratio9:16Resolution480pDuration12sSeed42"));
  });

  it("shows the request as a JSON tree", async () => {
    withSpec();
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^Seg 1-1 · /);
    await user.click(within(panel).getByRole("tab", { name: "Request" }));
    expect(await within(panel).findByRole("tree", { name: "Request" })).toHaveTextContent(/"sd25"/);
  });

  it("shows the breakdown's shots until a spec comes back, and says so", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { panel } = await panelOf(/^Seg 1-1 · /);
    await waitFor(() => expect(within(panel).getByRole("tabpanel").textContent).toContain("Shot 2 (close · 3s) She stops."));
    expect(within(panel).getByRole("tabpanel").textContent).toContain("until the agent returns this version's spec.json");
  });

  it("lists what drama-cli's lineage made it from, and picks one on the board", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^Seg 1-1 · /);
    await user.click(within(panel).getByRole("tab", { name: "Made from" }));
    await user.click(within(panel).getByRole("button", { name: "lin" }));
    expect(await screen.findByRole("toolbar", { name: /林/ })).toBeInTheDocument();
  });

  it("lists the segment's versions, each with what the maker decided", async () => {
    withBreakdown();
    answer("/api/dramas/d1/episodes/EP001", { segments: [{ key: "seg01", boards: [{ turnId: "u1", files: [{ ...sheet, version: "v1" }], review: { reviewId: "r1", kind: "storyboards", state: "answered", verdict: "revise", notes: [{ text: "Brighter lamp." }] } }], stills: [], takes: [] }] });
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^Seg 1-1 · /);
    await user.click(within(panel).getByRole("tab", { name: "Versions" }));
    await waitFor(() => expect(panel.querySelector(".versions > li")).not.toBeNull());
    const version = panel.querySelector(".versions > li")!;
    expect(version).toHaveTextContent("Storyboard · v1");
    expect(version).toHaveTextContent("Sent back");
    expect(version).toHaveTextContent("Brighter lamp.");
  });

  it("offers the hand actions disabled, saying why, and they do nothing", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^Seg 1-1 · /);
    const panel = await screen.findByRole("region", { name: /what it is made from/ });
    for (const button of [within(bar).getByRole("button", { name: "Use as reference" }), within(panel).getByRole("button", { name: "Generate" }), within(panel).getByRole("button", { name: "Upload" })]) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(/^Phase 2/);
    }
    expect([PHASE_ONE.generate("x"), PHASE_ONE.upload("x"), PHASE_ONE.useAsReference("x")]).toEqual([undefined, undefined, undefined]);
    expect(sent.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("opens and downloads the item's picture", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^Seg 1-1 · /);
    expect(within(bar).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/f/8?v=1");
    expect(within(bar).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/f/8?v=1&download=1");
  });

  it("lets go of the item on Escape, with its bar and panel", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { user } = await pick(/^Seg 1-1 · /);
    await screen.findByRole("region", { name: /what it is made from/ });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("region", { name: /what it is made from/ })).toBeNull());
    expect(screen.queryByRole("toolbar", { name: /^Steer/ })).toBeNull();
  });
});
