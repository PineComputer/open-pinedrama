// The studio's URLs (routes.tsx, place.ts): a drama page's place keeps its episode and item apart, so switching view
// keeps both and an asset's id is never taken for an episode (Codex's IA review, B1); a link lands on the item's one
// home (IA §16); a URL that names an episode or item the drama can't have says so (Codex's rebuttal, IA §14.1).
import "./test/flow.ts";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage } from "../shared/lineage.ts";
import { parseStatus } from "../shared/project.ts";
import type { DramaView } from "../shared/types.ts";
import { homeLink, type Place, placeLink } from "./place.ts";
import { studioRouter } from "./routes.tsx";
import { answer, calls } from "./test/server.ts";

const router = studioRouter(createMemoryHistory());
const hrefOf = (place: Place) => router.buildLocation(placeLink(place)).href;

async function load(path: string) {
  const at = studioRouter(createMemoryHistory({ initialEntries: [path] }));
  await at.load();
  return at.state;
}

describe("a drama page's place", () => {
  it.each<[string, { episode?: string; item: string }, string]>([
    ["a character", { item: "assets/characters/ivy" }, "/d/d1/assets/characters/ivy"],
    ["a location's time", { item: "assets/scenes/cell/times/Night" }, "/d/d1/assets/locations/cell?item=assets%2Fscenes%2Fcell%2Ftimes%2FNight"],
    ["an episode's storyboard", { episode: "EP006", item: "episodes/EP006/multi_panel_storyboard/seg01/line-art" }, "/d/d1/e/EP006/canvas?item=episodes%2FEP006%2Fmulti_panel_storyboard%2Fseg01%2Fline-art"],
    ["an episode's cut", { episode: "EP006", item: "episodes/EP006/edit" }, "/d/d1/e/EP006/cut?item=episodes%2FEP006%2Fedit"],
  ])("keeps %s picked from Lineage to Canvas and to its home", (_, picked, home) => {
    expect(hrefOf({ dramaId: "d1", surface: "lineage", ...picked })).toBe(`${home}${home.includes("?") ? "&" : "?"}view=lineage`);
    expect(hrefOf({ dramaId: "d1", surface: "canvas", ...picked })).toBe(
      `/d/d1/${picked.episode ? `e/${picked.episode}/` : ""}canvas?item=${encodeURIComponent(picked.item)}`,
    );
    expect(router.buildLocation(homeLink("d1", picked.item)).href).toBe(home);
  });

  it.each<[string, Place, string]>([
    ["a storyboard on its Canvas", { dramaId: "d1", surface: "canvas", episode: "EP006", item: "episodes/EP006/multi_panel_storyboard/seg03/line-art", version: "v1" }, "/d/d1/e/EP006/canvas?item=episodes%2FEP006%2Fmulti_panel_storyboard%2Fseg03%2Fline-art&version=v1"],
    ["Canvas", { dramaId: "d1", surface: "canvas", episode: "EP006", item: "episodes/EP006/segments/seg03", version: "t02" }, "/d/d1/e/EP006/canvas?item=episodes%2FEP006%2Fsegments%2Fseg03&version=t02"],
    ["Lineage", { dramaId: "d1", surface: "lineage", item: "episodes/EP006/edit", version: "v1" }, "/d/d1/e/EP006/cut?item=episodes%2FEP006%2Fedit&version=v1&view=lineage"],
  ])("keeps the version a link names on %s (Codex round 3, fix 3)", (_, place, href) => {
    expect(hrefOf(place)).toBe(href);
  });

  it("keeps the version a link names on a character's home", () => {
    expect(router.buildLocation(homeLink("d1", "assets/characters/ivy", "canvas", "v2")).href).toBe("/d/d1/assets/characters/ivy?item=assets%2Fcharacters%2Fivy&version=v2");
  });

  it("opens an episode on its Canvas, its only view (D66), and Lineage with nothing picked on the drama's Out of date", () => {
    expect(hrefOf({ dramaId: "d1", surface: "canvas", episode: "EP002" })).toBe("/d/d1/e/EP002/canvas");
    expect(hrefOf({ dramaId: "d1", surface: "canvas" })).toBe("/d/d1/canvas");
    expect(hrefOf({ dramaId: "d1", surface: "lineage" })).toBe("/d/d1/out-of-date");
  });

  it("refuses to build a home for what is no stage of drama-cli's", () => {
    expect(() => homeLink("d1", "assets/characters")).toThrow("no stage folder");
  });
});

