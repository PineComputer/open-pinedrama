// Home (P5.1): dense drama cards whose every fact comes from drama-cli's status, the bible or the engine's records,
// a shelf for each state, and the drama to carry on with even when nothing waits for the maker.
import { render, screen, within } from "@testing-library/react";
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
  facts: { scale: { episodes: 2, scenes: 5, segments: 12 }, length: "60", logline: "A stepmother takes over a house that doesn't want her.", lastActivity: "2026-10-30T11:55:00Z", lastLine: "Drawing the storyboards for EP001" },
});
const bride = card({ id: "d2", title: "Bride on Bail", status: "stopped", facts: {} });

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-30T12:00:00Z"), shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("Home", () => {
  it("shows on each card what drama-cli and the bible say, and leaves out what isn't known", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", []);
    answer("/api/dramas", [stepmother, bride]);
    render(<Slate />);
    const tile = await screen.findByRole("link", { name: /^The Stepmother/ });
    expect(tile).toHaveTextContent("A stepmother takes over a house that doesn't want her.");
    expect(tile).toHaveTextContent("2 episodes · 5 scenes · 12 segments");
    expect(tile).toHaveTextContent("about 2 min planned");
    expect(tile).toHaveTextContent("English vertical drama");
    expect(tile).toHaveTextContent("5 minutes ago");
    const other = screen.getByRole("link", { name: /^Bride on Bail/ });
    expect(other).not.toHaveTextContent(/scenes|segments|planned|ago/);
  });

  it("makes a poster of the drama's own work when it has some, else of its leads' faces", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", []);
    answer("/api/dramas", [{ ...stepmother, cast: ["/api/files/7"], cover: { url: "/api/files/9" } }, { ...bride, cast: ["/api/files/8"] }]);
    render(<Slate />);
    const withWork = await screen.findByRole("link", { name: /^The Stepmother/ });
    expect(withWork.querySelector(".poster .still")).toHaveStyle({ backgroundImage: "url(/api/files/9)" });
    expect(withWork.querySelector(".poster .leads")).toBeNull();
    const faces = screen.getByRole("link", { name: /^Bride on Bail/ });
    expect(faces.querySelector(".poster .leads span")).toHaveStyle({ backgroundImage: "url(/api/files/8)" });
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

  it("shows a waiting item's drama cover when the item has no picture of its own", async () => {
    answer("/api/app", replay);
    answer("/api/inbox", [{ id: "r1", dramaId: "d1", dramaTitle: "The Stepmother", kind: "question", state: "open", question: "How old is he?", items: 0, createdAt: "2026-10-30T11:00:00Z" }]);
    answer("/api/dramas", [{ ...stepmother, waiting: 1, cast: ["/api/files/7"] }]);
    render(<Slate />);
    const waiting = await screen.findByRole("link", { name: /^Question/ });
    expect(waiting.querySelector(".still")).toHaveStyle({ backgroundImage: "url(/api/files/7)" });
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
