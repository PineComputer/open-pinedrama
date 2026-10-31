// The drama tree's counts, from what each of the drama's places shows.
import { describe, expect, it } from "vitest";
import type { Lineage, LineageKind, LineageNode } from "../../shared/lineage.ts";
import { type CastCard, type EpisodeRow, type ReviewKind, type ReviewState, type ReviewSummary, type ScreenplayVersion, STAGES } from "../../shared/types.ts";
import { bibleNow, dramaTree, markOf, scriptNow } from "./tree.ts";

function review(kind: ReviewKind, state: ReviewState = "open", episode?: string): ReviewSummary {
  return { id: `${kind}-${episode ?? "drama"}-${state}`, dramaId: "d1", dramaTitle: "The Stepmother", episode, kind, state, question: "", items: 1, subjects: [], createdAt: "2026-10-30T10:00:00Z" };
}

const card = (kind: CastCard["kind"], subject: string): CastCard => ({ kind, subject, looks: [], episodes: [] });

function node(id: string, kind: LineageKind, fresh: boolean | null = true): LineageNode {
  return { id, kind, column: 0, version: "v1", accepted: "v1", fresh, problems: [], shows: null, reads: [], label: id, where: {}, box: { x: 0, y: 0, w: 1, h: 1 }, section: "Text" };
}

describe("the drama tree", () => {
  it("counts each open review where it is decided off an episode, and only open ones", () => {
    const tree = dramaTree({
      cast: [],
      lineage: null,
      rows: [],
      paused: false,
      reviews: [review("looks"), review("references"), review("storyboards", "open", "EP004"), review("takes", "open", "EP006"), review("cut", "open", "EP001"), review("question"), review("question", "open", "EP007"), review("takes", "answered", "EP002"), review("looks", "saving")],
    });
    expect(tree.needs).toEqual({ assets: 2, delivery: 1 });
    expect(tree.reviews).toBe(7);
  });

  it("counts the Assets shelves by the cards the Assets page shows", () => {
    const tree = dramaTree({ cast: [card("look", "ivy"), card("look", "luca"), card("location", "garden"), card("prop", "file")], reviews: [], lineage: null, rows: [], paused: false });
    expect(tree.shelves).toEqual({ characters: 2, locations: 1, props: 1 });
  });

  it("counts as out of date what drama-cli calls stale and what was made from it, not what it can't judge", () => {
    const lineage: Lineage = {
      project: "/work/drama",
      nodes: [node("bible", "bible"), node("assets/props/file", "prop", false), node("episodes/EP006/segments/seg03", "take"), node("episodes/EP006/cut", "cut"), node("assets/characters/ivy", "look", null)],
      links: [
        { from: "assets/props/file", to: "episodes/EP006/segments/seg03" },
        { from: "episodes/EP006/segments/seg03", to: "episodes/EP006/cut" },
        { from: "bible", to: "assets/characters/ivy" },
      ],
      groups: [],
    };
    expect(dramaTree({ cast: [], reviews: [], lineage, rows: [], paused: false }).outOfDate).toBe(3);
    expect(dramaTree({ cast: [], reviews: [], lineage: null, rows: [], paused: false }).outOfDate).toBe(0);
  });

  it("counts as needing the maker exactly the episodes whose dot says so: waiting, stopped or failed (merecdesperez44323-lab's Y10)", () => {
    const row = (code: string, state: EpisodeRow["state"]) => ({ id: code, number: 1, code, title: "", state, stages: Object.fromEntries(STAGES.map((stage) => [stage, { state: "none" }])), spent: { total: 0, media: 0, partial: false }, updatedAt: "" }) as unknown as EpisodeRow;
    const rows = [row("EP001", "waiting"), row("EP002", "working"), row("EP003", "stopped"), row("EP004", "failed"), row("EP005", "queued"), row("EP006", "done")];
    expect(dramaTree({ cast: [], reviews: [], lineage: null, rows, paused: false }).episodes).toBe(3);
  });

  it("while the maker has paused the project, marks an episode stopped with it paused and counts it as no longer needing the maker (D74)", () => {
    const row = (code: string, state: EpisodeRow["state"]) => ({ id: code, number: 1, code, title: "", state, stages: Object.fromEntries(STAGES.map((stage) => [stage, { state: "none" }])), spent: { total: 0, media: 0, partial: false }, updatedAt: "" }) as unknown as EpisodeRow;
    expect(markOf(row("EP001", "stopped"), true)).toBe("paused");
    expect(markOf(row("EP001", "stopped"), false)).toBe("you");
    // A review that still waits is answerable while paused: that episode still needs the maker.
    expect(markOf(row("EP002", "waiting"), true)).toBe("you");
    const rows = [row("EP001", "stopped"), row("EP002", "waiting"), row("EP003", "done")];
    expect(dramaTree({ cast: [], reviews: [], lineage: null, rows, paused: true }).episodes).toBe(1);
  });

  it("says where the screenplay stands on Script's row, as an episode row does, accepted only as drama-cli's lineage records it (D64)", () => {
    const version = (state?: "open" | "answered", verdict?: "approve" | "revise"): ScreenplayVersion => ({ version: "v1", question: state && { reviewId: "r1", state, verdict } });
    const screenplay = (accepted: string | null) => ({ nodes: [{ id: "screenplay", kind: "screenplay", version: "v1", accepted, fresh: true }], links: [], groups: [] }) as unknown as Lineage;
    expect(scriptNow([version("open")], screenplay(null))).toEqual({ now: "waiting", mark: "you" });
    expect(scriptNow([version("answered", "approve")], screenplay("v1"))).toEqual({ now: "accepted", mark: "done" });
    // The maker's approve verdict is history: until drama-cli records the acceptance, the row says nothing it doesn't know.
    expect(scriptNow([version("answered", "approve")], screenplay(null))).toBeUndefined();
    expect(scriptNow([version("answered", "revise")], screenplay(null))).toBeUndefined();
  });

  it("never says Accepted without a recorded acceptance: a project with no recorded version is Original only, waiting in line", () => {
    // The Double Life (r4), past its setup with episodes made, recorded no screenplay version.
    expect(scriptNow([], null)).toEqual({ now: "original", mark: "line" });
    // A version answered before the verdict existed is no recorded acceptance either.
    expect(scriptNow([{ version: "v1", question: { reviewId: "r1", state: "answered", words: "Yes." } }], null)).toBeUndefined();
  });

  it("says where the bible stands on Bible's row from drama-cli's status of it (D64)", () => {
    const bible = (current: string | null, accepted: string | null) => ({ current, candidate: accepted === current ? null : current, accepted, usable: accepted !== null, run: [], errors: [] });
    expect(bibleNow(undefined)).toEqual({ now: "notStarted", mark: "line" });
    expect(bibleNow(bible(null, null))).toEqual({ now: "notStarted", mark: "line" });
    // Codex rc5 T11: status said candidate v7 while the tree said Not started.
    expect(bibleNow(bible("v7", null))).toEqual({ now: "candidate", version: "v7", mark: "work" });
    expect(bibleNow(bible("v4", "v4"))).toEqual({ now: "accepted", mark: "done" });
  });
});
