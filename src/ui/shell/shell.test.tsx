// The shell, used as a maker uses it, on a drama in production with episodes in each state: the
// studio-wide rail, the project tree with its counts, the episode tree and where the project stands, the
// top bar with the breadcrumb and the next review, and the drama's bar with Back to, an episode's
// views and its chips.
import { screen, waitFor, within } from "@testing-library/react";
import { answer } from "../test/server.ts";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { type DramaView, type EpisodeRow, type ReviewSummary, STAGES } from "../../shared/types.ts";
import { NavRail } from "./NavRail.tsx";
import { DramaSidebar } from "./Sidebar.tsx";
import { DramaBar, TopBar } from "./TopBar.tsx";
import { href, renderAt } from "../test/router.tsx";
import { linkOptions } from "@tanstack/react-router";

function row(number: number, state: EpisodeRow["state"]): EpisodeRow {
  const code = `EP00${number}`;
  return { id: `e${number}`, number, code, title: `Episode ${number}`, state, stages: Object.fromEntries(STAGES.map((stage) => [stage, { state: "none" }])) as EpisodeRow["stages"], spent: { total: 0, media: 0, partial: false }, updatedAt: "2026-10-30T10:00:00Z", ...(state === "waiting" ? { waitingFor: "storyboards" as const, waitingItems: 6 } : {}) };
}

const drama = {
  id: "d1",
  mode: "pine",
  title: "The Stepmother",
  format: "9:16, 480p",
  preset: "en-us-live-sfw",
  status: "production",
  spent: { total: 41.2, media: 30 },
  waiting: 1,
  episodes: { total: 4, done: 1, waiting: 1, working: 1 },
  setup: { state: "done", reached: 5 },
  cast: [],
  parallel: 2,
  perComputer: 1,
  episodeRows: [row(1, "waiting"), row(2, "working"), row(3, "done"), row(4, "queued")],
} as unknown as DramaView;

function review(id: string): ReviewSummary {
  return { id, dramaId: "d1", dramaTitle: "The Stepmother", kind: "storyboards", state: "open", question: "", items: 1, subjects: ["seg01"], createdAt: "2026-10-30T10:00:00Z" };
}

describe("the drama's bar", () => {
  it("reads its spend against drama-cli's budget, as the design's chip does", async () => {
    const budget = { budgetUsd: 1000, spentUsd: 0, reservedUsd: 0, remainingUsd: 1000 };
    answer("/api/dramas/d1/project", { state: null, sessions: [{ budget }], problems: [], names: null });
    const { router } = await renderAt(<DramaBar drama={drama} />, "/d/d1/episodes");
    expect(await screen.findByText("of $1,000")).toBeInTheDocument();
  });

  it("shows the drama's preset, format and what it has spent", async () => {
    const { router } = await renderAt(<DramaBar drama={drama} />, "/d/d1/episodes");
    expect(screen.getByText("en-us-live-sfw")).toBeInTheDocument();
    expect(screen.getByText("9:16, 480p")).toBeInTheDocument();
    expect(screen.getByText("$41.20")).toBeInTheDocument();
  });

  it("has no view switch: an episode's one view is its Canvas (D66), and Bible, Assets, the board and Delivery are one page each", async () => {
    for (const path of ["/d/d1/e/EP002/canvas?item=episodes%2FEP002%2Fsegments%2Fseg01", "/d/d1/bible", "/d/d1/assets/characters/ivy", "/d/d1/episodes", "/d/d1/delivery", "/d/d1/e/EP002/canvas?item=episodes%2FEP002%2Fsegments%2Fseg01&view=lineage"]) {
      const { unmount } = await renderAt(<DramaBar drama={drama} />, path);
      expect(screen.queryByRole("group", { name: /view$/ })).toBeNull();
      unmount();
    }
  });
});

