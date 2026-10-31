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
  answer("/api/dramas/d1/assets", {});
  answer("/api/inbox", inbox);
  accept("/api/sessions/s0/chat");
  accept("/api/sessions/s1/chat");
  accept("/api/episodes/e1/resume");
}

const openLooks: ReviewSummary = { id: "r9", dramaId: "d1", dramaTitle: "The Stepmother", kind: "looks", state: "open", question: "Ready.", items: 1, subjects: ["Lin Xiaoyu"], createdAt: "2026-10-30T10:00:00Z" };

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
    const { user, bar } = await pick(/^Storyboard · line-art/);
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
    render(<Canvas drama={drama("queued")} />);
    const { bar } = await pick(/^Storyboard · line-art/);
    await user.click(within(bar).getByRole("button", { name: "Note" }));
    expect(within(bar).getByText(/EP001's agent isn't running: In line/)).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /^Resume/ })).toBeNull();
  });

  it("sends nothing while the agent waits on a review, and points to that review", async () => {
    const user = userEvent.setup();
    engine([], "review", "r5");
    render(<Canvas drama={drama("working")} />);
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
    // Graph centred on the item's stage, drama-cli's folder (a board id such as character:lin isn't a stage Graph has).
    expect(location.pathname + location.search).toBe("/d/d1/graph?item=assets%2Fcharacters%2Flin");
    window.history.pushState(null, "", "/");
  });

  it("never records a verdict", async () => {
    engine([openLooks]);
    answer("/api/reviews/r9", { ...storyboardReview(), id: "r9", kind: "looks", episode: undefined, reviewItems: [{ key: "lin", label: "lin", files: [] }], otherFiles: [] });
    render(<Canvas drama={drama("working")} />);
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

  async function panelOf(name: RegExp) {
    const picked = await pick(name);
    return { ...picked, panel: await screen.findByRole("region", { name: /what it is made from/ }) };
  }

  it("shows the picture an asset-library id stands for, once drama-cli's record of it has come back", async () => {
    withSpec();
    answer("/api/dramas/d1/assets", { "asset-1": look });
    render(<Canvas drama={drama("working")} />);
    const { panel } = await panelOf(/^Storyboard · line-art/);
    // Image 2 is asset://asset-1: in the words and among the numbered pictures.
    await waitFor(() => expect(panel.querySelectorAll(".prompt .pchip")[2].querySelector("img")).toHaveAttribute("src", "/f/9?v=1"));
    expect(panel.querySelector(".refs li:nth-child(2) img")).toHaveAttribute("src", "/f/9?v=1");
  });

  it("labels a node with the model its spec.json names, and with none where no spec came back", async () => {
    withSpec();
    render(<Canvas drama={drama("working")} />);
    const board = (await screen.findByRole("button", { name: /^Storyboard · line-art/ })).closest(".cnode")!;
    await waitFor(() => expect(board.querySelector(".lab .model")).toHaveTextContent("sd25"));
    const lin = screen.getByRole("button", { name: /^林/ }).closest(".cnode")!;
    expect(lin.querySelector(".lab .model")).toBeNull();
  });

  it("shows the prompt drama-cli sent, each Image N as a chip with the picture it names", async () => {
    withSpec();
    render(<Canvas drama={drama("working")} />);
    const { panel } = await panelOf(/^Storyboard · line-art/);
    await waitFor(() => expect(within(panel).getByRole("tabpanel").textContent).toContain("She walks in, as in Image 1, past Image 2."));
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
    render(<Canvas drama={drama("working")} />);
    const { panel } = await panelOf(/^林/);
    await waitFor(() => expect(within(panel).getByRole("tabpanel")).toHaveTextContent("A full-body turnaround of 林."));
    expect([...panel.querySelectorAll(".nfoot .pill")].map((pill) => pill.textContent)).toEqual(["gpt-image-2", "16:9 · 2K"]);
  });

  it("lists the settings the spec states as the panel's pills, and nothing it doesn't", async () => {
    withSpec();
    render(<Canvas drama={drama("working")} />);
    const { panel } = await panelOf(/^Storyboard · line-art/);
    await waitFor(() => expect([...panel.querySelectorAll(".nfoot .pill")].map((pill) => pill.textContent)).toEqual(["sd25", "9:16 · 480p · 12s · seed 42"]));
  });

  it("shows the request as a JSON tree", async () => {
    withSpec();
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^Storyboard · line-art/);
    await user.click(within(panel).getByRole("tab", { name: "Request" }));
    expect(await within(panel).findByRole("tree", { name: "Request" })).toHaveTextContent(/"sd25"/);
  });

  it("says so until the agent returns the version's spec", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { panel } = await panelOf(/^Storyboard · line-art/);
    expect(within(panel).getByRole("tabpanel")).toHaveTextContent("The agent hasn't returned this version's spec.json and request.json.");
  });

  it("says why a version is stale in drama-cli's own words, and adds no Why where nothing is wrong", async () => {
    withBreakdown();
    const view = lineageView();
    view.lineage.nodes.find((node) => node.id === "assets/characters/lin")!.problems = ["Changed file: bible/v1/bible.json"];
    answer("/api/dramas/d1/lineage", view);
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^林/);
    await user.click(within(panel).getByRole("tab", { name: "Details" }));
    expect(within(panel).getByRole("tabpanel")).toHaveTextContent(/Why\s*Changed file: bible\/v1\/bible\.json/);
    await user.keyboard("{Escape}");
    const take = await panelOf(/^Take · t01/);
    await take.user.click(within(take.panel).getByRole("tab", { name: "Details" }));
    expect(within(take.panel).getByRole("tabpanel")).not.toHaveTextContent("Why");
  });

  it("says what drama-cli's lineage made it from and what uses it, in the panel's Details", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^Take · t01/);
    await user.click(within(panel).getByRole("tab", { name: "Details" }));
    expect(within(panel).getByRole("tabpanel")).toHaveTextContent(/Used by—Reads.*Storyboard · line-art · v1.*林/);
  });

  it("lists a look's versions from its cast card, newest first, each with what the maker decided", async () => {
    withSpec();
    answer("/api/dramas/d1/cast", [{ kind: "look", subject: "lin", episodes: [], looks: [{ look: "base", versions: [
      { turnId: "u1", files: [{ ...look, version: "v1" }], review: { reviewId: "r1", kind: "looks", state: "answered", verdict: "revise", notes: [{ text: "Older, please." }] } },
      { turnId: "u2", files: [{ ...look, version: "v2" }], review: { reviewId: "r2", kind: "looks", state: "answered", verdict: "approve", notes: [] } },
    ] }] }]);
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^林/);
    await user.click(within(panel).getByRole("tab", { name: "Versions" }));
    await waitFor(() => expect(panel.querySelectorAll(".versions > li")).toHaveLength(2));
    const [newest, older] = [...panel.querySelectorAll(".versions > li")];
    expect(newest).toHaveTextContent(/Version · v2.*Approved/);
    expect(older).toHaveTextContent(/Version · v1.*Sent back.*Older, please\./);
  });

  it("lists the segment's versions, each with what the maker decided", async () => {
    withBreakdown();
    answer("/api/dramas/d1/episodes/EP001", { segments: [{ key: "seg01", boards: [{ turnId: "u1", files: [{ ...sheet, version: "v1", style: "line-art" }], review: { reviewId: "r1", kind: "storyboards", state: "answered", verdict: "revise", notes: [{ text: "Brighter lamp." }] } }], stills: [], takes: [] }] });
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^Storyboard · line-art/);
    await user.click(within(panel).getByRole("tab", { name: "Versions" }));
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
    render(<Canvas drama={drama("working")} />);
    const versionsOf = async (name: RegExp) => {
      const { user, panel } = await panelOf(name);
      await user.click(within(panel).getByRole("tab", { name: "Versions" }));
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
    render(<Canvas drama={drama("working")} />);
    // React Flow writes the viewport and each node's absolute place on the page, and measures its pane as the page lays it out.
    const translate = (element: Element) => (element as HTMLElement).style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)(?:\s*scale\(([\d.]+)\))?/)!.slice(1).map(Number);
    const screen = () => {
      const [vx, vy, zoom] = translate(document.querySelector(".react-flow__viewport")!);
      const node = document.querySelector('.react-flow__node[data-id="episodes/EP001/segments/seg01"]')!;
      const [x, y] = translate(node);
      return { left: x * zoom + vx, top: y * zoom + vy, width: (node as HTMLElement).offsetWidth * zoom };
    };
    const { user, panel } = await panelOf(/^Take · t01/);
    const pane = (document.querySelector(".react-flow") as HTMLElement).offsetWidth;
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
  });

  it("says when the versions can't be read, rather than that there are none", async () => {
    withBreakdown();
    server.use(http.get("/api/dramas/d1/episodes/EP001", () => HttpResponse.json({ code: "internal", error: "boom" }, { status: 500 })));
    render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^Take · t01/);
    await user.click(within(panel).getByRole("tab", { name: "Versions" }));
    expect(await within(panel).findByText("The versions couldn't be read. Try again in a moment.")).toBeInTheDocument();
    expect(within(panel).queryByText("No version returned yet.")).toBeNull();
  });

  it("offers the hand actions disabled, saying why, and they do nothing", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^Storyboard · line-art/);
    const panel = await screen.findByRole("region", { name: /what it is made from/ });
    for (const button of [within(panel).getByRole("button", { name: "Generate" }), within(panel).getByRole("button", { name: "Upload" })]) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(/^Phase 2/);
    }
    expect([PHASE_ONE.generate("x"), PHASE_ONE.upload("x")]).toEqual([undefined, undefined]);
    expect(sent.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("downloads the item's picture from its bar", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^Storyboard · line-art/);
    expect(within(bar).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/f/8?v=1&download=1");
  });

  it("moves the minimap aside while a panel is open under its node", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    expect(await screen.findByRole("img", { name: "Minimap: move the view" })).toBeInTheDocument();
    await panelOf(/^Storyboard · line-art/);
    expect(screen.queryByRole("img", { name: "Minimap: move the view" })).toBeNull();
  });

  it("opens the panel under the node, or docked right on asking, and keeps the maker's choice", async () => {
    withBreakdown();
    const { unmount } = render(<Canvas drama={drama("working")} />);
    const { user, panel } = await panelOf(/^Storyboard · line-art/);
    expect(panel.closest(".react-flow__node-toolbar")).not.toBeNull();
    await user.click(within(panel).getByRole("button", { name: "Dock right" }));
    const docked = await screen.findByRole("region", { name: /what it is made from/ });
    expect(docked).toHaveClass("docked");
    expect(docked.closest(".react-flow__node-toolbar")).toBeNull();
    expect(localStorage.getItem("studio.canvas.dock")).toBe("right");
    unmount();
    render(<Canvas drama={drama("working")} />);
    await pick(/^Storyboard · line-art/);
    expect(await screen.findByRole("region", { name: /what it is made from/ })).toHaveClass("docked");
    localStorage.removeItem("studio.canvas.dock");
  });

  it("lets go of the item on Escape, with its bar and panel", async () => {
    withBreakdown();
    render(<Canvas drama={drama("working")} />);
    const { user } = await pick(/^Storyboard · line-art/);
    await screen.findByRole("region", { name: /what it is made from/ });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("region", { name: /what it is made from/ })).toBeNull());
    expect(screen.queryByRole("toolbar", { name: /^Steer/ })).toBeNull();
  });
});
