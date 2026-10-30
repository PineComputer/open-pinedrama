// The canvas's SteerBar (P6.3), used as a maker uses it: pick an item, then Review it where its
// review is open, send it back or leave a note for the agent at work on it, or trace its lineage.
// The canvas steers and never records a verdict: decisions stay in the review room.
import "../test/flow.ts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import { parseStatus, type ProjectView } from "../../shared/project.ts";
import type { ChatView, DramaView, EpisodeRow, ReviewSummary } from "../../shared/types.ts";
import { storyboardReview } from "../test/fixtures.ts";
import { accept, answer, calls, sent } from "../test/server.ts";
import { Canvas } from "./Canvas.tsx";

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
    const { user, bar } = await pick(/^seg01/);
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
    const { bar } = await pick(/^seg01/);
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
    const { bar } = await pick(/^seg01/);
    await user.click(within(bar).getByRole("button", { name: "Note" }));
    expect(within(bar).getByText(/EP001's agent isn't running: In line/)).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /^Resume/ })).toBeNull();
  });

  it("sends nothing while the agent waits on a review, and points to that review", async () => {
    const user = userEvent.setup();
    engine([], "review", "r5");
    render(<Canvas drama={drama("working")} />);
    const { bar } = await pick(/^seg01/);
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
