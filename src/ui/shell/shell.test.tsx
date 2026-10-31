// The shell, used as a maker uses it, on a drama in production with episodes in each state: the
// rail, the sidebar with the steps, the episode tree and where the drama stands, the top bar with
// the breadcrumb and the next review, and the drama's bar with its surface and chips.
import { screen, waitFor, within } from "@testing-library/react";
import { answer } from "../test/server.ts";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { DramaView, EpisodeRow, ReviewSummary } from "../../shared/types.ts";
import { NavRail } from "./NavRail.tsx";
import { DramaSidebar, HomeSidebar } from "./Sidebar.tsx";
import { DramaBar, TopBar } from "./TopBar.tsx";
import { href, renderAt } from "../test/router.tsx";
import { linkOptions } from "@tanstack/react-router";

function row(number: number, state: EpisodeRow["state"]): EpisodeRow {
  const code = `EP00${number}`;
  return { id: `e${number}`, number, code, title: `Episode ${number}`, state, stages: {} as EpisodeRow["stages"], spent: { total: 0, media: 0, partial: false }, updatedAt: "2026-10-30T10:00:00Z", ...(state === "waiting" ? { waitingFor: "storyboards" as const, waitingItems: 6 } : {}) };
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

  it("switches surface, keeping what is selected", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<DramaBar drama={drama} />, "/d/d1/e/EP002");
    const surfaces = screen.getByRole("group", { name: "Surface" });
    expect(within(surfaces).getByRole("button", { name: "Studio" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(surfaces).getByRole("button", { name: "Canvas" }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/e/EP002/canvas"));
    expect(within(surfaces).getByRole("button", { name: "Canvas" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(surfaces).getByRole("button", { name: "Studio" }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/e/EP002/list"));
  });

  it("takes a character picked on Lineage to its home under Assets, never to Home or an episode (Codex's IA review, B1)", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<DramaBar drama={drama} />, "/d/d1/assets/characters/ivy?view=lineage");
    const surfaces = screen.getByRole("group", { name: "Surface" });
    await user.click(within(surfaces).getByRole("button", { name: "Canvas" }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/canvas?item=assets%2Fcharacters%2Fivy"));
    await user.click(within(surfaces).getByRole("button", { name: "Studio" }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/assets/characters/ivy"));
  });
});

describe("the top bar", () => {
  const crumbs = [
    { label: "Dramas", to: linkOptions({ to: "/" }) },
    { label: "The Stepmother", to: linkOptions({ to: "/d/$dramaId/episodes", params: { dramaId: "d1" } }) },
    { label: "EP002" },
  ];

  it("says where you are, each step back a link, and goes back one", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<TopBar crumbs={crumbs} waiting={[]} ready next />, "/d/d1/e/EP002/list");
    const where = screen.getByRole("navigation", { name: "Where you are" });
    expect(within(where).getAllByRole("link").map((link) => link.textContent)).toEqual(["Dramas", "The Stepmother"]);
    expect(within(where).getByText("EP002")).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/episodes"));
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
  it("outside a drama, shows every place, the drama's own disabled, with settings at its foot", async () => {
    const { router } = await renderAt(<NavRail page="home" sidebarOpen onToggleSidebar={() => {}} />, "/");
    const rail = screen.getByRole("navigation", { name: "Places" });
    expect(within(rail).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Hide the sidebar", "Dramas", "Script", "Story", "Episodes", "Canvas", "Graph", "To review", "Cut", "Settings"]);
    expect(within(rail).getByRole("button", { name: "Dramas" })).toHaveAttribute("aria-current", "page");
    expect(within(rail).getByRole("button", { name: "Story" })).toBeDisabled();
    expect(within(rail).getByRole("button", { name: "To review" })).toBeEnabled();
  });

  it("in a drama, adds its steps and surfaces in the pro direction's order, and goes to one", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<NavRail page="story" dramaId="d1" sidebarOpen={false} onToggleSidebar={() => {}} />, "/d/d1/story");
    const rail = screen.getByRole("navigation", { name: "Places" });
    expect(within(rail).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Show the sidebar", "Dramas", "Script", "Story", "Episodes", "Canvas", "Graph", "To review", "Cut", "Settings"]);
    expect(within(rail).getByRole("button", { name: "Story" })).toHaveAttribute("aria-current", "page");
    await user.click(within(rail).getByRole("button", { name: "Canvas" }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/canvas"));
  });

  it("opens and closes the sidebar", async () => {
    const user = userEvent.setup();
    let toggled = 0;
    await renderAt(<NavRail page="home" sidebarOpen onToggleSidebar={() => toggled++} />);
    const toggle = screen.getByRole("button", { name: "Hide the sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggled).toBe(1);
  });
});

describe("the sidebar", () => {
  it("on the studio's pages, offers its places as the design does, Computers and Usage for phase 2", async () => {
    await renderAt(<HomeSidebar page="settings" replay />, "/settings");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dramas" })).toHaveAttribute("aria-current", "false");
    expect(screen.getByRole("button", { name: "Computers" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Usage" })).toBeDisabled();
    expect(screen.getByText("Replay · sample work, no spend")).toBeInTheDocument();
  });

  it("marks the step in view, and counts what waits for the maker under each step", async () => {
    answer("/api/inbox", [review("r1"), { ...review("r2"), kind: "looks" }, { ...review("r3"), kind: "cut", state: "sent" }]);
    const { router } = await renderAt(<DramaSidebar drama={{ ...drama, setup: { ...drama.setup, reached: 2 } }} page="episodes" />, "/d/d1/episodes");
    const steps = screen.getByRole("navigation", { name: "Steps" });
    expect(within(steps).getByRole("link", { name: /^Episodes/ })).toHaveAttribute("aria-current", "page");
    expect(await within(steps).findByRole("link", { name: /^Episodes\s*1 need you$/ })).toBeInTheDocument();
    expect(within(steps).getByRole("link", { name: /^Story\s*1 need you$/ })).toBeInTheDocument();
    expect(within(steps).getByRole("link", { name: "Cut" })).toBeInTheDocument();
    expect(within(steps).getAllByRole("link", { name: /^(Script|Story|Episodes|Cut)/ }).map((link) => link.textContent?.split(/\d/)[0].trim())).toEqual(["Script", "Story", "Episodes", "Cut"]);
  });

  it("lists every episode with what it is doing and where it stands, and opens one", async () => {
    const user = userEvent.setup();
    const { router } = await renderAt(<DramaSidebar drama={drama} page="episodes" />, "/d/d1/episodes");
    const tree = screen.getByRole("list", { name: "Episodes" });
    // The name starts with what the button shows (WCAG 2.5.3), then where the episode stands.
    expect(within(tree).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "EP001 6 storyboards wait for you, needs you",
      "EP002 Starting, at work",
      "EP003 Done, finished",
      "EP004 In line, #1, in line",
    ]);
    await user.click(within(tree).getAllByRole("button")[1]);
    await waitFor(() => expect(href(router)).toBe("/d/d1/e/EP002/list"));
  });

  it("folds the episodes that only wait in line at its end into one line", async () => {
    const queued = drama.episodeRows[3];
    const { router } = await renderAt(<DramaSidebar drama={{ ...drama, episodeRows: [...drama.episodeRows, { ...queued, id: "e5", code: "EP005" }] }} page="episodes" />, "/d/d1/episodes");
    const tree = screen.getByRole("list", { name: "Episodes" });
    expect(within(tree).getAllByRole("button").map((button) => button.textContent?.slice(0, 5))).toEqual(["EP001", "EP002", "EP003"]);
    expect(within(tree).getByText("EP004–EP005 · 2 in line")).toBeInTheDocument();
  });

  it("marks the episode in view", async () => {
    const { router } = await renderAt(<DramaSidebar drama={drama} page="list" episode="EP003" />, "/d/d1/e/EP003/list");
    expect(within(screen.getByRole("list", { name: "Episodes" })).getAllByRole("button")[2]).toHaveAttribute("aria-current", "true");
  });

  it("while the drama is set up, says the setup's step at its foot, not empty episode counts", async () => {
    const settingUp = { ...drama, status: "setup", episodes: { total: 0, done: 0, waiting: 0, working: 0 }, setup: { state: "working", reached: 4 }, episodeRows: [] } as unknown as DramaView;
    await renderAt(<DramaSidebar drama={settingUp} page="episodes" />);
    const standing = screen.getByRole("status", { name: "Where the drama stands" });
    expect(standing).toHaveTextContent("Setup · Preparing every episode: breakdowns, looks, places and props");
    expect(standing).not.toHaveTextContent("0 of 0");
  });

  it("while the setup waits on the rewrite, gives the four steps with Script for the maker's review", async () => {
    const waiting = { ...drama, status: "setup", setup: { state: "waiting", reached: 1 }, episodeRows: [] } as unknown as DramaView;
    await renderAt(<DramaSidebar drama={waiting} page="script" />);
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(within(steps).getAllByRole("listitem").map((step) => [step.className, step.textContent])).toEqual([
      ["you", "1ScriptYour review"],
      ["line", "2StoryAfter your review"],
      ["line", "3EpisodesAfter the looks"],
      ["line", "4CutPer episode"],
    ]);
  });

  it("says at its foot what the drama spent against its budget, what is in flight and how many are at work", async () => {
    const budget = (reservedUsd: number) => ({ budgetUsd: 1000, spentUsd: 0, reservedUsd, remainingUsd: 1000 });
    answer("/api/dramas/d1/project", { state: null, sessions: [{ budget: budget(4.8) }, { budget: budget(2.4) }], problems: [], names: null });
    await renderAt(<DramaSidebar drama={drama} page="episodes" />);
    const standing = screen.getByRole("status", { name: "Where the drama stands" });
    expect(standing).toHaveTextContent("$41.20");
    expect(await within(standing).findByText("/ $1,000")).toBeInTheDocument();
    expect(standing).toHaveTextContent("$7.20 in flight");
    expect(standing).toHaveTextContent("1 at work");
    expect(standing).toHaveTextContent("Agent turns and video, priced when each turn ends.");
  });

  it("marks a replay's spend as simulated, so it never reads as a charge", async () => {
    await renderAt(<DramaSidebar drama={{ ...drama, mode: "replay" }} page="episodes" />);
    const standing = screen.getByRole("status", { name: "Where the drama stands" });
    expect(within(standing).getByText("Simulated spend")).toBeInTheDocument();
    expect(within(standing).queryByText("Spent")).not.toBeInTheDocument();
  });

  it("switches to another drama from its head", async () => {
    const user = userEvent.setup();
    answer("/api/dramas", [{ id: "d1", title: "The Stepmother" }, { id: "d2", title: "Night Class" }]);
    const { router } = await renderAt(<DramaSidebar drama={drama} page="episodes" />, "/d/d1/episodes");
    await user.click(screen.getByRole("button", { name: /^The Stepmother/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Night Class" }));
    await waitFor(() => expect(href(router)).toBe("/d/d2/episodes"));
  });

});
