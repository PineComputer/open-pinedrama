// What the drama tree in the sidebar counts (IA_PROPOSAL §2, §16; design/app.js, Side): what waits for the maker at
// each of the drama's places, how many characters, locations and props its Assets shelves hold, its open reviews and
// what is out of date. Each count comes from the resource the place itself shows, so the tree and the page agree.
import { type Lineage, outOfDate } from "../../shared/lineage.ts";
import type { BibleStatus } from "../../shared/project.ts";
import type { CastCard, EpisodeRow, ReviewKind, ReviewSummary, ScreenplayVersion } from "../../shared/types.ts";

export type TreePlace = "assets" | "delivery";

/**
 * Where an episode stands in the tree, as its dot shows it (principle "Five maker-facing states"): it needs the maker when
 * it waits for a decision, or stopped or failed and waits for Resume or the next step. paused: the maker paused the
 * project (labels.ts isPaused); an episode stopped with it is paused, a neutral dot, since nothing waits on the maker
 * there but the top bar's Resume; a review it waits on stays counted in Reviews and Next review (master, D74).
 */
export type Mark = "you" | "work" | "done" | "line" | "paused";
export function markOf(row: EpisodeRow, paused: boolean): Mark {
  if (paused && row.state === "stopped") return "paused";
  if (row.state === "waiting" || row.state === "stopped" || row.state === "failed") return "you";
  if (row.state === "working") return "work";
  return row.state === "done" ? "done" : "line";
}

export interface DramaTree {
  /** Open reviews, by the place where each is decided (IA §16, rule 2). */
  needs: Record<TreePlace, number>;
  /** The episodes that need the maker: exactly those whose dot says so (merecdesperez44323-lab's Y10). */
  episodes: number;
  /** The Assets shelves, by the cards the Assets page shows (/api/dramas/:id/cast). */
  shelves: { characters: number; locations: number; props: number };
  /** Every open review of the drama: its filter of the one Reviews queue. */
  reviews: number;
  /** How many items the drama's Out of date holds (lineage.ts, outOfDate). */
  outOfDate: number;
}

// Where each kind of review is decided off an episode: looks and shared references on their cards in Assets, a cut in
// Delivery's row. What waits in an episode is its dot; Script says where the screenplay stands (scriptNow).
const PLACE: Partial<Record<ReviewKind, TreePlace>> = { looks: "assets", references: "assets", cut: "delivery" };

/**
 * Where the screenplay stands, for the tree's Script row, as an episode row says it (design/screens.js, scriptRow; the
 * five maker states' dots): the version that waits for the maker's answer, accepted only as drama-cli's lineage records
 * it (its screenplay node's working version is the accepted one), or only the original when no version was recorded.
 * Never a rewrite the studio infers from a running setup (D64 as amended for C14).
 */
export function scriptNow(versions: ScreenplayVersion[], lineage: Lineage | null): { now: "waiting" | "accepted" | "original"; mark: Mark } | undefined {
  if (versions.some((version) => version.question?.state === "open")) return { now: "waiting", mark: "you" };
  const screenplay = lineage?.nodes.find((node) => node.kind === "screenplay");
  if (screenplay?.accepted && screenplay.accepted === screenplay.version) return { now: "accepted", mark: "done" };
  if (!versions.length) return { now: "original", mark: "line" };
  return undefined;
}

/**
 * Where the bible stands, for the tree's Bible row, from drama-cli's status of it (D64 as amended for C14): not started
 * before a working version, accepted when the working version is the accepted one, otherwise that version, not accepted.
 */
export function bibleNow(bible: BibleStatus | undefined): { now: "notStarted" | "accepted" | "candidate"; version?: string; mark: Mark } {
  if (!bible?.current) return { now: "notStarted", mark: "line" };
  if (bible.accepted === bible.current) return { now: "accepted", mark: "done" };
  return { now: "candidate", version: bible.current, mark: "work" };
}

export function dramaTree({ cast, reviews, lineage, rows, paused }: { cast: CastCard[]; reviews: ReviewSummary[]; lineage: Lineage | null; rows: EpisodeRow[]; paused: boolean }): DramaTree {
  const needs: Record<TreePlace, number> = { assets: 0, delivery: 0 };
  const open = reviews.filter((review) => review.state === "open");
  for (const review of open) {
    const place = PLACE[review.kind];
    if (place) needs[place]++;
  }
  const shelf = (kind: CastCard["kind"]) => cast.filter((card) => card.kind === kind).length;
  return { needs, episodes: rows.filter((row) => markOf(row, paused) === "you").length, shelves: { characters: shelf("look"), locations: shelf("location"), props: shelf("prop") }, reviews: open.length, outOfDate: lineage ? outOfDate(lineage).size : 0 };
}