describe("the top bar", () => {
  const crumbs = [
    { label: "Projects", to: linkOptions({ to: "/" }) },
    { label: "The Stepmother", to: linkOptions({ to: "/d/$dramaId/episodes", params: { dramaId: "d1" } }) },
    { label: "EP002" },
  ];

  it("says where this belongs, each step up a link, with no Back of its own (design/'s TopBar, 2f2a07b)", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<TopBar crumbs={crumbs} waiting={[]} ready next />, "/d/d1/e/EP002/canvas");
    const where = screen.getByRole("navigation", { name: "Where this belongs" });
    expect(within(where).getAllByRole("link").map((link) => link.textContent)).toEqual(["Projects", "The Stepmother"]);
    // The current crumb carries aria-current; its words sit in a .ctext span inside it (3366e15).
    expect(within(where).getByText("EP002").closest("[aria-current]")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: /^Back/ })).toBeNull();
    await user.click(within(where).getByRole("link", { name: "The Stepmother" }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/episodes"));
  });

  it("goes back to where a link came from, as its history entry says, and only then offers it (IA §16, rule 2)", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<TopBar crumbs={crumbs} waiting={[]} ready next />, "/r/r1");
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
    await router.navigate({ to: "/d/$dramaId/e/$episodeCode/canvas", params: { dramaId: "d1", episodeCode: "EP002" }, search: { item: "episodes/EP002/segments/seg01" }, state: { backTo: "the review of EP002 seg01" } });
    await user.click(await screen.findByRole("button", { name: "Back to the review of EP002 seg01" }));
    // Back is the browser's (the history's): renderAt's router follows navigations, not the history moving under it.
    await waitFor(() => expect(router.history.location.href).toBe("/r/r1"));
  });

  it("goes to the next review waiting, not the one in view", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<TopBar crumbs={crumbs} waiting={[review("r1"), review("r2"), review("r3")]} ready next />, "/r/r1");
    await user.click(screen.getByRole("button", { name: "Next review, 2 waiting" }));
    await waitFor(() => expect(href(router)).toBe("/r/r2"));
  });

  it("says when nothing waits, and does nothing", async () => {
    const { router } = await renderAt(<TopBar crumbs={crumbs} waiting={[]} ready next />, "/d/d1/episodes");
    expect(screen.getByRole("button", { name: "Next review, 0 waiting" })).toBeDisabled();
  });
});

