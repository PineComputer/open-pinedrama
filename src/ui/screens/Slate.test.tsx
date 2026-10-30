// Home (P5.1): dense drama cards whose every fact comes from drama-cli's status, the bible or the engine's records,
// a shelf for each state, and the drama to carry on with even when nothing waits for the maker.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaCard } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { Slate } from "./Slate.tsx";

const replay = { mode: "replay" as const, version: "0.3.0", dataDir: "/data", stopping: 0 };

function card(fields: Partial<DramaCard> & Pick<DramaCard, "id" | "title">): DramaCard {
  return {
    mode: "replay", rehearsal: false, language: "en", look: "", preset: "en-us-live-sfw", format: "9:16, 480p", status: "production",
    episodes: { total: 2, done: 0, waiting: 0, working: 1 }, computers: 1, waiting: 0, cast: [], spent: { total: 0, media: 0, partial: false },
    createdAt: "2026-10-30T09:00:00Z", facts: {}, ...fields,
  };
}

const stepmother = card({
  id: "d1",
  title: "The Stepmother",
  facts: { scale: { episodes: 2, scenes: 5, segments: 12 }, length: "60", genres: ["Family", "Period"], logline: "A stepmother takes over a house that doesn't want her.", lastActivity: "2026-10-30T11:55:00Z", lastLine: "Drawing the storyboards for EP001" },
});
/** A drama's card on the shelf, apart from the hero's links to the same drama. */
async function tileOf(name: RegExp) {
  return within(await screen.findByRole("tabpanel")).getByRole("link", { name });
}

