// The project shell: the top bar, the steps with the episode tree, and the status bar, used as a
// maker uses them, on a drama in production with episodes in each state.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AppInfo, DramaView, EpisodeRow, ReviewSummary } from "../../shared/types.ts";
import { navigate } from "../router.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { StepRail } from "./StepRail.tsx";
import { TopBar } from "./TopBar.tsx";

const app: AppInfo = { mode: "replay", version: "0.3.0", dataDir: "/tmp" };

function row(number: number, state: EpisodeRow["state"]): EpisodeRow {
  const code = `EP00${number}`;
  return { id: `e${number}`, number, code, title: `Episode ${number}`, state, stages: {} as EpisodeRow["stages"], spent: { total: 0, media: 0, partial: false }, updatedAt: "2026-10-30T10:00:00Z", ...(state === "waiting" ? { waitingFor: "storyboards" as const } : {}) };
}

const drama = {
  id: "d1",
  title: "The Stepmother",
  format: "9:16, 480p",
  preset: "en-us-live-sfw",
  status: "production",
  spent: { total: 41.2, media: 30 },
  waiting: 1,
  episodes: { total: 4, done: 1, waiting: 1, working: 1 },
  setup: { state: "done", reached: 5 },
  episodeRows: [row(1, "waiting"), row(2, "working"), row(3, "done"), row(4, "queued")],
} as unknown as DramaView;

function review(id: string): ReviewSummary {
  return { id, dramaId: "d1", dramaTitle: "The Stepmother", kind: "storyboards", state: "open", question: "", items: 1, createdAt: "2026-10-30T10:00:00Z" };
}

function at(path: string) {
  act(() => navigate(path));
}

describe("the top bar", () => {
  it("names the drama and its format and preset, and what it has spent", () => {
    at("/d/d1");
    render(<TopBar app={app} waiting={[]} drama={drama} />);
    expect(screen.getByRole("banner")).toHaveTextContent("The Stepmother");
    expect(screen.getByText("9:16, 480p · en-us-live-sfw")).toBeInTheDocument();
    expect(screen.getByText("$41.20")).toBeInTheDocument();
  });

  it("switches surface, keeping what is selected", async () => {
    const user = userEvent.setup();
    at("/d/d1/e/EP002");
    render(<TopBar app={app} waiting={[]} drama={drama} />);
    const surfaces = screen.getByRole("group", { name: "Surface" });
    expect(within(surfaces).getByRole("button", { name: "Studio" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(surfaces).getByRole("button", { name: "Canvas" }));
    expect(location.pathname + location.search).toBe("/d/d1/canvas?item=EP002");
    expect(within(surfaces).getByRole("button", { name: "Canvas" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(surfaces).getByRole("button", { name: "Studio" }));
    expect(location.pathname).toBe("/d/d1/e/EP002");
  });

  it("goes to the next review waiting, not the one in view", async () => {
    const user = userEvent.setup();
    at("/r/r1");
    render(<TopBar app={app} waiting={[review("r1"), review("r2"), review("r3")]} drama={drama} />);
    await user.click(screen.getByRole("button", { name: "Next review, 2 waiting" }));
    expect(location.pathname).toBe("/r/r2");
  });

  it("says when nothing waits, and does nothing", () => {
    at("/d/d1");
    render(<TopBar app={app} waiting={[]} drama={drama} />);
    expect(screen.getByRole("button", { name: "Next review, 0 waiting" })).toBeDisabled();
  });

  it("outside a drama, offers the dramas, the queue and settings", () => {
    at("/");
    render(<TopBar app={app} waiting={[]} />);
    const nav = screen.getByRole("navigation");
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Dramas", "To review", "Settings"]);
  });
});

describe("the steps", () => {
  it("marks the step in view and how many episodes need the maker", () => {
    at("/d/d1");
    render(<StepRail drama={drama} step="episodes" />);
    const steps = screen.getByRole("navigation", { name: "Steps" });
    expect(within(steps).getByRole("link", { name: /^Episodes/ })).toHaveAttribute("aria-current", "page");
    expect(within(steps).getByRole("link", { name: /^Episodes/ })).toHaveTextContent("1 need you");
    expect(within(steps).getAllByRole("link", { name: /^(Script|Story|Episodes|Cut)/ }).map((link) => link.textContent?.split(/\d/)[0].trim())).toEqual(["Script", "Story", "Episodes", "Cut"]);
  });

  it("lists every episode with where it stands, and opens one", async () => {
    const user = userEvent.setup();
    at("/d/d1");
    render(<StepRail drama={drama} step="episodes" />);
    const tree = screen.getByRole("list", { name: "Episodes" });
    const marks = within(tree).getAllByRole("link").map((link) => link.textContent);
    // The name starts with what the link shows (WCAG 2.5.3), then where the episode stands.
    expect(marks).toEqual(["EP001 Episode 1, needs you", "EP002 Episode 2, at work", "EP003 Episode 3, finished", "EP004 Episode 4, in line"]);
    await user.click(within(tree).getByRole("link", { name: "EP002 Episode 2, at work" }));
    expect(location.pathname).toBe("/d/d1/e/EP002");
  });

  it("marks the episode in view", () => {
    at("/d/d1/e/EP003");
    render(<StepRail drama={drama} step="episodes" episode="EP003" />);
    expect(screen.getByRole("link", { name: "EP003 Episode 3, finished" })).toHaveAttribute("aria-current", "true");
  });
});

describe("the status bar", () => {
  it("says where the drama stands", () => {
    render(<StatusBar drama={drama} />);
    const bar = screen.getByRole("status", { name: "Where the drama stands" });
    expect(bar).toHaveTextContent("1 of 4 episodes finished");
    expect(bar).toHaveTextContent("1 at work");
    expect(bar).toHaveTextContent("1 wait for you");
  });
});
