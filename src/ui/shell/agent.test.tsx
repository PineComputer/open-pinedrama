// The agent panel and the stop control, used as a maker uses them on a drama with one episode at
// work and one waiting: its sessions, with Watch and Stop; the decisions waiting; the recent work
// named as the bible names them; the session it speaks to, followed or pinned, and a line to it;
// the panel docked, floated and collapsed to its ball; and Stop drama through to Resume.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseBibleNames } from "../../shared/names.ts";
import { parseStatus, type ProjectView } from "../../shared/project.ts";
import type { ChatStop, ChatView, DramaView, EpisodeRow, FileItem, ReviewSummary } from "../../shared/types.ts";
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
  setup: { state: "done", reached: 5 },
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
  it("names the session's Computer, and Watch says whose desktop it shows and what else that Computer runs", async () => {
    const user = userEvent.setup();
    engine();
    const two = { ...drama, crew: [...drama.crew, { id: "c2", label: "Computer 2", state: "running", idleTimeoutMinutes: 180, sessions: [{ id: "s3", name: "setup", role: "setup", state: "open", waiting: false }] }] } as unknown as DramaView;
    await renderAt(<AgentPanel drama={two} episode="EP001" onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("on Computer 1");
    // Computer 1 runs EP001 and EP002; Computer 2 the setup alone.
    expect(screen.getByRole("button", { name: "Watch the Computer desktop of Computer 1 (also running EP002)" })).toBeInTheDocument();
    // The picker lists the other open sessions, each with its Computer.
    const picker = screen.getByRole("combobox", { name: "Session" });
    expect(within(picker).getAllByRole("option").map((option) => option.textContent)).toEqual(["EP001 (this page)", "EP002 · on Computer 1 · waits for you", "Setup · on Computer 2 · at work"]);
    await user.selectOptions(picker, "setup");
    expect(screen.getByRole("button", { name: "Watch the Computer desktop of Computer 2" })).toBeInTheDocument();
  });

  it("tells which session of its scope it is and what came before it, and how a scope's last session ended", async () => {
    engine();
    answer("/api/dramas/d1/session-history", [
      { id: "s0", scope: "EP001", computer: "PC-2", state: "lost", createdAt: "2026-10-30T08:00:00Z", closedAt: "2026-10-30T09:00:00Z" },
      { id: "s1", scope: "EP001", computer: "PC-1", state: "open", createdAt: "2026-10-30T09:30:00Z" },
      { id: "s9", scope: "EP003", computer: "PC-2", state: "lost", createdAt: "2026-10-30T08:00:00Z", closedAt: "2026-10-30T09:00:00Z" },
    ]);
    const stopped = { ...drama, episodeRows: [row(1, "working"), row(2, "waiting"), row(3, "stopped")] } as unknown as DramaView;
    const { rerender } = await renderAt(<AgentPanel drama={stopped} episode="EP001" onCollapse={() => {}} />);
    expect(await within(screen.getByRole("status")).findByText(/Session 2 on PC-1, after PC-2 stopped/)).toBeInTheDocument();
    rerender(<AgentPanel drama={stopped} episode="EP003" onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Its last session, 1, was on PC-2 when it stopped.");
  });

  it("says a Computer restarted under its own label kept its identity, not its files (D72), and a pack only where one was given", async () => {
    engine();
    answer("/api/dramas/d1/session-history", [
      { id: "s0", scope: "EP001", computer: "PC-1", state: "lost", createdAt: "2026-10-30T08:00:00Z", closedAt: "2026-10-30T09:00:00Z", startedFrom: "project", handedOver: false },
      { id: "s1", scope: "EP001", computer: "PC-1", state: "open", createdAt: "2026-10-30T09:30:00Z", startedFrom: "episode-pack", handedOver: false },
    ]);
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    const status = screen.getByRole("status");
    expect(await within(status).findByText(/Session 2 on PC-1, restarted after it stopped; its files came back from its last session's pack/)).toBeInTheDocument();
    expect(status).not.toHaveTextContent("after PC-1 stopped");
  });

  it("claims no pack for a session the engine didn't give one (Codex RC2, C4)", async () => {
    engine();
    answer("/api/dramas/d1/session-history", [
      { id: "s0", scope: "EP001", computer: "PC-1", state: "lost", createdAt: "2026-10-30T08:00:00Z", closedAt: "2026-10-30T09:00:00Z", startedFrom: "project", handedOver: false },
      { id: "s1", scope: "EP001", computer: "PC-1", state: "open", createdAt: "2026-10-30T09:30:00Z", startedFrom: "project", handedOver: false },
    ]);
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    const status = screen.getByRole("status");
    expect(await within(status).findByText(/Session 2 on PC-1, restarted after it stopped/)).toBeInTheDocument();
    expect(status).not.toHaveTextContent(/pack/);
  });

  it("says a setup stopped before it handed over restarts from the screenplay, and its restart that it did (Codex RC2, C4)", async () => {
    engine();
    const setupHistory = [{ id: "s0", scope: "setup", computer: "PC-1", state: "lost", createdAt: "2026-10-30T08:00:00Z", closedAt: "2026-10-30T09:00:00Z", startedFrom: "inputs", handedOver: false }];
    answer("/api/dramas/d1/session-history", setupHistory);
    const stopped = { ...drama, status: "stopped", setup: { state: "stopped", reached: 1, reason: "by-maker" }, crew: [], episodeRows: [] } as unknown as DramaView;
    const { unmount } = await renderAt(<AgentPanel drama={stopped} onCollapse={() => {}} />);
    const status = screen.getByRole("status");
    expect(await within(status).findByText("Setup stopped before handing over. Resume restarts it from your screenplay.")).toBeInTheDocument();
    expect(status).not.toHaveTextContent(/handed over the project|can't reopen/);
    unmount();
    answer("/api/dramas/d1/session-history", [...setupHistory, { id: "s1", scope: "setup", computer: "PC-1", state: "open", createdAt: "2026-10-30T09:30:00Z", startedFrom: "inputs", handedOver: false }]);
    answer("/api/sessions/s1/chat", { ...chat("s1", "", "steer"), messages: [] });
    const resumed = { ...stopped, status: "setup", setup: { state: "working", reached: 1 }, crew: [{ ...drama.crew[0], label: "PC-1", sessions: [{ id: "s1", name: "setup", role: "setup", state: "open", waiting: false }] }] } as unknown as DramaView;
    await renderAt(<AgentPanel drama={resumed} onCollapse={() => {}} />);
    const again = screen.getByRole("status");
    expect(await within(again).findByText(/Session 2, restarted from your screenplay\./)).toBeInTheDocument();
    expect(again).not.toHaveTextContent(/pack/);
  });

  it("shows a step and a message the agent gave in the same words, next to each other in either order, once, as the step", async () => {
    engine();
    const twice = chat("s1", "EP001", "steer");
    // In either order: replay sends the message first, then the step.
    twice.messages.push(
      { id: 4, kind: "activity", text: "Redrawing seg04's storyboard", at: "2026-10-30T10:03:00Z" },
      { id: 5, kind: "progress", text: "Redrawing seg04's storyboard", at: "2026-10-30T10:03:01Z" },
      { id: 6, kind: "progress", text: "Shooting another take of seg01", at: "2026-10-30T10:04:00Z" },
      { id: 7, kind: "activity", text: "Shooting another take of seg01", at: "2026-10-30T10:04:01Z" },
    );
    answer("/api/sessions/s1/chat", twice);
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    const said = await screen.findByRole("region", { name: "Conversation" });
    expect(await within(said).findAllByText("Redrawing seg04's storyboard")).toHaveLength(1);
    expect(within(said).getAllByText("Shooting another take of seg01")).toHaveLength(1);
    expect(within(said).getByText("Shooting another take of seg01").closest(".astep")).not.toBeNull();
  });

  it("is the conversation with one session and nothing else: Decisions, Recent work and Next have their own homes", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    expect(await screen.findByRole("region", { name: "Conversation" })).toHaveTextContent("Shooting the first take now.");
    for (const gone of ["Sessions", "Decisions", "Recent work"]) expect(screen.queryByRole("region", { name: gone })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Next" })).toBeNull();
  });

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

  it("reaches an episode whose Computer stopped from the picker, where its Resume is", async () => {
    const user = userEvent.setup();
    engine();
    const stopped = { ...drama, episodeRows: [row(1, "working"), row(2, "waiting"), row(3, "stopped")] } as unknown as DramaView;
    await renderAt(<AgentPanel drama={stopped} episode="EP001" onCollapse={() => {}} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Session" }), "EP003 · Computer stopped");
    expect(screen.getByRole("status")).toHaveTextContent("EP003's Computer stopped. Resume continues it in a new session with its files.");
    expect(within(screen.getByRole("status")).getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  it("while the maker has paused the project, says an episode stopped with it is paused, resumed from the top bar only (D74)", async () => {
    const user = userEvent.setup();
    engine();
    const paused = { ...drama, status: "stopped", setup: { state: "done", reached: 5, reason: "by-maker" }, crew: [], episodeRows: [row(1, "stopped"), row(2, "done"), row(3, "stopped")] } as unknown as DramaView;
    await renderAt(<AgentPanel drama={paused} episode="EP001" onCollapse={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Paused with the project. Resume it from the top bar.");
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    await user.selectOptions(screen.getByRole("combobox", { name: "Session" }), "EP003 · Paused");
    expect(screen.getByRole("status")).toHaveTextContent("Paused with the project. Resume it from the top bar.");
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Not submitted. Production is paused: resume it first. Your message is kept.");
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
    // The conversation is the log: the agent's steps in place, each a compact line, the newest turning while the session
    // works, then what it said; no separate process card.
    const said = await screen.findByRole("region", { name: "Conversation" });
    expect(await within(said).findByText("Shooting the first take now.")).toBeInTheDocument();
    expect([...said.querySelectorAll(".astep")].map((step) => step.textContent)).toEqual(["Compiled the video prompts", "Shooting seg01"]);
    expect(screen.queryByRole("button", { name: /· Process/ })).toBeNull();
    accept("/api/dramas/d1/messages", { id: "sub", sessionId: "s1", state: "sent" });
    await user.type(screen.getByRole("textbox", { name: "Message the agent" }), "Keep the letter in her left hand.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    // A message to the scope of the session in view, EP001's, under one submission id.
    const [sent] = calls("POST", "/api/dramas/d1/messages").map((call) => call.body as { scope: string; submissionId: string; text: string });
    expect(sent).toMatchObject({ scope: "EP001", text: "Keep the letter in her left hand." });
    expect(sent.submissionId).toMatch(/\S/);
  });

  it("sends the maker to the review a session waits on, once, from the status line, with no line to it", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    expect(await screen.findByRole("link", { name: "EP002's session waits for your review: open it" })).toHaveAttribute("href", "/r/r2");
    expect(screen.getAllByRole("link", { name: /review/ })).toHaveLength(1);
    expect(screen.queryByRole("textbox", { name: "Message the agent" })).toBeNull();
  });

  it("follows the episode in view, and the picker pins another until the maker picks the page again (IA draft E)", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    const scope = screen.getByRole("status");
    expect(await screen.findByRole("link", { name: "EP002's session waits for your review: open it" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Session" }), "EP001");
    expect(scope).toHaveTextContent("Pinned to EP001's session: working");
    // The process, the messages and the line all go with the pin.
    expect(await screen.findByText("To EP001's session")).toBeInTheDocument();
    expect(await within(screen.getByRole("region", { name: "Conversation" })).findByText("Shooting seg01")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Session" }), "EP002");
    expect(await screen.findByRole("link", { name: "EP002's session waits for your review: open it" })).toBeInTheDocument();
  });

  it("stops the episode it speaks to after the maker confirms, and only then", async () => {
    const user = userEvent.setup();
    engine();
    accept("/api/episodes/e1/stop");
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
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
  function Probe({ room = false }: { room?: boolean }) {
    const [mode, setMode] = useAgentMode(true, room);
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

  it("starts collapsed in the review room, keeps the maker's toggle there to the room, and gives back their choice on leaving (Codex rc3, C13)", async () => {
    const user = userEvent.setup();
    localStorage.setItem("studio.agent", "open");
    const { rerender } = await renderAt(<Probe room />);
    expect(screen.getByRole("button", { name: "closed" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "closed" }));
    expect(screen.getByRole("button", { name: "open" })).toBeInTheDocument();
    expect(localStorage.getItem("studio.agent")).toBe("open");
    await user.click(screen.getByRole("button", { name: "open" }));
    expect(localStorage.getItem("studio.agent")).toBe("open");
    rerender(<Probe />);
    expect(screen.getByRole("button", { name: "open" })).toBeInTheDocument();
    // Back in the room, it starts collapsed again.
    rerender(<Probe room />);
    expect(screen.getByRole("button", { name: "closed" })).toBeInTheDocument();
    localStorage.removeItem("studio.agent");
  });
});

describe("what drama-cli said, in the conversation (D70)", () => {
  const project = "/var/lib/sandbox/sessions/amber-grove-f3d957/files/drama";
  const cap = {
    code: "SetLimitExceeded.max_new_versions",
    message: `${project}/episodes/EP002/multi_panel_storyboard/seg06/line-art has had 3 new paid versions after its first, the limit defaults.max_new_versions (3); ask the person before making it again`,
    param: "defaults.max_new_versions",
    action: "ask_person" as const,
  };
  const asking = (stop: Partial<ChatStop>, sends: ChatView["sends"] = "answer"): ChatView => {
    const view = chat("s2", "EP002", sends);
    view.messages.push({ id: 4, kind: "question", text: "seg06 reached drama-cli's limit. Raise it once, or stop here?", at: "2026-10-30T10:03:00Z", stop: { reviewId: "r7", state: "open", refusals: [cap], project, ...stop } });
    return view;
  };

  it("is drama-cli's own message before the agent's question: its code, its first line from the project's folder, its whole words a click away", async () => {
    const user = userEvent.setup();
    engine();
    answer("/api/sessions/s2/chat", asking({}));
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    const said = await screen.findByLabelText("drama-cli said, SetLimitExceeded.max_new_versions");
    expect(said).toHaveClass("msg", "said");
    expect(within(said).getByText("Waiting for your answer")).toBeInTheDocument();
    // The code on its own line under the head, whole, never cut beside the chips (design 818aeca).
    const code = within(said).getByText("SetLimitExceeded.max_new_versions");
    expect(code).toHaveClass("saidcode");
    expect(code.closest(".saidhead")).toBeNull();
    // Cut at the first "; ", the project's folder left out, never reworded.
    expect(within(said).getByText("episodes/EP002/multi_panel_storyboard/seg06/line-art has had 3 new paid versions after its first, the limit defaults.max_new_versions (3)")).toBeInTheDocument();
    await user.click(within(said).getByText("What drama-cli said"));
    expect(within(said).getByText(cap.message)).toBeVisible();
    // Then the agent's question that carries it, and the line answers it.
    expect(said.nextElementSibling).toHaveTextContent("seg06 reached drama-cli's limit. Raise it once, or stop here?");
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveAttribute("placeholder", "Answer EP002's session…");
  });

  it("is history once its question ended or was answered", async () => {
    engine();
    answer("/api/sessions/s2/chat", asking({ state: "ended" }, "run"));
    const { unmount } = await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    const said = await screen.findByLabelText("drama-cli said, SetLimitExceeded.max_new_versions");
    expect(within(said).getByText("Ended")).toBeInTheDocument();
    expect(within(said).queryByText("Waiting for your answer")).toBeNull();
    unmount();
    answer("/api/sessions/s2/chat", asking({ state: "answered" }, "run"));
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    expect(within(await screen.findByLabelText("drama-cli said, SetLimitExceeded.max_new_versions")).getByText("Answered")).toBeInTheDocument();
  });

  it("says when the refusals the agent returned didn't read, and keeps the agent's question", async () => {
    engine();
    answer("/api/sessions/s2/chat", asking({ refusals: [], refusalsError: "The refusals, line 1: the line should be one JSON object." }));
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    expect(await screen.findByText("The agent returned drama-cli's refusals, but they didn't read: The refusals, line 1: the line should be one JSON object.")).toBeInTheDocument();
    expect(screen.getByText("seg06 reached drama-cli's limit. Raise it once, or stop here?")).toBeInTheDocument();
  });

  it("opens on the session a page names, its stop's message in view and focused: drama-cli's, else the agent's question", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    engine();
    answer("/api/sessions/s2/chat", asking({}));
    const { rerender, unmount } = await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    rerender(<AgentPanel drama={drama} episode="EP001" focus={{ scope: "EP002", reviewId: "r7", at: 1 }} onCollapse={() => {}} />);
    // Pinned to EP002, whose page this isn't, and at its message.
    await waitFor(() => expect(screen.getByLabelText("drama-cli said, SetLimitExceeded.max_new_versions")).toHaveFocus());
    expect(screen.getByRole("combobox", { name: "Session" })).toHaveValue("EP002");
    expect(scrolled).toHaveBeenCalledWith({ block: "center" });
    unmount();
    // A question drama-cli said nothing about is the agent's own message.
    answer("/api/sessions/s2/chat", asking({ refusals: [] }));
    await renderAt(<AgentPanel drama={drama} episode="EP001" focus={{ scope: "EP002", reviewId: "r7", at: 2 }} onCollapse={() => {}} />);
    await waitFor(() => expect(screen.getByText("seg06 reached drama-cli's limit. Raise it once, or stop here?").closest(".msg")).toHaveFocus());
  });

  it("answers the open question in the composer, with one file attached (D75)", async () => {
    const user = userEvent.setup();
    engine();
    answer("/api/sessions/s2/chat", asking({}));
    const stored = { ...file("drama/references/screenplay-v2.fountain", "2026-10-30T10:04:00Z"), id: 41, name: "screenplay-v2.fountain" };
    accept("/api/dramas/d1/references", stored);
    accept("/api/dramas/d1/messages", { id: "m1", sessionId: "s2", state: "sent" });
    await renderAt(<AgentPanel drama={drama} episode="EP002" onCollapse={() => {}} />);
    expect(await screen.findByRole("button", { name: "Attach a file" })).toHaveAttribute("title", "A screenplay or a picture, up to 20 MiB.");
    await user.upload(document.querySelector<HTMLInputElement>('.composer input[type="file"]')!, new File(["INT. ROOM - DAY"], "screenplay-v2.fountain", { type: "text/plain" }));
    expect(await screen.findByRole("button", { name: "Remove screenplay-v2.fountain" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attach a file" })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Raise it once.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls("POST", "/api/dramas/d1/messages")).toHaveLength(1));
    expect(calls("POST", "/api/dramas/d1/messages")[0]!.body).toEqual({ scope: "EP002", submissionId: expect.any(String), text: "Raise it once.", file: 41 });
  });

  it("offers no attachment when the message isn't an answer", async () => {
    engine();
    await renderAt(<AgentPanel drama={drama} episode="EP001" onCollapse={() => {}} />);
    expect(await screen.findByRole("textbox", { name: "Message the agent" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attach a file" })).toBeNull();
  });
});

describe("the agent ball", () => {
  it("says how many decisions wait, turns while an agent works, and opens the sidebar", async () => {
    const user = userEvent.setup();
    let opened = 0;
    await renderAt(<AgentBall waiting={4} asking={0} busy onOpen={() => opened++} />);
    const ball = screen.getByRole("button", { name: "Open the agent sidebar, 4 decisions waiting" });
    expect(ball).toHaveClass("busy");
    expect(ball).toHaveTextContent("4");
    await user.click(ball);
    expect(opened).toBe(1);
  });

  it("also says the questions waiting for an answer, and adds nothing to see", async () => {
    await renderAt(<AgentBall waiting={4} asking={2} busy={false} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "Open the agent sidebar, 4 decisions waiting, 2 waiting for your answer" })).toHaveTextContent(/^4$/);
  });
});

describe("Pause production", () => {
  it("says what is working now, asks first with the facts, and Keep working leaves it working", async () => {
    const user = userEvent.setup();
    accept("/api/dramas/d1/stop");
    await renderAt(<StopControl drama={drama} />);
    // Computer 1 runs EP001 at work: one Computer working. A pause, not a destructive action: no red button.
    const pause = screen.getByRole("button", { name: "Pause production" });
    expect(pause).toHaveAttribute("title", "1 Computer working");
    expect(pause).not.toHaveClass("danger");
    await user.click(pause);
    const dialog = screen.getByRole("alertdialog", { name: "Pause production of The Stepmother?" });
    expect(dialog).toHaveTextContent("The Computer working stops now; its work stops at its last saved pack. Nothing new starts and nothing more is billed. Nothing is deleted. Resume carries on from where each episode stopped.");
    await user.click(within(dialog).getByRole("button", { name: "Keep working" }));
    expect(calls("POST", "/api/dramas/d1/stop")).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Pause production" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "Pause production of The Stepmother?" })).getByRole("button", { name: "Pause production" }));
    expect(calls("POST", "/api/dramas/d1/stop")).toHaveLength(1);
  });

  it("says no Computer is running when every session waits on the maker", async () => {
    const waiting = { ...drama, crew: [{ ...drama.crew[0], sessions: drama.crew[0].sessions.map((session) => ({ ...session, waiting: true })) }] } as DramaView;
    await renderAt(<StopControl drama={waiting} />);
    expect(screen.getByRole("button", { name: "Pause production" })).toHaveAttribute("title", "No Computer running: work resumes when you answer a review");
  });

  it("says Pausing… while its Computers stop, and can't be pressed", async () => {
    const stopping = { ...drama, status: "stopped", crew: [{ ...drama.crew[0], state: "stopping" }] } as DramaView;
    await renderAt(<StopControl drama={stopping} />);
    expect(screen.getByRole("button", { name: "Pausing…" })).toBeDisabled();
  });

  it("once paused, is one state, Paused, with Resume", async () => {
    const user = userEvent.setup();
    accept("/api/dramas/d1/resume");
    const stopped = { ...drama, status: "stopped", crew: [] } as unknown as DramaView;
    await renderAt(<StopControl drama={stopped} />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(calls("POST", "/api/dramas/d1/resume")).toHaveLength(1);
  });

  it("has no control on a done project", async () => {
    const done = { ...drama, status: "done", crew: [] } as unknown as DramaView;
    await renderAt(<StopControl drama={done} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