const bride = card({ id: "d2", title: "Bride on Bail", status: "stopped", facts: {} });

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-30T12:00:00Z"), shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("Home", () => {
  it("shows on each card what drama-cli and the bible say, and leaves out what isn't known", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", []);
    answer("/api/dramas", [stepmother, bride]);
    render(<Slate />);
    const tile = await tileOf(/^The Stepmother/);
    expect(tile).toHaveTextContent("A stepmother takes over a house that doesn't want her.");
    expect(tile).toHaveTextContent("2 episodes · 5 scenes · 12 segments");
    expect(tile).toHaveTextContent("about 2 min planned");
    expect(tile).toHaveTextContent("English vertical drama");
    expect(tile).toHaveTextContent("5 minutes ago");
    expect(within(tile).getByText("Family")).toBeInTheDocument();
    expect(within(tile).getByText("Period")).toBeInTheDocument();
    const other = await tileOf(/^Bride on Bail/);
    expect(other).not.toHaveTextContent(/scenes|segments|planned|ago/);
  });

  it("makes a poster of the drama's own work when it has some, else the empty cover, never its leads' sheets", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", []);
    answer("/api/dramas", [{ ...stepmother, cast: ["/api/files/7"], cover: { url: "/api/files/9" } }, { ...bride, cast: ["/api/files/8"] }]);
    render(<Slate />);
    const withWork = await tileOf(/^The Stepmother/);
    expect(withWork.querySelector(".poster .still")).toHaveStyle({ backgroundImage: "url(/api/files/9)" });
    expect(withWork.querySelector(".poster .leads")).toBeNull();
    const empty = await tileOf(/^Bride on Bail/);
    expect(empty.querySelector(".poster .still")).toBeNull();
    expect(empty.querySelector(".poster .leads")).toBeNull();
    expect(empty.querySelector('[style*="/api/files/8"]')).toBeNull();
    expect(within(empty).getByRole("heading", { name: "Bride on Bail" })).toBeInTheDocument();
  });

  it("greets the maker by the time of day, with what waits for them", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", []);
    answer("/api/dramas", [stepmother, bride]);
    render(<Slate />);
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    expect(await screen.findByRole("heading", { level: 1, name: greeting })).toBeInTheDocument();
  });

  it("shows a waiting item's own picture, else its drama's cover", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", [
      { id: "r1", dramaId: "d1", dramaTitle: "The Stepmother", kind: "takes", state: "open", question: "", items: 1, thumb: { url: "/api/files/3", video: true }, createdAt: "2026-10-30T11:56:00Z" },
      { id: "r2", dramaId: "d1", dramaTitle: "The Stepmother", kind: "question", state: "open", question: "How old?", items: 0, createdAt: "2026-10-30T11:50:00Z" },
    ]);
    answer("/api/dramas", [{ ...stepmother, waiting: 2, cast: ["/api/files/7"] }]);
    render(<Slate />);
    const waiting = await screen.findByRole("list", { name: "Waiting for you" });
    const [take, question] = within(waiting).getAllByRole("link");
    expect(take.querySelector("video")).toHaveAttribute("src", "/api/files/3#t=0.5");
    expect(question.querySelector(".still")).toHaveStyle({ backgroundImage: "url(/api/files/7)" });
  });

  it("shows at most two genres on a card, and how many more", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", []);
    answer("/api/dramas", [{ ...stepmother, facts: { ...stepmother.facts, genres: ["Romance", "Contract marriage", "Revenge"] } }]);
    render(<Slate />);
    const tile = await tileOf(/^The Stepmother/);
    expect(within(tile).getByText("Romance")).toBeInTheDocument();
    expect(within(tile).getByText("Contract marriage")).toBeInTheDocument();
    expect(within(tile).queryByText("Revenge")).not.toBeInTheDocument();
    expect(within(tile).getByText("+1")).toBeInTheDocument();
  });

  it("carries on with the drama worked on last, its waiting review first, beside what waits, newest first", async () => {
    answer("/api/app", replay);
    // The older drama's review has waited longer; the newer drama is the one to carry on with.
    answer("/api/inbox", [
      { id: "r0", dramaId: "d2", dramaTitle: "Bride on Bail", kind: "question", state: "open", question: "Old question", items: 0, createdAt: "2026-10-27T11:00:00Z" },
      { id: "r1", dramaId: "d1", dramaTitle: "The Stepmother", episode: "EP001", kind: "takes", state: "open", question: "Two takes wait.", items: 2, createdAt: "2026-10-30T11:56:00Z" },
    ]);
    answer("/api/dramas", [{ ...bride, waiting: 1, facts: { lastActivity: "2026-10-27T11:00:00Z" } }, { ...stepmother, waiting: 1 }]);
    render(<Slate />);
    const hero = await screen.findByRole("region", { name: "The Stepmother" });
    expect(hero).toHaveTextContent("Two takes wait.");
    expect(within(hero).getByRole("link", { name: /^Review Takes/ })).toHaveAttribute("href", "/r/r1");
    const waiting = within(hero).getByRole("list", { name: "Waiting for you" });
    const rows = within(waiting).getAllByRole("link");
    expect(rows.map((link) => link.getAttribute("href"))).toEqual(["/r/r1", "/r/r0"]);
    expect(rows[0]).toHaveTextContent("EP001 · Takes");
    expect(rows[0]).toHaveTextContent("2 items · The Stepmother · 4 minutes ago");
    expect(screen.getByText("2 decisions wait for you across your dramas.")).toBeInTheDocument();
  });

  it("sorts the shelf by when each drama was last worked on, or by title", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    answer("/api/app", replay);
    answer("/api/inbox", []);
    answer("/api/dramas", [{ ...bride, facts: { lastActivity: "2026-10-27T11:00:00Z" } }, stepmother]);
    render(<Slate />);
    const shelf = await screen.findByRole("tabpanel");
    const titles = () => [...shelf.querySelectorAll(".ds-dramacard b")].map((title) => title.textContent);
    expect(titles()).toEqual(["The Stepmother", "Bride on Bail"]);
    await user.click(screen.getByRole("button", { name: /Last edited/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Title" }));
    expect(titles()).toEqual(["Bride on Bail", "The Stepmother"]);
    expect(screen.getByRole("button", { name: /Title/ })).toBeInTheDocument();
  });

  it("has a shelf for each state, with its count, Stopped among them", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", []);
    answer("/api/dramas", [stepmother, bride]);
    render(<Slate />);
    const tabs = await screen.findByRole("tablist");
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["All2", "Needs you0", "At work1", "Finished0", "Stopped1"]);
  });

  it("offers the latest drama to carry on with, and the agent's last line, when nothing waits", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", []);
    answer("/api/dramas", [bride, stepmother]);
    render(<Slate />);
    const hero = await screen.findByRole("region", { name: "The Stepmother" });
    expect(hero).toHaveTextContent("Drawing the storyboards for EP001");
    expect(within(hero).getByRole("link", { name: /Open drama/ })).toHaveAttribute("href", "/d/d1");
  });
});