describe("the routes", () => {
  it("open a drama on its Episodes, and an episode on its List", async () => {
    expect((await load("/d/d1")).location.pathname).toBe("/d/d1/episodes");
    expect((await load("/d/d1/e/EP002?item=episodes%2FEP002%2Fbreakdown")).location.href).toBe("/d/d1/e/EP002/canvas?item=episodes%2FEP002%2Fbreakdown");
  });

  it.each([
    ["an episode code that isn't drama-cli's", "/d/d1/e/EP2/canvas"],
    ["an item that is no stage", "/d/d1/episodes?item=ivy"],
    ["another episode's item", "/d/d1/e/EP002/canvas?item=episodes%2FEP003%2Fbreakdown"],
    ["a view the studio hasn't", "/d/d1/episodes?view=grid"],
    ["a version that isn't drama-cli's", "/d/d1/e/EP006/canvas?item=episodes%2FEP006%2Fsegments%2Fseg03&version=latest"],
    ["a version of no item", "/d/d1/e/EP006/canvas?version=t02"],
    ["a script at an episode code that isn't drama-cli's", "/d/d1/script?ep=EP2"],
  ])("say Not found for %s", async (_, path) => {
    expect((await load(path)).matches.some((match) => match.status === "notFound")).toBe(true);
  });
});

