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
import { http, HttpResponse } from "msw";
import { accept, answer, calls, server } from "../test/server.ts";
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
  it("keeps each session with the Computer it runs on, and Watch says whose desktop it shows and what else it runs", async () => {
    engine();
    const two = { ...drama, crew: [...drama.crew, { id: "c2", label: "Computer 2", state: "running", idleTimeoutMinutes: 180, sessions: [{ id: "s3", name: "setup", role: "setup", state: "open", waiting: false }] }] } as unknown as DramaView;
    await renderAt(<AgentPanel drama={two} onCollapse={() => {}} />);
    const sessions = screen.getByRole("region", { name: "Sessions" });
    expect(within(sessions).getByRole("button", { name: /^EP001\s*on Computer 1 · Shooting seg01$/ })).toBeInTheDocument();
    expect(within(sessions).getByRole("button", { name: /^EP002\s*on Computer 1 · / })).toBeInTheDocument();
    // Computer 1 runs EP001 and EP002; Computer 2 the setup alone.
    expect(within(sessions).getAllByRole("button", { name: "Watch Computer 1's desktop (also running EP002)" })).toHaveLength(1);
    expect(within(sessions).getAllByRole("button", { name: "Watch Computer 1's desktop (also running EP001)" })).toHaveLength(1);
    expect(within(sessions).getByRole("button", { name: "Watch Computer 2's desktop" })).toBeInTheDocument();
  });

  it("tells which session of its scope each is and what came before it, and how a scope's last session ended", async () => {
    engine();
    answer("/api/dramas/d1/session-history", [
      { id: "s0", scope: "EP001", computer: "PC-2", state: "lost", createdAt: "2026-10-30T08:00:00Z", closedAt: "2026-10-30T09:00:00Z" },
      { id: "s1", scope: "EP001", computer: "PC-1", state: "open", createdAt: "2026-10-30T09:30:00Z" },
      { id: "s2", scope: "EP002", computer: "PC-1", state: "open", createdAt: "2026-10-30T09:31:00Z" },
      { id: "s9", scope: "EP003", computer: "PC-2", state: "lost", createdAt: "2026-10-30T08:00:00Z", closedAt: "2026-10-30T09:00:00Z" },
    ]);
    const stopped = { ...drama, episodeRows: [row(1, "working"), row(2, "waiting"), row(3, "stopped")] } as unknown as DramaView;
    await renderAt(<AgentPanel drama={stopped} episode="EP003" onCollapse={() => {}} />);
    const sessions = screen.getByRole("region", { name: "Sessions" });
    expect(await within(sessions).findByText("Session 2 on PC-1, after PC-2 stopped")).toBeInTheDocument();
    // A first session has nothing before it.
    expect(within(sessions).queryByText(/^Session 1 /)).toBeNull();
    expect(screen.getByText("Its last session, 1, was on PC-2 when it stopped.")).toBeInTheDocument();
  });

  it("shows the sessions, the decisions waiting, and what was made, named as the bible names them", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} onCollapse={() => {}} />);
    // Every open session, at work or waiting for the maker, so any can be pinned (design/app.js, AgentPanel's Sessions).
    const sessions = screen.getByRole("region", { name: "Sessions" });
    expect(within(sessions).getByRole("button", { name: /EP001\s*on Computer 1 · Shooting seg01/ })).toBeInTheDocument();
    expect(within(sessions).getByRole("button", { name: /^EP002/ })).toBeInTheDocument();
    const decisions = screen.getByRole("region", { name: "Decisions" });
    expect(await within(decisions).findByRole("link", { name: /EP002 · Storyboards\s*3 items · seg01, seg02, seg03/ })).toHaveAttribute("href", "/r/r2");
    // Recent work needs the files as well as the project.
    const recent = await screen.findByRole("region", { name: "Recent work" });
    await waitFor(() => expect(within(recent).getAllByText(/^Look · 林/).map((line) => line.textContent)).toEqual(["Look · 林 v2", "Look · 林 v1"]));
  });

  // D31 as amended: every drama page has a scope, its episode, else the setup; the line always names its target.
  // The sidebar follows the engine of this version: a message reaches only the scope's open session.
  it("follows the setup on a page of no episode, and once it has handed over, says so with no line to send", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} onCollapse={() => {}} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("The setup handed over the project. This version can't reopen it.");
    // No dot when no session is open, and none in the head: one dot, one meaning.
    expect(status.querySelector(".live, .adot")).toBeNull();
    expect(document.querySelector(".ahead .live")).toBeNull();
    // EP001 is at work and EP002 waits, but neither is taken for the page's.
    expect(screen.queryByText(/EP001's session/)).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Message the agent" })).toBeNull();
    expect(screen.queryByText(/a new .* session/)).toBeNull();
  });

  it("takes an episode as the scope only if the project has it: on a page naming another, it follows the setup", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP003" onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("The setup handed over the project.");
    expect(screen.queryByText(/EP003/)).toBeNull();
  });

  it("offers Resume where an episode's Computer stopped, a run control, and no line that would be refused", async () => {
    const user = userEvent.setup();
    engine();
    accept("/api/episodes/e3/resume");
    const stopped = { ...drama, episodeRows: [row(1, "working"), row(2, "waiting"), row(3, "stopped")] } as unknown as DramaView;
    await renderAt(<AgentPanel drama={stopped} episode="EP003" onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("EP003's Computer stopped. Resume continues it in a new session with its files.");
    expect(screen.queryByRole("textbox", { name: "Message the agent" })).toBeNull();
    await user.click(within(screen.getByRole("status")).getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(calls("POST", "/api/episodes/e3/resume")).toHaveLength(1));
  });

  it("says a done episode can't be reopened in this version, with no line and no Resume", async () => {
    engine();
    const done = { ...drama, episodeRows: [row(1, "working"), row(2, "waiting"), row(3, "done")] } as unknown as DramaView;
    await renderAt(<AgentPanel drama={done} episode="EP003" onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("EP003 is done. This version can't reopen a finished episode.");
    expect(screen.queryByRole("textbox", { name: "Message the agent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("says, in the engine's words, when an episode can't take a message yet, and offers no line that would be refused", async () => {
    engine();
    // EP003 is in line and has never run; EP001's turn is starting with no session open yet.
    const starting = { ...drama, crew: [], episodeRows: [row(1, "working"), row(2, "waiting"), row(3, "queued")] } as unknown as DramaView;
    const { rerender } = await renderAt(<AgentPanel drama={starting} episode="EP003" onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("EP003 hasn't started: it starts in its turn, and you can write to it then.");
    expect(screen.queryByRole("textbox", { name: "Message the agent" })).toBeNull();
    rerender(<AgentPanel drama={starting} episode="EP001" onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("EP001's session is starting: write to it in a moment.");
    expect(screen.queryByRole("textbox", { name: "Message the agent" })).toBeNull();
  });

  it("shows the engine's refusal in its words, and keeps the message", async () => {
    const user = userEvent.setup();
    engine();
    server.use(http.post("/api/dramas/d1/messages", () => HttpResponse.json({ code: "drama-not-running", error: "The project is stopped: resume it to send a message." }, { status: 409 })));
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    await user.type(await screen.findByRole("textbox", { name: "Message the agent" }), "Keep the letter.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    // The engine's code, worded as labels.ts words it, and the message kept.
    expect(await screen.findByRole("alert")).toHaveTextContent("Not submitted. The project is stopped: resume it first. Your message is kept.");
    expect(screen.getByRole("textbox", { name: "Message the agent" })).toHaveValue("Keep the letter.");
  });

  it("points a setup waiting on a screenplay rewrite to Script, with no answer box that would be refused", async () => {
    engine();
    const setupDrama = { ...drama, crew: [{ ...drama.crew[0], sessions: [{ id: "s0", name: "setup", role: "setup", state: "open", waiting: true }] }] } as unknown as DramaView;
    answer("/api/dramas/d1/sessions", [chat("s0", "", "review")]);
    answer("/api/sessions/s0/chat", { ...chat("s0", "", "review"), reviewId: "r9", rewrite: "v1" });
    await renderAt(<AgentPanel drama={setupDrama} onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Following the setup session: it waits for you");
    expect(await screen.findByRole("link", { name: "v1 waits for your Accept or Send back on Script" })).toHaveAttribute("href", "/d/d1/script?item=screenplay&version=v1");
    expect(screen.queryByRole("textbox", { name: "Message the agent" })).toBeNull();
  });

  it("shows each decision the maker sent in the conversation, item by item, with its reason (D70)", async () => {
    engine();
    const decided = chat("s1", "EP001", "steer");
    decided.messages.push({
      id: 9,
      kind: "input",
      text: "(the agent's terms)",
      at: "2026-10-30T10:03:00Z",
      decision: { reviewId: "r1", kind: "takes", words: "Good.", items: [{ key: "seg01", version: "t02", verdict: "approve", notes: [] }, { key: "seg03", version: "t02", verdict: "revise", notes: ["Open on Luca's face."] }] },
    });
    answer("/api/sessions/s1/chat", decided);
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    const said = await screen.findByRole("region", { name: "Conversation" });
    expect(await within(said).findByText("You accepted EP001 seg01 t02: “Good.”")).toBeInTheDocument();
    expect(within(said).getByText("You sent back EP001 seg03 t02: “Open on Luca's face.”")).toBeInTheDocument();
    expect(within(said).queryByText("(the agent's terms)")).not.toBeInTheDocument();
  });

  it("names a decided look or place as the bible names it, never by drama-cli's key", async () => {
    engine();
    const decided = chat("s1", "EP001", "steer");
    decided.messages.push({
      id: 9,
      kind: "input",
      text: "(the agent's terms)",
      at: "2026-10-30T10:03:00Z",
      decision: { reviewId: "r1", kind: "references", words: "Approved.", items: [{ key: "lin", version: "v1", verdict: "approve", notes: [] }, { key: "lin/S1", version: "v2", verdict: "approve", notes: [] }, { key: "location:office", version: "v1", verdict: "approve", notes: [] }] },
    });
    answer("/api/sessions/s1/chat", decided);
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    const said = await screen.findByRole("region", { name: "Conversation" });
    expect(await within(said).findByText("You accepted EP001 林 · base look v1: “Approved.”")).toBeInTheDocument();
    expect(within(said).getByText("You accepted EP001 林 · S1 v2: “Approved.”")).toBeInTheDocument();
    expect(within(said).getByText("You accepted EP001 办公室 v1: “Approved.”")).toBeInTheDocument();
    expect(within(said).queryByText(/\blin\b/)).toBeNull();
  });

  it("says, with one dot, that the episode's session is working, and names it on the line", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Following EP001's session: working");
    expect(status.querySelectorAll(".live, .adot")).toHaveLength(1);
    expect(await screen.findByText("To EP001's session")).toBeInTheDocument();
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
    accept("/api/dramas/d1/messages", { id: "sub", sessionId: "s1", state: "sent" });
    await user.type(screen.getByRole("textbox", { name: "Message the agent" }), "Keep the letter in her left hand.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    // A message to the scope of the session in view, EP001's, under one submission id.
    const [sent] = calls("POST", "/api/dramas/d1/messages").map((call) => call.body as { scope: string; submissionId: string; text: string });
    expect(sent).toMatchObject({ scope: "EP001", text: "Keep the letter in her left hand." });
    expect(sent.submissionId).toMatch(/\S/);
  });

  it("sends the maker to the review a session waits on rather than a line to it", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Following EP002's session: it waits for you");
    expect(await screen.findByRole("link", { name: "Open the review it waits on" })).toHaveAttribute("href", "/r/r2");
    expect(screen.queryByRole("textbox", { name: "Message the agent" })).toBeNull();
  });

  it("follows the episode in view, and a pin wins until the maker follows it again (IA draft E)", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    const scope = screen.getByRole("status");
    expect(scope).toHaveTextContent("Following EP002's session: it waits for you");
    expect(await screen.findByRole("link", { name: "Open the review it waits on" })).toHaveAttribute("href", "/r/r2");
    await user.click(within(screen.getByRole("region", { name: "Sessions" })).getByRole("button", { name: /^EP001/ }));
    expect(scope).toHaveTextContent("Pinned to EP001's session: working");
    // The process, the messages and the line all go with the pin.
    expect(await screen.findByText("To EP001's session")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /EP001 · Process/ })).toBeInTheDocument();
    await user.click(within(scope).getByRole("button", { name: "Follow EP002's session" }));
    expect(scope).toHaveTextContent("Following EP002's session: it waits for you");
    expect(await screen.findByRole("link", { name: "Open the review it waits on" })).toBeInTheDocument();
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
