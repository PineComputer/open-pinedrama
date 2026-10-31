// The studio's URLs (routes.tsx, place.ts): a drama page's place keeps its episode and item apart, so switching view
// keeps both and an asset's id is never taken for an episode (Codex's IA review, B1); a link lands on the item's one
// home (IA §16); a URL that names an episode or item the drama can't have says so (Codex's rebuttal, IA §14.1).
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DramaView } from "../shared/types.ts";
import { homeLink, type Place, placeLink } from "./place.ts";
import { studioRouter } from "./routes.tsx";
import { answer } from "./test/server.ts";

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
    ["an episode's storyboard", { episode: "EP006", item: "episodes/EP006/multi_panel_storyboard/seg01/line-art" }, "/d/d1/e/EP006/list?item=episodes%2FEP006%2Fmulti_panel_storyboard%2Fseg01%2Fline-art"],
    ["an episode's cut", { episode: "EP006", item: "episodes/EP006/edit" }, "/d/d1/e/EP006/cut?item=episodes%2FEP006%2Fedit"],
  ])("keeps %s picked from Lineage to Canvas and to its home", (_, picked, home) => {
    expect(hrefOf({ dramaId: "d1", surface: "lineage", ...picked })).toBe(`${home}${home.includes("?") ? "&" : "?"}view=lineage`);
    expect(hrefOf({ dramaId: "d1", surface: "canvas", ...picked })).toBe(
      `/d/d1/${picked.episode ? `e/${picked.episode}/` : ""}canvas?item=${encodeURIComponent(picked.item)}`,
    );
    expect(hrefOf({ dramaId: "d1", surface: "list", ...picked })).toBe(home);
  });

  it("opens an episode on its List, and Lineage with nothing picked on the drama's Out of date", () => {
    expect(hrefOf({ dramaId: "d1", surface: "list", episode: "EP002" })).toBe("/d/d1/e/EP002/list");
    expect(hrefOf({ dramaId: "d1", surface: "list" })).toBe("/d/d1/episodes");
    expect(hrefOf({ dramaId: "d1", surface: "lineage" })).toBe("/d/d1/out-of-date");
  });

  it("refuses to build a home for what is no stage of drama-cli's", () => {
    expect(() => homeLink("d1", "assets/characters")).toThrow("no stage folder");
  });
});

describe("the routes", () => {
  it("open a drama on its Episodes, and an episode on its List", async () => {
    expect((await load("/d/d1")).location.pathname).toBe("/d/d1/episodes");
    expect((await load("/d/d1/e/EP002?item=episodes%2FEP002%2Fbreakdown")).location.href).toBe("/d/d1/e/EP002/list?item=episodes%2FEP002%2Fbreakdown");
  });

  it.each([
    ["an episode code that isn't drama-cli's", "/d/d1/e/EP2/list"],
    ["an item that is no stage", "/d/d1/episodes?item=ivy"],
    ["another episode's item", "/d/d1/e/EP002/list?item=episodes%2FEP003%2Fbreakdown"],
    ["a view the studio hasn't", "/d/d1/episodes?view=grid"],
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
    episodeRows: [{ id: "e1", number: 1, code: "EP001", title: "", state: "working", stages: {}, spent: { total: 0, media: 0, partial: false }, updatedAt: "2026-10-30T10:00:00Z" }],
  } as unknown as DramaView;

  function engine() {
    answer("/api/app", { mode: "replay", version: "0.3.0", dataDir: "/data", stopping: 0 });
    answer("/api/inbox", []);
    answer("/api/dramas", []);
    answer("/api/dramas/d1", drama);
    answer("/api/dramas/d1/lineage", { lineage: { nodes: [], links: [], groups: [] }, problems: [] });
  }

  it.each([
    ["an episode", "/d/d1/e/EP009/list", "EP009"],
    ["an item", "/d/d1/e/EP001/list?item=episodes%2FEP001%2Fbreakdown", "episodes/EP001/breakdown"],
    ["an asset", "/d/d1/assets/characters/ivy", "ivy"],
  ])("says when the drama has no such %s, with the way back to it", async (_, path, what) => {
    engine();
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: [path] }))} />);
    expect(await screen.findByText(`This drama has no ${what}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the drama" })).toHaveAttribute("href", "/d/d1/episodes");
  });

  it("says Not found for a path the studio has no page for, never falling back to Home", async () => {
    engine();
    render(<RouterProvider router={studioRouter(createMemoryHistory({ initialEntries: ["/d/d1/graph"] }))} />);
    expect(await screen.findByText("The studio has no page at /d/d1/graph.")).toBeInTheDocument();
  });
});
