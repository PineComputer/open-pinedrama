// The agent panel and the stop control, used as a maker uses them on a drama with one episode at
// work and one waiting: its sessions, with Watch and Stop; the decisions waiting; the recent work
// named as the bible names them; the session it speaks to, followed or pinned, and a line to it;
// the panel docked, floated and collapsed to its ball; and Stop drama through to Resume.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBibleNames } from "../../shared/names.ts";
import { parseStatus, type ProjectView } from "../../shared/project.ts";
import type { ChatView, DramaView, EpisodeRow, FileItem, ReviewSummary } from "../../shared/types.ts";
import { accept, answer, calls } from "../test/server.ts";
import { AgentBall, AgentPanel, useAgentMode } from "./AgentPanel.tsx";
import { StopControl } from "./TopBar.tsx";
import { renderAt } from "../test/router.tsx";

// The UI's tests run in jsdom, whose module URLs aren't files: the fixtures are found from the repository's root.
const fixture = (name: string) => JSON.parse(readFileSync(path.resolve("fixtures/status", `${name}.json`), "utf8"));

function row(number: number, state: EpisodeRow["state"]): EpisodeRow {
  return { id: `e${number}`, number, code: `EP00${number}`, title: `Episode ${number}`, state, stages: {} as EpisodeRow["stages"], spent: { total: 0, media: 0, partial: false }, updatedAt: "2026-10-30T10:00:00Z" };
}

const drama = {
  id: "d1",
  mode: "pine",
  title: "The Stepmother",
  status: "production",
  waiting: 1,
  crew: [
    {
      id: "c1",
      label: "Computer 1",
      state: "running",
      idleTimeoutMinutes: 180,
      sessions: [
        { id: "s1", name: "EP001", role: "episode", episode: "EP001", state: "open", activity: "Shooting seg01", waiting: false },
        { id: "s2", name: "EP002", role: "episode", episode: "EP002", state: "open", waiting: true },
      ],
    },
  ],
  episodeRows: [row(1, "working"), row(2, "waiting")],
} as unknown as DramaView;

function project(): ProjectView {
  const report = fixture("boards");
  // lin's v2 waits for review: a thing to do, and recent work in review.
  report.characters.lin = { ...report.characters.lin, current: "v2", candidate: "v2", usable: false, why: "not accepted" };
  const { budget: _budget, ...state } = parseStatus(report);
  return { state, sessions: [], problems: [], names: parseBibleNames(fixture("bible")) };
}

const decision: ReviewSummary = { id: "r2", dramaId: "d1", dramaTitle: "The Stepmother", episode: "EP002", kind: "storyboards", state: "open", question: "Ready.", items: 3, subjects: ["seg01", "seg02", "seg03"], createdAt: new Date().toISOString() };
const file = (path: string, createdAt: string) => ({ id: 1, name: "image-1.png", path, type: "image/png", size: 1, kind: "look", url: "/f/1", createdAt }) as unknown as FileItem;

function chat(sessionId: string, label: string, sends: ChatView["sends"]): ChatView {
  return {
    sessionId,
    label,
    sends,
    messages: [
      { id: 1, kind: "activity", text: "Compiled the video prompts", at: "2026-10-30T10:00:00Z" },
      { id: 2, kind: "activity", text: "Shooting seg01", at: "2026-10-30T10:01:00Z" },
      { id: 3, kind: "progress", text: "Shooting the first take now.", at: "2026-10-30T10:02:00Z" },
    ],
  };
}

function engine() {
  answer("/api/dramas/d1/project", project());
  answer("/api/reviews", [decision]);
  answer("/api/dramas/d1/files", [file("drama/assets/characters/lin/v1/image-1.png", "2026-10-30T10:00:00Z"), file("drama/assets/characters/lin/v2/image-1.png", "2026-10-30T10:05:00Z")]);
  answer("/api/dramas/d1/sessions", [chat("s1", "EP001", "steer"), chat("s2", "EP002", "review")]);
  answer("/api/sessions/s1/chat", chat("s1", "EP001", "steer"));
  answer("/api/sessions/s2/chat", { ...chat("s2", "EP002", "review"), reviewId: "r2" });
}