describe("a drama's page", () => {
  const drama = {
    id: "d1",
    mode: "replay",
    title: "The Stepmother",
    status: "production",
    spent: { total: 0, media: 0 },
    waiting: 0,
    episodes: { total: 1, done: 0, waiting: 0, working: 1 },
    setup: { state: "done", reached: 5 },
    cast: [],
    crew: [],
    episodeRows: [{ id: "e1", number: 1, code: "EP001", title: "", state: "working", stages: { cut: { state: "none" } }, spent: { total: 0, media: 0, partial: false }, updatedAt: "2026-10-30T10:00:00Z" }],
  } as unknown as DramaView;

  function engine() {
    answer("/api/app", { mode: "replay", version: "0.3.0", dataDir: "/data", stopping: 0 });
    answer("/api/reviews", []);
    answer("/api/dramas", []);
    answer("/api/dramas/d1", drama);
    answer("/api/dramas/d1/lineage", { lineage: { nodes: [], links: [], groups: [] }, problems: [] });
  }

  it.each([
    ["an episode", "/d/d1/e/EP009/canvas", "EP009"],
    ["an item", "/d/d1/e/EP001/canvas?item=episodes%2FEP001%2Fbreakdown", "episodes/EP001/breakdown"],
    ["an asset", "/d/d1/assets/characters/ivy", "ivy"],
  ])("says when the drama has no such %s, with the way back to it", async (_, path, what) => {
    board();
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: [path] }))} />);
    expect(await screen.findByText(`This project has no ${what}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the project" })).toHaveAttribute("href", "/d/d1/episodes");
  });

  it("opens Script at the screenplay version that waits, before drama-cli's lineage has a screenplay (box-ci, sample-drama)", async () => {
    engine();
    answer("/api/dramas/d1/lineage", { lineage: null, problems: [] });
    answer("/api/dramas/d1/script", { inputs: [], screenplayFile: null, versions: [{ version: "v1", question: { reviewId: "r1", state: "open" } }] });
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: ["/d/d1/script?item=screenplay&version=v1"] }))} />);
    expect(await screen.findByRole("group", { name: "Your decision on v1" })).toBeInTheDocument();
    expect(screen.queryByText(/This project has no/)).not.toBeInTheDocument();
  });

  it("says what drama-cli recorded of the screenplay and the bible, not a rewrite, while the setup runs bible after v1 is accepted (D64; Codex rc5 C14)", async () => {
    engine();
    // rc5 T1: v1 accepted (drama-cli's lineage), the setup working on `bible`, whose v1 status says is not accepted yet.
    answer("/api/dramas/d1", { ...drama, status: "setup", episodes: { total: 0, done: 0, waiting: 0, working: 0 }, setup: { state: "working", reached: 1 }, episodeRows: [] });
    answer("/api/dramas/d1/lineage", { lineage: { nodes: [{ id: "screenplay", kind: "screenplay", version: "v1", accepted: "v1", fresh: true, where: {} }], links: [], groups: [] }, problems: [] });
    answer("/api/dramas/d1/project", { state: { bible: { current: "v1", candidate: "v1", accepted: null, usable: false, run: [], errors: [] }, characters: {}, locations: {}, props: {}, episodes: {} }, sessions: [], problems: [], names: null });
    answer("/api/dramas/d1/cast", []);
    answer("/api/dramas/d1/script", { inputs: [], screenplayFile: null, versions: [{ version: "v1", question: { reviewId: "r1", state: "answered", words: "Yes.", verdict: "approve" } }] });
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: ["/d/d1/script"] }))} />);
    const tree = await screen.findByRole("navigation", { name: drama.title });
    await waitFor(() => expect(screen.getByRole("link", { name: /^Script/ })).toHaveTextContent("ScriptAccepted"));
    await waitFor(() => expect(screen.getByRole("link", { name: /^Bible/ })).toHaveTextContent("Biblev1 · not accepted"));
    expect(tree).not.toHaveTextContent("Rewriting");
    expect(screen.getByRole("region", { name: "Versions" })).not.toHaveTextContent(/v2|rewriting/);
  });

  it.each([
    ["a screenplay version drama-cli didn't record", "/d/d1/script?item=screenplay&version=v9", "screenplay v9"],
    ["another item on Script", "/d/d1/script?item=bible", "bible"],
  ])("says Script has no %s", async (_, path, what) => {
    engine();
    answer("/api/dramas/d1/script", { inputs: [], screenplayFile: null, versions: [{ version: "v1" }] });
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: [path] }))} />);
    expect(await screen.findByText(`This project has no ${what}.`)).toBeInTheDocument();
  });

  it("ends an asset's crumbs at the version in view, the one the URL names, else drama-cli's working one (D26, D48; QA J1)", async () => {
    engine();
    answer("/api/dramas/d1/lineage", { lineage: { nodes: [{ id: "assets/characters/luca", kind: "look", where: { subject: "luca" } }], links: [], groups: [] }, problems: [] });
    answer("/api/dramas/d1/project", { state: { bible: null, characters: { luca: { current: "v2", accepted: "v2" } }, locations: {}, props: {}, episodes: {} }, sessions: [], problems: [], names: null });
    answer("/api/dramas/d1/cast", []);
    const crumbs = () => screen.getByRole("navigation", { name: "Where this belongs" });
    const at = async (path: string) => {
      render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: [path] }))} />);
      return waitFor(() => expect(crumbs().textContent).toMatch(/luca · v\d$/));
    };
    await at("/d/d1/assets/characters/luca");
    expect(crumbs().textContent).toMatch(/luca · v2$/);
    cleanup();
    await at("/d/d1/assets/characters/luca?item=assets%2Fcharacters%2Fluca&version=v1");
    expect(crumbs().textContent).toMatch(/luca · v1$/);
  });

  it("opens an asset page from what it has when drama-cli's lineage couldn't be read, and says why, never that the asset is missing (Codex rc3, C12)", async () => {
    engine();
    answer("/api/dramas/d1/lineage", { lineage: null, problems: [{ sessionId: "s1", turnId: "t1", error: "drama-cli's lineage: nodes.0.properties.problems should be present." }] });
    answer("/api/dramas/d1/project", { state: { bible: null, characters: { luca: { current: "v2", accepted: "v2" } }, locations: {}, props: {}, episodes: {} }, sessions: [], problems: [], names: null });
    answer("/api/dramas/d1/cast", []);
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: ["/d/d1/assets/characters/luca"] }))} />);
    expect(await screen.findByText("drama-cli's lineage couldn't be read: drama-cli's lineage: nodes.0.properties.problems should be present.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Where this belongs" }).textContent).toMatch(/luca/));
    expect(screen.queryByText(/This project has no/)).not.toBeInTheDocument();
  });

  it("has the project's lineage before a pick names an item, so the page isn't swapped for Loading (and the board remounted)", async () => {
    engine();
    answer("/api/dramas/d1/lineage", { lineage: { nodes: [{ id: "episodes/EP001/breakdown" }], links: [], groups: [] }, problems: [] });
    const router = studioRouter(createMemoryHistory({ initialEntries: ["/d/d1/e/EP001/canvas"] }));
    render(<RouterProvider router={router} />);
    const board = await screen.findByText("The board fills in as the agent works");
    await waitFor(() => expect(calls("GET", "/api/dramas/d1/lineage").length).toBeGreaterThan(0));
    // A pick writes ?item, as Canvas does: the same board stays, never swapped for Loading and drawn anew.
    await router.navigate({ to: "/d/$dramaId/e/$episodeCode/canvas", params: { dramaId: "d1", episodeCode: "EP001" }, search: { item: "episodes/EP001/breakdown" }, replace: true });
    expect(screen.getByText("The board fills in as the agent works")).toBe(board);
  });

  // The Canvas's board: drama-cli's lineage of EP001 (seg01's blocking, first frame, storyboard and take, the plate
  // at Day) and the shots node the Canvas builds for seg01 (D66).
  function board() {
    engine();
    const status = JSON.parse(readFileSync(path.resolve("fixtures/status", "boards.json"), "utf8"));
    const { budget: _budget, ...state } = parseStatus(status);
    answer("/api/dramas/d1/project", { state, sessions: [], problems: [], names: null });
    answer("/api/dramas/d1/files", []);
    answer("/api/dramas/d1/lineage", { lineage: parseLineage(JSON.parse(readFileSync(path.resolve("fixtures/lineage", "shot.json"), "utf8"))), problems: [] });
    answer("/api/dramas/d1/canvas/EP001", { positions: {} });
  }

  it.each([
    ["a segment's shots, the Canvas's own node (D66)", "shots:EP001 seg01"],
    ["a plate at a time of day", "assets/scenes/office/times/Day"],
    ["a first-frame reference", "episodes/EP001/first_frame_reference/seg01"],
  ])("opens the Canvas with %s picked, never Not found", async (_, item) => {
    board();
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: [`/d/d1/e/EP001/canvas?item=${encodeURIComponent(item)}`] }))} />);
    await waitFor(() => expect(document.querySelector(`.react-flow__node[data-id="${item}"]`)).toHaveClass("selected"));
    expect(screen.queryByText(/This project has no/)).toBeNull();
  });

  it("says Not found for an item that is no node of the Canvas's board", async () => {
    board();
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: [`/d/d1/e/EP001/canvas?item=${encodeURIComponent("shots:EP001 seg09")}`] }))} />);
    expect(await screen.findByText("This project has no shots:EP001 seg09.")).toBeInTheDocument();
  });

  it("says Not found for a path the studio has no page for, never falling back to Home", async () => {
    engine();
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: ["/d/d1/graph"] }))} />);
    expect(await screen.findByText("The studio has no page at /d/d1/graph.")).toBeInTheDocument();
  });
});
