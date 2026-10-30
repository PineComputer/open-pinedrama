// The shell, used as a maker uses it, on a drama in production with episodes in each state: the
// rail, the sidebar with the steps, the episode tree and where the drama stands, the top bar with
// the breadcrumb and the next review, and the drama's bar with its surface and chips.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { DramaView, EpisodeRow, ReviewSummary } from "../../shared/types.ts";
import { navigate } from "../router.tsx";
import { NavRail } from "./NavRail.tsx";
import { DramaSidebar, HomeSidebar } from "./Sidebar.tsx";
import { DramaBar, TopBar } from "./TopBar.tsx";

function row(number: number, state: EpisodeRow["state"]): EpisodeRow {
  const code = `EP00${number}`;
  return { id: `e${number}`, number, code, title: `Episode ${number}`, state, stages: {} as EpisodeRow["stages"], spent: { total: 0, media: 0, partial: false }, updatedAt: "2026-10-30T10:00:00Z", ...(state === "waiting" ? { waitingFor: "storyboards" as const } : {}) };
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
  return { id, dramaId: "d1", dramaTitle: "The Stepmother", kind: "storyboards", state: "open", question: "", items: 1, createdAt: "2026-10-30T10:00:00Z" };
}

function at(path: string) {
  act(() => navigate(path));
}

