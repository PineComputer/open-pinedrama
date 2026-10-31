// The canvas (P6.2), used as a maker uses it: the series as one board, every item named as the
// bible names it with where it stands and its current picture, grouped by episode and scene, and
// moved about with zoom and fit. It only reads: nothing on it makes or changes an item.
import "../test/flow.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import { parseStatus, type ProjectView } from "../../shared/project.ts";
import type { DramaView, FileItem, SessionView } from "../../shared/types.ts";
import { changed } from "../test/live.ts";
import { http, HttpResponse } from "msw";
import { answer, calls, server } from "../test/server.ts";
import { Canvas } from "./Canvas.tsx";
import { href, renderAt } from "../test/router.tsx";

const fixture = (name: string) => JSON.parse(readFileSync(path.resolve("fixtures/status", `${name}.json`), "utf8"));
const lineageView = () => ({ lineage: parseLineage(JSON.parse(readFileSync(path.resolve("fixtures/lineage", "shot.json"), "utf8"))), problems: [] });
const session: SessionView = { id: "s1", name: "EP001", role: "episode", episode: "EP001", state: "open", waiting: false };
const drama = { id: "d1", title: "The Stepmother", crew: [{ id: "c1", label: "Computer 1", state: "running", idleTimeoutMinutes: 180, sessions: [session] }] } as unknown as DramaView;

function project(change?: (report: Record<string, any>) => void, names = true): ProjectView {
  const report = fixture("boards");
  change?.(report);
  const { budget: _budget, ...state } = parseStatus(report);
  return { state, sessions: [], problems: [], names: names ? parseBibleNames(fixture("bible")) : null };
}

const file = (id: number, filePath: string, createdAt = "2026-10-30T10:00:00Z") => ({ id, name: "image-1.png", path: filePath, type: "image/png", size: 1, kind: "look", url: `/f/${id}`, createdAt }) as unknown as FileItem;

function engine(view: ProjectView | null, files: FileItem[] = []) {
  answer("/api/dramas/d1/project", view ?? { state: null, sessions: [], problems: [], names: null });
  answer("/api/dramas/d1/files", files);
  answer("/api/dramas/d1/lineage", lineageView());
  answer("/api/dramas/d1/canvas/EP001", { positions: {} });
  answer("/api/dramas/d1/canvas/EP002", { positions: {} });
  answer("/api/dramas/d1/cast", []);
  answer("/api/dramas/d1/episodes/EP001", { segments: [], cuts: [], other: [] } as never);
}