describe("the rail", () => {
  const rail = (props: Partial<Parameters<typeof NavRail>[0]> = {}, path = "/") =>
    renderAt(<NavRail page="home" waiting={0} replay={false} drawerToggle={false} drawer={false} onToggleDrawer={() => {}} {...props} />, path);

  it("is one icon-only rail: each place named and tooltipped by its label, the count in Reviews' name (D51; WCAG 2.5.3)", async () => {
    await rail({ page: "canvas", waiting: 3 }, "/d/d1/e/EP002/canvas");
    const nav = screen.getByRole("navigation", { name: "Places" });
    expect(within(nav).getAllByRole("link").map((link) => [link.getAttribute("aria-label"), link.getAttribute("title"), link.getAttribute("aria-current")])).toEqual([
      ["Projects", "Projects", "page"],
      ["Reviews, 3 waiting", "Reviews", "false"],
      ["Pine Computer community", "Pine Computer community", null],
      ["Pine Computer on X", "Pine Computer on X", null],
      ["Settings", "Settings", "false"],
    ]);
    expect(within(nav).getByRole("link", { name: "Reviews, 3 waiting" })).toHaveAttribute("href", "/reviews");
    // No ☰ on a wide window or off a project: there is no column to open.
    expect(within(nav).queryByRole("button", { name: /sidebar/ })).toBeNull();
  });

  it("marks Reviews on the queue and on a review", async () => {
    for (const [page, path] of [["reviews", "/reviews"], ["review", "/r/r1"]] as const) {
      const { unmount } = await rail({ page }, path);
      const nav = screen.getByRole("navigation", { name: "Places" });
      expect(within(nav).getByRole("link", { name: "Reviews" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "false");
      unmount();
    }
  });

  it("shows Home first, a disabled button until the gallery of sample projects exists (D52)", async () => {
    await rail();
    const nav = screen.getByRole("navigation", { name: "Places" });
    const home = within(nav).getByRole("button", { name: "Home, coming later" });
    expect(home).toBeDisabled();
    expect(home).toHaveAttribute("title", "Coming later: a gallery of sample projects");
  });

  it("links Pine Computer's community on Discord and on X, opened outside the studio (D53)", async () => {
    await rail();
    for (const [name, href] of [["Pine Computer community", "https://discord.gg/JxAHeXhvF"], ["Pine Computer on X", "https://x.com/pine_computer"]]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("says it's a replay, with what that means as its tooltip", async () => {
    await rail({ replay: true });
    expect(screen.getByRole("note", { name: "Replay · sample work, no spend" })).toHaveTextContent("Replay");
  });

  it("opens and closes a narrow project page's tree with ☰", async () => {
    const user = userEvent.setup();
    let toggled = 0;
    await rail({ page: "canvas", drawerToggle: true, drawer: true, onToggleDrawer: () => toggled++ }, "/d/d1/e/EP002/canvas");
    const toggle = screen.getByRole("button", { name: "Hide the sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggled).toBe(1);
  });
});

describe("the sidebar", () => {

  it("is the drama tree: each place once, the shelves and episodes under theirs, then Reviews and Out of date (D16)", async () => {
    answer("/api/reviews", [review("r1"), { ...review("r2"), kind: "looks" }, { ...review("r3"), kind: "cut", episode: "EP003" }, { ...review("r4"), kind: "cut", state: "sent" }]);
    answer("/api/dramas/d1/cast", [{ kind: "look", subject: "ivy", looks: [], episodes: [] }, { kind: "look", subject: "luca", looks: [], episodes: [] }, { kind: "location", subject: "garden", looks: [], episodes: [] }]);
    await renderAt(<DramaSidebar drama={{ ...drama, setup: { ...drama.setup, reached: 2 } }} page="episodes" drawer={false} />, "/d/d1/episodes");
    const tree = screen.getByRole("navigation", { name: "The Stepmother" });
    expect(within(tree).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/d/d1/script",
      "/d/d1/bible",
      "/d/d1/assets/characters",
      "/d/d1/episodes",
      "/d/d1/delivery",
      "/reviews?drama=d1",
      "/d/d1/out-of-date",
    ]);
    expect(within(tree).getByRole("link", { name: /^Episodes/ })).toHaveAttribute("aria-current", "page");
    // Each open review counted where it is decided: storyboards in Episodes, looks in Assets, a cut in Delivery.
    expect(await within(tree).findByRole("link", { name: /^Episodes\s*1 need you$/ })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: /^Assets\s*1 need you$/ })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: /^Delivery\s*1 need you$/ })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: /^Reviews\s*3 need you$/ })).toBeInTheDocument();
    const shelves = within(tree).getByRole("list", { name: "Assets" });
    await waitFor(() => expect(within(shelves).getAllByRole("button").map((button) => button.textContent)).toEqual(["Characters2", "Locations1", "Props0"]));
  });

  it("opens an Assets shelf, marked while it is in view", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<DramaSidebar drama={drama} page="locations" drawer={false} />, "/d/d1/assets/locations");
    const tree = screen.getByRole("navigation", { name: "The Stepmother" });
    expect(within(tree).getByRole("link", { name: /^Assets/ })).toHaveAttribute("aria-current", "page");
    const shelves = within(tree).getByRole("list", { name: "Assets" });
    expect(within(shelves).getByRole("button", { name: /^Locations/ })).toHaveAttribute("aria-current", "true");
    await user.click(within(shelves).getByRole("button", { name: /^Props/ }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/assets/props"));
  });

  it("opens over the work as a drawer when the window is narrow", async () => {
    await renderAt(<DramaSidebar drama={drama} page="episodes" drawer />, "/d/d1/episodes");
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toHaveClass("side", "drawer-open");
  });

  it("lists every episode with what it is doing and where it stands, and opens one", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<DramaSidebar drama={drama} page="episodes" drawer={false} />, "/d/d1/episodes");
    const tree = screen.getByRole("list", { name: "Episodes" });
    // The name starts with what the button shows (WCAG 2.5.3), then where the episode stands.
    expect(within(tree).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "EP001 6 storyboards wait for you, needs you",
      "EP002 Starting, working",
      "EP003 Done, done",
      "EP004 In line, #1, in line",
    ]);
    await user.click(within(tree).getAllByRole("button")[1]);
    await waitFor(() => expect(href(router)).toBe("/d/d1/e/EP002/canvas"));
  });

  it("says Paused on an episode stopped with the project the maker paused, with the neutral dot, not needing the maker (D74)", async () => {
    const paused = { ...drama, status: "stopped", setup: { ...drama.setup, reason: "by-maker" }, episodeRows: [row(1, "stopped"), row(3, "done")] } as unknown as DramaView;
    await renderAt(<DramaSidebar drama={paused} page="episodes" drawer={false} />, "/d/d1/episodes");
    const tree = screen.getByRole("list", { name: "Episodes" });
    expect(within(tree).getAllByRole("button")[0]).toHaveTextContent(/^EP001 Paused, paused$/);
    expect(within(tree).getAllByRole("button")[0].querySelector(".dot")).toHaveClass("paused");
    expect(screen.getByRole("link", { name: /^Episodes/ })).not.toHaveTextContent(/need you/);
  });

  it("folds the episodes that only wait in line at its end into one line", async () => {
    const queued = drama.episodeRows[3];
    const { router } = await renderAt(<DramaSidebar drama={{ ...drama, episodeRows: [...drama.episodeRows, { ...queued, id: "e5", code: "EP005" }] }} page="episodes" drawer={false} />, "/d/d1/episodes");
    const tree = screen.getByRole("list", { name: "Episodes" });
    expect(within(tree).getAllByRole("button").map((button) => button.textContent?.slice(0, 5))).toEqual(["EP001", "EP002", "EP003"]);
    expect(within(tree).getByText("EP004–EP005 · 2 in line")).toBeInTheDocument();
  });

  it("shows the episode in view's cut as its child row, with where it stands, and opens it (IA §16)", async () => {
    const user = userEvent.setup();
    const withCut = { ...drama, episodeRows: drama.episodeRows.map((r) => (r.code === "EP003" ? { ...r, stages: { ...r.stages, cut: { state: "review" } } } : r)) } as DramaView;
    const { router } = await renderAt(<DramaSidebar drama={withCut} page="canvas" episode="EP003" drawer={false} />, "/d/d1/e/EP003/canvas");
    const cut = within(screen.getByRole("list", { name: "Episodes" })).getByRole("button", { name: /^› Cut/ });
    expect(cut).toHaveTextContent("Waiting for you");
    await user.click(cut);
    await waitFor(() => expect(href(router)).toBe("/d/d1/e/EP003/cut"));
  });

  it("marks the episode in view", async () => {
    const { router } = await renderAt(<DramaSidebar drama={drama} page="canvas" episode="EP003" drawer={false} />, "/d/d1/e/EP003/canvas");
    expect(within(screen.getByRole("list", { name: "Episodes" })).getAllByRole("button")[2]).toHaveAttribute("aria-current", "true");
  });

  it("while the drama is set up, says the setup's step at its foot, not empty episode counts", async () => {
    const settingUp = { ...drama, status: "setup", episodes: { total: 0, done: 0, waiting: 0, working: 0 }, setup: { state: "working", reached: 4 }, episodeRows: [] } as unknown as DramaView;
    await renderAt(<DramaSidebar drama={settingUp} page="episodes" drawer={false} />);
    const standing = screen.getByRole("status", { name: "Where the project stands" });
    expect(standing).toHaveTextContent("Setup · Preparing every episode: breakdowns, looks, places and props");
    expect(standing).not.toHaveTextContent("0 of 0");
  });

  it("while the setup waits on the rewrite, is the one project tree: Script waits for the maker, what isn't reached says Not started (D62)", async () => {
    const waiting = { ...drama, status: "setup", setup: { state: "waiting", reached: 1 }, episodeRows: [] } as unknown as DramaView;
    answer("/api/dramas/d1/script", { inputs: [], screenplayFile: null, versions: [{ version: "v1", question: { reviewId: "r1", state: "open" } }] });
    answer("/api/dramas/d1/cast", []);
    await renderAt(<DramaSidebar drama={waiting} page="script" drawer={false} />);
    const tree = screen.getByRole("navigation", { name: waiting.title });
    expect(await within(tree).findByRole("link", { name: /^Script/ })).toHaveTextContent("ScriptWaiting for you");
    await waitFor(() => expect(within(tree).getByRole("link", { name: /^Assets/ })).toHaveTextContent("AssetsNot started"));
    expect(within(tree).getByRole("link", { name: /^Bible/ })).toHaveTextContent("BibleNot started");
    expect(within(tree).getByRole("link", { name: /^Episodes/ })).toHaveTextContent("EpisodesNot started");
    expect(screen.queryByRole("list", { name: "Steps" })).not.toBeInTheDocument();
  });

  it("says at its foot what the drama spent against its budget, what is in flight and how many are at work", async () => {
    const budget = (reservedUsd: number) => ({ budgetUsd: 1000, spentUsd: 0, reservedUsd, remainingUsd: 1000 });
    answer("/api/dramas/d1/project", { state: null, sessions: [{ budget: budget(4.8) }, { budget: budget(2.4) }], problems: [], names: null });
    await renderAt(<DramaSidebar drama={drama} page="episodes" drawer={false} />);
    const standing = screen.getByRole("status", { name: "Where the project stands" });
    expect(standing).toHaveTextContent("$41.20");
    expect(await within(standing).findByText("/ $1,000")).toBeInTheDocument();
    expect(standing).toHaveTextContent("$7.20 in flight");
    expect(standing).toHaveTextContent("1 at work");
    expect(standing).toHaveTextContent("Agent turns and video, priced when each turn ends.");
  });

  it("marks a replay's spend as simulated, so it never reads as a charge", async () => {
    await renderAt(<DramaSidebar drama={{ ...drama, mode: "replay" }} page="episodes" drawer={false} />);
    const standing = screen.getByRole("status", { name: "Where the project stands" });
    expect(within(standing).getByText("Simulated spend")).toBeInTheDocument();
    expect(within(standing).queryByText("Spent")).not.toBeInTheDocument();
  });

  it("switches to another drama from its head", async () => {
    const user = userEvent.setup();
    answer("/api/dramas", [{ id: "d1", title: "The Stepmother" }, { id: "d2", title: "Night Class" }]);
    const { router } = await renderAt(<DramaSidebar drama={drama} page="episodes" drawer={false} />, "/d/d1/episodes");
    await user.click(screen.getByRole("button", { name: /^The Stepmother/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Night Class" }));
    await waitFor(() => expect(href(router)).toBe("/d/d2/episodes"));
  });

});