describe("the drama's bar", () => {
  it("marks a replay drama's spend as simulated", () => {
    at("/d/d1");
    render(<DramaBar drama={{ ...drama, mode: "replay" } as DramaView} />);
    expect(screen.getByText("Simulated spend")).toBeInTheDocument();
  });

  it("shows the drama's preset, format and what it has spent", () => {
    at("/d/d1");
    render(<DramaBar drama={drama} />);
    expect(screen.getByText("en-us-live-sfw")).toBeInTheDocument();
    expect(screen.getByText("9:16, 480p")).toBeInTheDocument();
    expect(screen.getByText("$41.20")).toBeInTheDocument();
  });

  it("switches surface, keeping what is selected", async () => {
    const user = userEvent.setup();
    at("/d/d1/e/EP002");
    render(<DramaBar drama={drama} />);
    const surfaces = screen.getByRole("group", { name: "Surface" });
    expect(within(surfaces).getByRole("button", { name: "Studio" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(surfaces).getByRole("button", { name: "Canvas" }));
    expect(location.pathname + location.search).toBe("/d/d1/canvas?item=EP002");
    expect(within(surfaces).getByRole("button", { name: "Canvas" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(surfaces).getByRole("button", { name: "Studio" }));
    expect(location.pathname).toBe("/d/d1/e/EP002");
  });
});

describe("the top bar", () => {
  const crumbs = [
    { label: "Dramas", to: "/" },
    { label: "The Stepmother", to: "/d/d1" },
    { label: "EP002" },
  ];

  it("says where you are, each step back a link, and goes back one", async () => {
    const user = userEvent.setup();
    at("/d/d1/e/EP002");
    render(<TopBar crumbs={crumbs} waiting={[]} ready />);
    const where = screen.getByRole("navigation", { name: "Where you are" });
    expect(within(where).getAllByRole("link").map((link) => link.textContent)).toEqual(["Dramas", "The Stepmother"]);
    expect(within(where).getByText("EP002")).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(location.pathname).toBe("/d/d1");
  });

  it("goes to the next review waiting, not the one in view", async () => {
    const user = userEvent.setup();
    at("/r/r1");
    render(<TopBar crumbs={crumbs} waiting={[review("r1"), review("r2"), review("r3")]} ready />);
    await user.click(screen.getByRole("button", { name: "Next review, 2 waiting" }));
    expect(location.pathname).toBe("/r/r2");
  });

  it("says when nothing waits, and does nothing", () => {
    at("/d/d1");
    render(<TopBar crumbs={crumbs} waiting={[]} ready />);
    expect(screen.getByRole("button", { name: "Next review, 0 waiting" })).toBeDisabled();
  });
});

describe("the rail", () => {
  it("outside a drama, offers the dramas and the queue, with settings at its foot", () => {
    at("/");
    render(<NavRail path="/" sidebarOpen onToggleSidebar={() => {}} />);
    const rail = screen.getByRole("navigation", { name: "Places" });
    expect(within(rail).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Hide the sidebar", "Dramas", "To review", "Settings"]);
    expect(within(rail).getByRole("button", { name: "Dramas" })).toHaveAttribute("aria-current", "page");
  });

  it("in a drama, adds its surfaces and steps, and goes to one", async () => {
    const user = userEvent.setup();
    at("/d/d1/story");
    render(<NavRail path="/d/d1/story" dramaId="d1" sidebarOpen={false} onToggleSidebar={() => {}} />);
    const rail = screen.getByRole("navigation", { name: "Places" });
    expect(within(rail).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Show the sidebar", "Dramas", "To review", "Episodes", "Canvas", "Graph", "Story", "Cut", "Settings"]);
    expect(within(rail).getByRole("button", { name: "Story" })).toHaveAttribute("aria-current", "page");
    await user.click(within(rail).getByRole("button", { name: "Canvas" }));
    expect(location.pathname).toBe("/d/d1/canvas");
  });

  it("opens and closes the sidebar", async () => {
    const user = userEvent.setup();
    let toggled = 0;
    render(<NavRail path="/" sidebarOpen onToggleSidebar={() => toggled++} />);
    const toggle = screen.getByRole("button", { name: "Hide the sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggled).toBe(1);
  });
});

describe("the sidebar", () => {
  it("on the studio's pages, offers its places with what waits", () => {
    render(<HomeSidebar path="/inbox" waiting={3} replay />);
    expect(screen.getByRole("link", { name: "To review 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Replay · sample work, no spend")).toBeInTheDocument();
  });

  it("marks the step in view and how many episodes need the maker", () => {
    at("/d/d1");
    render(<DramaSidebar drama={drama} tab="board" onTalk={() => {}} />);
    const steps = screen.getByRole("navigation", { name: "Steps" });
    expect(within(steps).getByRole("link", { name: /^Episodes/ })).toHaveAttribute("aria-current", "page");
    expect(within(steps).getByRole("link", { name: /^Episodes/ })).toHaveTextContent("1 need you");
    expect(within(steps).getAllByRole("link", { name: /^(Script|Story|Episodes|Cut)/ }).map((link) => link.textContent?.split(/\d/)[0].trim())).toEqual(["Script", "Story", "Episodes", "Cut"]);
  });

  it("lists every episode with what it is doing and where it stands, and opens one", async () => {
    const user = userEvent.setup();
    at("/d/d1");
    render(<DramaSidebar drama={drama} tab="board" onTalk={() => {}} />);
    const tree = screen.getByRole("list", { name: "Episodes" });
    // The name starts with what the link shows (WCAG 2.5.3), then where the episode stands.
    expect(within(tree).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "EP001 Waits for you: Storyboards, needs you",
      "EP002 Starting, at work",
      "EP003 Done, finished",
      "EP004 In line, #1, in line",
    ]);
    await user.click(within(tree).getAllByRole("link")[1]);
    expect(location.pathname).toBe("/d/d1/e/EP002");
  });

  it("marks the episode in view", () => {
    at("/d/d1/e/EP003");
    render(<DramaSidebar drama={drama} tab="episode" episode="EP003" onTalk={() => {}} />);
    expect(within(screen.getByRole("list", { name: "Episodes" })).getAllByRole("link")[2]).toHaveAttribute("aria-current", "true");
  });

  it("while the drama is set up, says the setup's step at its foot, not empty episode counts", () => {
    const settingUp = { ...drama, status: "setup", episodes: { total: 0, done: 0, waiting: 0, working: 0 }, setup: { state: "working", reached: 4 }, episodeRows: [] } as unknown as DramaView;
    render(<DramaSidebar drama={settingUp} tab="board" onTalk={() => {}} />);
    const standing = screen.getByRole("status", { name: "Where the drama stands" });
    expect(standing).toHaveTextContent("Setup · Preparing every episode: breakdowns, looks, places and props");
    expect(standing).not.toHaveTextContent("0 of 0");
  });

  it("says at its foot what the drama spent and where it stands", () => {
    render(<DramaSidebar drama={drama} tab="board" onTalk={() => {}} />);
    expect(screen.getByText("$41.20")).toBeInTheDocument();
    const standing = screen.getByRole("status", { name: "Where the drama stands" });
    expect(standing).toHaveTextContent("1 of 4 episodes finished");
    expect(standing).toHaveTextContent("1 at work");
    expect(standing).toHaveTextContent("1 wait for you");
  });
});
