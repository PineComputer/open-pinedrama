// Home, ported from the pro prototype: dense drama cards whose every fact comes from drama-cli's status, the bible or the engine's records,
// a shelf for each state, and the drama to carry on with even when nothing waits for the maker.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaCard } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { takeDroppedScreenplay } from "./NewDrama.tsx";
import { Slate } from "./Slate.tsx";
import { href, renderAt } from "../test/router.tsx";

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
  return within(await screen.findByRole("tabpanel")).findByRole("link", { name });
}

const bride = card({ id: "d2", title: "Bride on Bail", status: "stopped", facts: {} });

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-30T12:00:00Z"), shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("Home", () => {
  it("shows on each card what drama-cli and the bible say, and leaves out what isn't known", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", []);
    answer("/api/dramas", [stepmother, bride]);
    await renderAt(<Slate />);
    const tile = await tileOf(/The Stepmother/);
    expect(tile).toHaveTextContent("A stepmother takes over a house that doesn't want her.");
    expect(tile).toHaveTextContent("2 episodes · 5 scenes · 12 segments");
    expect(tile).toHaveTextContent("about 2 min planned");
    expect(tile).toHaveTextContent("English vertical drama");
    expect(tile).toHaveTextContent("5 minutes ago");
    expect(within(tile).getByText("Family")).toHaveClass("tag");
    expect(within(tile).getByText("Period")).toBeInTheDocument();
    const other = await tileOf(/Bride on Bail/);
    expect(other).not.toHaveTextContent(/scenes|segments|planned|ago/);
  });

  it("makes a poster of the drama's own work when it has some, else the empty cover, never its leads' sheets", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", []);
    answer("/api/dramas", [{ ...stepmother, cast: ["/api/files/7"], cover: { url: "/api/files/9" } }, { ...bride, cast: ["/api/files/8"] }]);
    await renderAt(<Slate />);
    const withWork = await tileOf(/The Stepmother/);
    expect(withWork.querySelector(".pic img")).toHaveAttribute("src", "/api/files/9");
    const empty = await tileOf(/Bride on Bail/);
    expect(empty.querySelector(".pic img")).toBeNull();
    expect(empty.querySelector('[src="/api/files/8"]')).toBeNull();
    expect(empty.querySelector(".emptycover")).toHaveTextContent("Bride on Bail");
  });

  it("greets the maker by the time of day, with what waits for them", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", []);
    answer("/api/dramas", [stepmother, bride]);
    await renderAt(<Slate />);
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    expect(await screen.findByRole("heading", { level: 1, name: greeting })).toBeInTheDocument();
  });

  it("pictures each waiting row by its drama's cover, as design/'s rows are", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", [
      { id: "r1", dramaId: "d1", dramaTitle: "The Stepmother", kind: "takes", state: "open", question: "", items: 1, subjects: ["seg01"], thumb: { url: "/api/files/3", video: true }, createdAt: "2026-10-30T11:56:00Z" },
      { id: "r2", dramaId: "d1", dramaTitle: "The Stepmother", kind: "question", state: "open", question: "How old?", items: 0, subjects: [], createdAt: "2026-10-30T11:50:00Z" },
    ]);
    answer("/api/dramas", [{ ...stepmother, waiting: 2, cover: { url: "/api/files/9" } }]);
    await renderAt(<Slate />);
    const waiting = await screen.findByRole("list", { name: "Waiting for you" });
    // The take's own picture is left for its review: the row and the card read as one drama.
    for (const row of within(waiting).getAllByRole("link")) expect(row.querySelector("img")).toHaveAttribute("src", "/api/files/9");
  });

  it("shows at most two genres on a card, and how many more", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", []);
    answer("/api/dramas", [{ ...stepmother, facts: { ...stepmother.facts, genres: ["Romance", "Contract marriage", "Revenge"] } }]);
    await renderAt(<Slate />);
    const tile = await tileOf(/The Stepmother/);
    expect(within(tile).getByText("Romance")).toBeInTheDocument();
    expect(within(tile).getByText("Contract marriage")).toBeInTheDocument();
    expect(within(tile).queryByText("Revenge")).not.toBeInTheDocument();
    expect(within(tile).getByText("+1")).toBeInTheDocument();
  });

  it("carries on with the drama worked on last, its waiting review first, beside what waits, newest first", async () => {
    answer("/api/app", replay);
    // The older drama's review has waited longer; the newer drama is the one to carry on with.
    answer("/api/reviews", [
      { id: "r0", dramaId: "d2", dramaTitle: "Bride on Bail", kind: "question", state: "open", question: "Old question", items: 0, subjects: [], createdAt: "2026-10-27T11:00:00Z" },
      { id: "r1", dramaId: "d1", dramaTitle: "The Stepmother", episode: "EP001", kind: "takes", state: "open", question: "Two takes wait.", items: 2, subjects: ["seg01", "seg03"], createdAt: "2026-10-30T11:56:00Z" },
    ]);
    answer("/api/dramas", [{ ...bride, waiting: 1, facts: { lastActivity: "2026-10-27T11:00:00Z" } }, { ...stepmother, waiting: 1 }]);
    await renderAt(<Slate />);
    const hero = await screen.findByRole("region", { name: "The Stepmother" });
    expect(within(hero).getByText("“Two takes wait.”", { selector: "blockquote" })).toBeInTheDocument();
    expect(hero).toHaveTextContent("EP001 · 2 takes wait for you");
    expect(within(hero).getByRole("link", { name: "Review takes" })).toHaveAttribute("href", "/r/r1");
    const waiting = within(hero).getByRole("list", { name: "Waiting for you" });
    const rows = within(waiting).getAllByRole("link");
    expect(rows.map((link) => link.getAttribute("href"))).toEqual(["/r/r1", "/r/r0"]);
    // As design/'s rows read: the drama and the episode, then what waits, which, and how long it has waited.
    expect(rows[0]).toHaveTextContent("The Stepmother · EP0012 takes · seg01, seg03 · 4 min");
    expect(rows[1]).toHaveTextContent("Bride on Bail · QuestionQuestion · 3 days");
    expect(screen.getByText("2 decisions wait for you across your dramas.")).toBeInTheDocument();
  });

  it("sorts the shelf by when each drama was last worked on, or by title", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    answer("/api/app", replay);
    answer("/api/reviews", []);
    answer("/api/dramas", [{ ...bride, facts: { lastActivity: "2026-10-27T11:00:00Z" } }, stepmother]);
    await renderAt(<Slate />);
    const shelf = await screen.findByRole("tabpanel");
    const titles = () => [...shelf.querySelectorAll(".pcard b")].map((title) => title.textContent);
    await waitFor(() => expect(titles()).toEqual(["The Stepmother", "Bride on Bail"]));
    await user.click(screen.getByRole("button", { name: /Last edited/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Title" }));
    expect(titles()).toEqual(["Bride on Bail", "The Stepmother"]);
    expect(screen.getByRole("button", { name: /Title/ })).toBeInTheDocument();
  });

  it("ends the shelf with New drama, a drop target that opens Upload with the dropped screenplay", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", []);
    answer("/api/dramas", [stepmother]);
    const { router } = await renderAt(<Slate />);
    const card = await within(await screen.findByRole("tabpanel")).findByRole("link", { name: /New drama/ });
    expect(card).toHaveTextContent("Drop a screenplay here");
    expect(card).toHaveTextContent("Fountain, Word, PDF or plain text");
    const file = new File(["EPISODE 1"], "stepmother.fountain");
    fireEvent.drop(card, { dataTransfer: { files: [file], items: [{ kind: "file", type: "", getAsFile: () => file }], types: ["Files"] } });
    await waitFor(() => expect(href(router)).toBe("/new"));
    expect(takeDroppedScreenplay()).toBe(file);
    expect(takeDroppedScreenplay()).toBeUndefined();
  });

  it("has the prototype's shelves, a stopped drama under All only", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", []);
    answer("/api/dramas", [stepmother, bride]);
    await renderAt(<Slate />);
    const tabs = await screen.findByRole("tablist");
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["All2", "Needs you0", "Working1", "Done0"]);
  });

  it("offers the latest drama to carry on with, and the agent's last line, when nothing waits", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", []);
    answer("/api/dramas", [bride, stepmother]);
    await renderAt(<Slate />);
    const hero = await screen.findByRole("region", { name: "The Stepmother" });
    expect(hero).toHaveTextContent("Drawing the storyboards for EP001");
    expect(hero).toHaveTextContent(/updated \d+ \w+ ago/);
    expect(within(hero).getByRole("link", { name: /Open drama/ })).toHaveAttribute("href", "/d/d1/episodes");
  });

  it("shows a red line waiting on the maker as its own state, under Needs you", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", [
      { id: "r7", dramaId: "d2", dramaTitle: "Bride on Bail", episode: "EP007", kind: "question", state: "open", question: "A red line.", items: 0, subjects: [], stop: { kind: "red-line" }, createdAt: "2026-10-30T11:58:00Z" },
    ]);
    answer("/api/dramas", [stepmother, { ...bride, status: "production", waiting: 1 }]);
    await renderAt(<Slate />);
    const waiting = await screen.findByRole("list", { name: "Waiting for you" });
    expect(within(waiting).getByRole("link")).toHaveTextContent("Bride on Bail · EP007Red line · 2 min");
    expect((await tileOf(/Bride on Bail/)).parentElement?.querySelector(".st.redline")).toHaveTextContent("Red line");
    expect(within(screen.getByRole("tablist")).getByRole("tab", { name: /Needs you/ })).toHaveTextContent("1");
  });

  it("opens Reviews for a drama from its card's pill, and the whole queue from See all (IA §16)", async () => {
    answer("/api/app", replay);
    answer("/api/reviews", [
      { id: "r1", dramaId: "d1", dramaTitle: "The Stepmother", episode: "EP001", kind: "takes", state: "open", question: "", items: 2, subjects: ["seg01", "seg03"], createdAt: "2026-10-30T11:56:00Z" },
      { id: "r2", dramaId: "d2", dramaTitle: "Bride on Bail", episode: "EP004", kind: "storyboards", state: "open", question: "", items: 6, subjects: [], createdAt: "2026-10-30T11:50:00Z" },
    ]);
    answer("/api/dramas", [{ ...stepmother, waiting: 1 }, { ...bride, status: "production", waiting: 1 }]);
    await renderAt(<Slate />);
    const waiting = await screen.findByRole("list", { name: "Waiting for you" });
    expect(within(waiting).getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "1 need you", description: "Open Reviews for Bride on Bail" })).toHaveAttribute("href", "/reviews?drama=d2");
    expect(screen.getByRole("link", { name: "See all 2 in Reviews" })).toHaveAttribute("href", "/reviews");
  });
});