describe("the canvas", () => {
  it("names every item as the bible does, never by its id", async () => {
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    const board = await screen.findByRole("region", { name: "Canvas" });
    expect(await within(board).findByRole("button", { name: /^林/ })).toBeInTheDocument();
    expect(within(board).getByRole("button", { name: /^办公室 · Day/ })).toBeInTheDocument();
    expect(within(board).queryByRole("button", { name: /^lin\b/ })).toBeNull();
  });

  it("says where each item stands, by drama-cli's lineage", async () => {
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    // The take's t01 isn't accepted, and no review of it is open: the next step is the agent's, so it says so, as the
    // Bible row does, and never waits for the maker. An accepted item carries no chip, as the prototype's.
    const take = await screen.findByRole("button", { name: /^Take · t01/ });
    await waitFor(() => expect(take).toHaveTextContent("t01 · not accepted"));
    expect(take).not.toHaveTextContent("Waiting for you");
    expect(screen.getByRole("button", { name: /^林$/ })).toBeInTheDocument();
  });

  it("waits for the maker only while a review of that very version is open; an approval drama-cli hasn't recorded is not accepted (D64; Codex rc5 C17)", async () => {
    engine(project());
    // EP001's page as the engine lists it: seg01's t01, returned to the maker in a review, open, then approved by them.
    const takeFile = { ...file(5, "/work/drama/episodes/EP001/segments/seg01/t01/video.mp4"), kind: "take", type: "video/mp4", version: "t01" };
    const reviewed = (state: string, verdict?: string) =>
      answer("/api/dramas/d1/episodes/EP001", { segments: [{ key: "seg01", boards: [], stills: [], takes: [{ turnId: "t1", files: [takeFile], review: { reviewId: "r1", kind: "takes", state, verdict, notes: [] } }] }], cuts: [], other: [] } as never);
    reviewed("open");
    const { unmount } = await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    const waiting = await screen.findByRole("button", { name: /^Take · t01/ });
    await waitFor(() => expect(waiting).toHaveTextContent("Waiting for you"));
    unmount();
    // The maker approved it; drama-cli's lineage still records t01 not accepted: the agent's step, so it doesn't wait for them.
    reviewed("answered", "approve");
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    const approved = await screen.findByRole("button", { name: /^Take · t01/ });
    await waitFor(() => expect(approved).toHaveTextContent("t01 · not accepted"));
    expect(approved).not.toHaveTextContent("Waiting for you");
  });

  it("shows each item's current picture, not an older one", async () => {
    engine(project(), [file(1, "/work/drama/assets/characters/lin/v0/image-1.png", "2026-10-30T09:00:00Z"), file(2, "/work/drama/assets/characters/lin/v1/image-1.jpg")]);
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    const lin = await screen.findByRole("button", { name: /^林/ });
    // The picture is the button's content, named by the button: decorative, so found by tag.
    await waitFor(() => expect(lin.closest(".cnode")!.querySelector("img")).toHaveAttribute("src", "/f/2"));
  });

  it("shows the file drama-cli's lineage shows for the version, never the spec.json or request.json beside it", async () => {
    const at = (id: number, name: string, kind: string, type: string) => ({ ...file(id, `/work/drama/assets/characters/lin/v1/${name}`, `2026-10-30T10:0${id}:00Z`), name, kind, type }) as unknown as FileItem;
    // Saved after the picture, so neither newest-first nor any file of the version would find it.
    engine(project(), [at(1, "image-1.jpg", "look", "image/jpeg"), at(2, "spec.json", "spec", "application/json"), at(3, "request.json", "request", "application/json")]);
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    const lin = await screen.findByRole("button", { name: /^林/ });
    await waitFor(() => expect(lin.closest(".cnode")!.querySelector("img")).toHaveAttribute("src", "/f/1"));
  });

  it("takes the new pictures as a turn's files are saved", async () => {
    engine(project(), [file(1, "/work/drama/assets/characters/lin/v1/image-1.jpg")]);
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    await screen.findByRole("button", { name: /^林/ });
    await waitFor(() => expect(calls("GET", "/api/dramas/d1/files")).toHaveLength(1));
    changed("drama:d1");
    await waitFor(() => expect(calls("GET", "/api/dramas/d1/files")).toHaveLength(2));
  });

  it("takes a new lineage as a stop returns one", async () => {
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    await screen.findByRole("button", { name: /^林/ });
    await waitFor(() => expect(calls("GET", "/api/dramas/d1/lineage")).toHaveLength(1));
    // The engine says a saved lineage changed the project (src/engine/lineage.ts), as Graph hears it.
    changed("project:d1");
    await waitFor(() => expect(calls("GET", "/api/dramas/d1/lineage")).toHaveLength(2));
  });

  it("follows the agent only while the episode's session is open, as the agent sidebar says, its live dot only while it works", async () => {
    engine(project());
    const { unmount } = await renderAt(<Canvas drama={drama} />, "/d/d1/e/EP001/canvas");
    const following = await screen.findByRole("button", { name: "Following the agent" });
    expect(following.querySelector(".live")).not.toBeNull();
    unmount();
    // The session waits for the maker: Follow stays, with no live dot.
    const waiting = await renderAt(<Canvas drama={{ ...drama, crew: [{ ...drama.crew[0], sessions: [{ ...session, waiting: true }] }] }} />, "/d/d1/e/EP001/canvas");
    expect((await screen.findByRole("button", { name: "Following the agent" })).querySelector(".live")).toBeNull();
    waiting.unmount();
    // No session open (an episode done): no live dot, no Follow, the sidebar's answer.
    await renderAt(<Canvas drama={{ ...drama, crew: [] }} />, "/d/d1/e/EP001/canvas");
    expect(await screen.findByRole("button", { name: "No agent at work on EP001" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Follow/ })).toBeNull();
    expect(document.querySelector(".ctop .live")).toBeNull();
  });

  it("keeps a long segment's shots in a card no taller than its row's pictures, the list scrolling inside when picked", async () => {
    const shot = { time: "0-2s", size: "close-up", angle: "eye level", camera: "Static.", visual: "林 looks up.", audio: "Room tone." };
    const breakdown = { id: 50, name: "breakdown.json", path: "/work/drama/episodes/EP001/breakdown/v1/breakdown.json", type: "application/json", size: 1, kind: "breakdown", episode: "EP001", url: "/f/50", createdAt: "2026-10-30T10:00:00Z" } as unknown as FileItem;
    engine(project(), [breakdown]);
    const thirteen = Array.from({ length: 13 }, (_, n) => ({ ...shot, time: `${2 * n}-${2 * n + 2}s` }));
    server.use(http.get("/f/50", () => HttpResponse.text(JSON.stringify({ episode: "EP001", title: "x", segments: [{ id: "seg01", dialogue: [{ speaker: "lin", line: "到了。" }], shots: thirteen.map((one, n) => (n === 0 ? { ...one, lines: [0] } : one)) }] }))));
    await renderAt(<Canvas drama={drama} />, "/d/d1/e/EP001/canvas");
    const card = (await screen.findByText("13 shots · 26 s")).closest(".react-flow__node") as HTMLElement;
    // drama-cli's HEIGHT at most (shared/layout.ts), however many shots: a long segment no longer pushes the board down.
    expect(Number.parseFloat(card.style.height)).toBeLessThanOrEqual(340);
    expect(card.querySelectorAll(".srows li")).toHaveLength(13);
    // Picked, the list scrolls inside: React Flow leaves a wheel or drag on a nowheel, nodrag element to the element.
    const user = userEvent.setup();
    within(card).getByRole("button", { name: "Shots" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(card.querySelector(".srows")).toHaveClass("nowheel", "nodrag"));
    // The whole shot, its lines included, in the panel's Details.
    const panel = await screen.findByRole("region", { name: /what it is made from/ });
    await user.click(within(panel).getByRole("button", { name: "Details" }));
    expect(within(panel).getByRole("region", { name: "Details" })).toHaveTextContent("lin: 到了。");
  });

  it("heads the episode with its script, opened at that episode, and its cut, opened at its home (D66)", async () => {
    engine(project());
    // The episode's cut, as drama-cli's lineage records a built cut (lineage.KINDS: cut, episodes/<EP>/edit) waiting for the maker.
    const view = lineageView();
    const take = view.lineage.nodes.find((node) => node.kind === "take")!;
    view.lineage.nodes.push({ ...take, id: "episodes/EP001/edit", kind: "cut", version: "v1", accepted: null, shows: "episodes/EP001/edit/v1/cut.mp4", label: "EP001 cut", section: "EP001 cut", where: { episode: "EP001" } });
    answer("/api/dramas/d1/lineage", view);
    // Where the tree says the cut stands: the episode board's row (labels.ts cutStanding), here waiting for the maker.
    const rowWith = (state: string) => ({ id: "e1", number: 1, code: "EP001", title: "", state: "waiting", stages: { cut: { state } } });
    const { unmount } = await renderAt(<Canvas drama={{ ...drama, episodeRows: [rowWith("review")] } as DramaView} />, "/d/d1/e/EP001/canvas");
    expect(await screen.findByRole("link", { name: "Episode script" })).toHaveAttribute("href", "/d/d1/script?ep=EP001");
    const cut = await screen.findByRole("link", { name: /^Cut v1/ });
    expect(cut).toHaveAttribute("href", "/d/d1/e/EP001/cut?item=episodes%2FEP001%2Fedit");
    expect(cut).toHaveTextContent("Waiting for you");
    unmount();
    // Accepted on the board, though v1's review was once open: the head says what the tree says, its accepted version, no chip.
    view.lineage.nodes.find((node) => node.id === "episodes/EP001/edit")!.accepted = "v1";
    answer("/api/dramas/d1/lineage", view);
    await renderAt(<Canvas drama={{ ...drama, episodeRows: [rowWith("done")] } as DramaView} />, "/d/d1/e/EP001/canvas");
    const accepted = await screen.findByRole("link", { name: /^Cut v1/ });
    expect(accepted).not.toHaveTextContent("Waiting for you");
    expect(accepted.querySelector(".st")).toBeNull();
  });

  it("starts each segment's group with its shots from drama-cli's breakdown.json, wired to the stages that read it (D66)", async () => {
    const shot = { time: "0-3s", size: "wide shot", angle: "eye level", camera: "Static wide shot.", visual: "林 walks into the office.", audio: "Room tone." };
    const breakdown = { id: 50, name: "breakdown.json", path: "/work/drama/episodes/EP001/breakdown/v1/breakdown.json", type: "application/json", size: 1, kind: "breakdown", episode: "EP001", url: "/f/50", createdAt: "2026-10-30T10:00:00Z" } as unknown as FileItem;
    engine(project(), [breakdown]);
    server.use(http.get("/f/50", () => HttpResponse.text(JSON.stringify({ episode: "EP001", title: "x", segments: [{ id: "seg01", dialogue: [], shots: [shot, { ...shot, time: "3-7s", visual: "She stops." }] }] }))));
    await renderAt(<Canvas drama={drama} />, "/d/d1/e/EP001/canvas");
    const group = await screen.findByRole("group", { name: "EP001 seg01 · INT. OFFICE - DAY" });
    const shots = (await screen.findByText("2 shots · 7 s")).closest(".react-flow__node") as HTMLElement;
    // One line a shot: its time, size and what is seen.
    expect(shots).toHaveTextContent("0-3s · wide shot · 林 walks into the office.");
    expect(shots).toHaveTextContent("3-7s · wide shot · She stops.");
    // First in its segment's group, left of drama-cli's stages.
    const x = (node: Element) => Number((node as HTMLElement).style.transform.match(/translate\((-?[\d.]+)px/)![1]);
    const storyboard = screen.getByRole("button", { name: /^Storyboard · line-art/ }).closest(".react-flow__node")!;
    expect(x(shots)).toBeLessThan(x(storyboard));
    expect(group).toBeInTheDocument();
    // Wired only where drama-cli recorded that a stage read the breakdown.
    expect(document.querySelector('.react-flow__edge[data-id="shots:EP001 seg01>episodes/EP001/multi_panel_storyboard/seg01/line-art"]')).not.toBeNull();
  });

  it("shows of the shared looks, plates and props only those the episode's stages were made from, where drama-cli put them", async () => {
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    const board = await screen.findByRole("region", { name: "Canvas" });
    // The office's Day plate went into the take; its base plate went into nothing of EP001's.
    expect(await within(board).findByRole("button", { name: /^办公室 · Day/ })).toBeInTheDocument();
    expect(within(board).queryByRole("button", { name: /^办公室$/ })).toBeNull();
  });

  it("shows one episode in drama-cli's groups: the cast, the places, and its segments, each with its scene", async () => {
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    expect(await screen.findByRole("group", { name: "EP001 seg01 · INT. OFFICE - DAY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Storyboard · line-art/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Characters" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Locations" })).toBeInTheDocument();
    // drama-cli's Text group, the bible and the breakdowns, stays off the board.
    expect(screen.queryByRole("group", { name: "Text" })).toBeNull();
    expect(screen.getByRole("button", { name: /^EP001 · x/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^林/ })).toBeInTheDocument();
  });

  it("shows the episode chosen elsewhere, and moves between episodes with its switcher", async () => {
    const user = userEvent.setup();
    engine(project((report) => {
      report.episodes.EP002 = { ...report.episodes.EP001, scene_chains: [{ scene_heading: "EXT. YARD - NIGHT #2-1#", segments: ["seg01"] }] };
    }));
    const { router } = await renderAt(<Canvas drama={drama} />, "/d/d1/e/EP002/canvas");
    // EP002 has made nothing yet, so nothing of EP001's, nor the references EP001 used, stands on its board.
    expect(await screen.findByRole("button", { name: "Next episode" })).toBeDisabled();
    expect(screen.queryByRole("group", { name: "EP001 seg01 · INT. OFFICE - DAY" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Characters" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Previous episode" }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/e/EP001/canvas"));
    expect(await screen.findByRole("group", { name: "EP001 seg01 · INT. OFFICE - DAY" })).toBeInTheDocument();
  });

  it("offers the prototype's zoom pill, named in the maker's words, and the minimap it can hide", async () => {
    const user = userEvent.setup();
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    const pill = await screen.findByRole("toolbar", { name: "Canvas" });
    for (const name of ["Zoom in", "Zoom out", "Fit the board", "Lay out again"]) expect(within(pill).getByRole("button", { name })).toBeInTheDocument();
    // Named with the zoom it shows, so the visible "96%" is part of its name (WCAG 2.5.3).
    const zoom = within(pill).getByRole("button", { name: /^Zoom \d+%$/ });
    expect(zoom.getAttribute("aria-label")).toContain(zoom.textContent!);
    // Shown, as the design shows it; the pill hides it.
    expect(screen.getByRole("img", { name: "Minimap: move the view" })).toBeInTheDocument();
    await user.click(within(pill).getByRole("button", { name: "Minimap: move the view" }));
    expect(screen.queryByRole("img", { name: "Minimap: move the view" })).toBeNull();
  });

  it("opens in Hand, so a drag moves the board, and switches to Move and back from the tool menu and with V and H", async () => {
    const user = userEvent.setup();
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    const tool = await screen.findByRole("button", { name: "Tool" });
    expect(tool).toHaveAttribute("title", "Hand");
    await user.click(tool);
    await user.click(await screen.findByRole("menuitemradio", { name: /Move/ }));
    expect(tool).toHaveAttribute("title", "Move");
    await user.keyboard("h");
    await waitFor(() => expect(tool).toHaveAttribute("title", "Hand"));
    await user.keyboard("v");
    await waitFor(() => expect(tool).toHaveAttribute("title", "Move"));
  });

  it("zooms to a preset from the zoom menu", async () => {
    const user = userEvent.setup();
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    const zoom = await screen.findByRole("button", { name: /^Zoom \d+%$/ });
    await user.click(zoom);
    for (const name of ["Zoom in", "Zoom out", "Fit the board", "Zoom to 50%", "Zoom to 100%", "Zoom to 800%"]) expect(screen.getByRole("menuitem", { name: new RegExp(name) })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Zoom, in percent" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /Zoom to 100%/ }));
    await waitFor(() => expect(zoom).toHaveTextContent("100%"));
  });

  it("lists its shortcuts under ? and on the ? key, the edit keys left for phase 2", async () => {
    const user = userEvent.setup();
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    await user.click(await screen.findByRole("button", { name: "Shortcuts" }));
    const list = await screen.findByRole("alertdialog", { name: "Canvas shortcuts" });
    expect(list).toHaveTextContent(/V.*Move.*H.*Hand.*Space \+ drag.*⌘ A.*Pick every item.*Esc/);
    expect(list).toHaveTextContent("Copy, paste, delete, group and undo come with phase 2");
    await user.click(within(list).getByRole("button", { name: "Close" }));
    await user.keyboard("?");
    expect(await screen.findByRole("alertdialog", { name: "Canvas shortcuts" })).toBeInTheDocument();
  });

  it("picks every item on ⌘A, with no single panel, and lets go on Esc", async () => {
    const user = userEvent.setup();
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    await screen.findByRole("button", { name: /^林/ });
    await user.keyboard("{Meta>}a{/Meta}");
    await waitFor(() => expect(document.querySelectorAll(".cnode.sel").length).toBeGreaterThan(1));
    expect(screen.queryByRole("region", { name: /what it is made from/ })).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.querySelectorAll(".cnode.sel")).toHaveLength(0));
  });

  it("points to what waits for the maker, beside the agent", async () => {
    engine(project());
    await renderAt(<Canvas drama={{ ...drama, waiting: 3 } as DramaView} />, "/d/d1/canvas");
    expect(await screen.findByRole("link", { name: "3 waiting for you" })).toHaveAttribute("href", "/reviews?drama=d1");
  });

  it("offers no way to make, change or draw an item", async () => {
    engine(project());
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    await screen.findByRole("region", { name: "Canvas" });
    const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent ?? "");
    expect(names.filter((name) => /generate|regenerate|redo|edit|draw|prompt|new item|add/i.test(name))).toEqual([]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says what will appear before the agent has reported", async () => {
    engine(null);
    await renderAt(<Canvas drama={drama} />, "/d/d1/canvas");
    expect(await screen.findByRole("heading", { name: "The board fills in as the agent works" })).toBeInTheDocument();
  });
});