describe("the agent panel", () => {
  it("shows the sessions, the decisions waiting, and what was made, named as the bible names them", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} onCollapse={() => {}} />);
    // Every open session, at work or waiting for the maker, so any can be pinned (design/app.js, AgentPanel's Sessions).
    const sessions = screen.getByRole("region", { name: "Sessions" });
    expect(within(sessions).getByRole("button", { name: /EP001\s*Shooting seg01/ })).toBeInTheDocument();
    expect(within(sessions).getByRole("button", { name: /^EP002/ })).toBeInTheDocument();
    const decisions = screen.getByRole("region", { name: "Decisions" });
    expect(await within(decisions).findByRole("link", { name: /EP002 · Storyboards\s*3 items · seg01, seg02, seg03/ })).toHaveAttribute("href", "/r/r2");
    // Recent work needs the files as well as the project.
    const recent = await screen.findByRole("region", { name: "Recent work" });
    await waitFor(() => expect(within(recent).getAllByText(/^Look · 林/).map((line) => line.textContent)).toEqual(["Look · 林 v2", "Look · 林 v1"]));
  });

  it("says whose session it follows", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    expect(await screen.findByText(/^To EP001's session/)).toBeInTheDocument();
  });

  it("follows the session in view: its steps, what it said, and a line to it", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    const process = (await screen.findByRole("button", { name: /EP001 · Process/ })).parentElement as HTMLElement;
    // The process shows once the sessions are in, with its steps once the session's chat is.
    expect(within(process).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Compiled the video prompts", "Shooting seg01"]);
    // A disclosure: its steps fold away under it.
    const toggle = within(process).getByRole("button", { expanded: true });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(process).queryAllByRole("listitem")).toHaveLength(0);
    await user.click(toggle);
    expect(screen.getByText("Shooting the first take now.")).toBeInTheDocument();
    accept("/api/sessions/s1/chat");
    await user.type(screen.getByRole("textbox", { name: "Message the agent" }), "Keep the letter in her left hand.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(calls("POST", "/api/sessions/s1/chat").map((call) => call.body)).toEqual([{ text: "Keep the letter in her left hand." }]);
  });

  it("sends the maker to the review a session waits on rather than a line to it", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    expect(await screen.findByRole("link", { name: "Open the review it waits on" })).toHaveAttribute("href", "/r/r2");
    expect(screen.getByRole("textbox", { name: "Message the agent" })).toBeDisabled();
  });

  it("follows the episode in view, and a pin wins until the maker follows it again (IA draft E)", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    const scope = screen.getByRole("status");
    expect(scope).toHaveTextContent("Following EP002, the episode in view");
    // EP002's session waits on its review: the panel follows it there.
    expect(await screen.findByRole("link", { name: "Open the review it waits on" })).toHaveAttribute("href", "/r/r2");
    await user.click(within(screen.getByRole("region", { name: "Sessions" })).getByRole("button", { name: /^EP001/ }));
    expect(scope).toHaveTextContent("Pinned to EP001");
    // The process, the messages and the line all go with the pin.
    expect(await screen.findByText(/^To EP001's session/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /EP001 · Process/ })).toBeInTheDocument();
    await user.click(within(scope).getByRole("button", { name: "Follow EP002" }));
    expect(scope).toHaveTextContent("Following EP002, the episode in view");
    expect(await screen.findByRole("link", { name: "Open the review it waits on" })).toBeInTheDocument();
  });

  it("follows no session on a page with no episode in view, and never guesses one (IA draft E)", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<AgentPanel drama={drama} onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("No episode in view");
    // EP001 is at work and EP002 asks, but neither is taken for the page's.
    expect(screen.getByRole("textbox", { name: "Message the agent" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Message the agent" })).toHaveAttribute("placeholder", "Pin a session to message it");
    expect(screen.getByText("No session chosen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /· Process/ })).toBeNull();
    await user.click(within(await screen.findByRole("region", { name: "Sessions" })).getByRole("button", { name: /^EP001/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Pinned to EP001");
    expect(await screen.findByText(/^To EP001's session/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unpin" }));
    expect(screen.getByRole("status")).toHaveTextContent("No episode in view");
  });

  it("stops one episode after the maker confirms, and only then", async () => {
    const user = userEvent.setup();
    engine();
    accept("/api/episodes/e1/stop");
    await renderAt(<AgentPanel drama={drama} onCollapse={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Stop EP001" }));
    const dialog = screen.getByRole("alertdialog", { name: "Stop EP001?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(calls("POST", "/api/episodes/e1/stop")).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Stop EP001" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "Stop EP001?" })).getByRole("button", { name: "Stop the episode" }));
    expect(calls("POST", "/api/episodes/e1/stop")).toHaveLength(1);
  });

  it("collapses to its ball from its head, the one form it has besides the sidebar", async () => {
    const user = userEvent.setup();
    engine();
    let collapsed = 0;
    await renderAt(<AgentPanel drama={drama} onCollapse={() => collapsed++} />);
    const collapse = screen.getByRole("button", { name: "Collapse the agent sidebar" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: /float|dock/i })).toBeNull();
    await user.click(collapse);
    expect(collapsed).toBe(1);
  });
});

describe("the agent sidebar's state", () => {
  function Probe() {
    const [mode, setMode] = useAgentMode(true);
    return <button type="button" onClick={() => setMode(mode === "open" ? "closed" : "open")}>{mode}</button>;
  }

  it("keeps the maker's choice in this browser, and ⌥⌘B or Ctrl+Alt+B toggles it", async () => {
    const user = userEvent.setup();
    localStorage.setItem("studio.agent", "closed");
    await renderAt(<Probe />);
    expect(screen.getByRole("button", { name: "closed" })).toBeInTheDocument();
    await user.keyboard("{Meta>}{Alt>}b{/Alt}{/Meta}");
    expect(screen.getByRole("button", { name: "open" })).toBeInTheDocument();
    expect(localStorage.getItem("studio.agent")).toBe("open");
    await user.keyboard("{Control>}{Alt>}b{/Alt}{/Control}");
    expect(localStorage.getItem("studio.agent")).toBe("closed");
    localStorage.removeItem("studio.agent");
  });
});

describe("the agent ball", () => {
  it("says how many decisions wait, turns while an agent works, and opens the sidebar", async () => {
    const user = userEvent.setup();
    let opened = 0;
    await renderAt(<AgentBall waiting={4} busy onOpen={() => opened++} />);
    const ball = screen.getByRole("button", { name: "Open the agent sidebar, 4 decisions waiting" });
    expect(ball).toHaveClass("busy");
    expect(ball).toHaveTextContent("4");
    await user.click(ball);
    expect(opened).toBe(1);
  });
});

describe("Stop project", () => {
  it("asks first, and Keep running leaves it running", async () => {
    const user = userEvent.setup();
    accept("/api/dramas/d1/stop");
    await renderAt(<StopControl drama={drama} />);
    await user.click(screen.getByRole("button", { name: "Stop project" }));
    const dialog = screen.getByRole("alertdialog", { name: "Stop The Stepmother?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep running" }));
    expect(calls("POST", "/api/dramas/d1/stop")).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Stop project" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "Stop The Stepmother?" })).getByRole("button", { name: "Stop project" }));
    expect(calls("POST", "/api/dramas/d1/stop")).toHaveLength(1);
  });

  it("says Stopping… while its Computers stop, and can't be pressed", async () => {
    const stopping = { ...drama, status: "stopped", crew: [{ ...drama.crew[0], state: "stopping" }] } as DramaView;
    await renderAt(<StopControl drama={stopping} />);
    expect(screen.getByRole("button", { name: "Stopping…" })).toBeDisabled();
  });

  it("once stopped, says so and offers Resume", async () => {
    const user = userEvent.setup();
    accept("/api/dramas/d1/resume");
    const stopped = { ...drama, status: "stopped", crew: [] } as unknown as DramaView;
    await renderAt(<StopControl drama={stopped} />);
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(calls("POST", "/api/dramas/d1/resume")).toHaveLength(1);
  });
});
