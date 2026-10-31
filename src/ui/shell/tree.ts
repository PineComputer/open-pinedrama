// What the drama tree in the sidebar counts (IA_PROPOSAL §2, §16; design/app.js, Side): what waits for the maker at
// each of the drama's places, how many characters, locations and props its Assets shelves hold, its open reviews and
// what is out of date. Each count comes from the resource the place itself shows, so the tree and the page agree.
import { type Lineage, outOfDate } from "../../shared/lineage.ts";
import type { CastCard, ReviewKind, ReviewSummary } from "../../shared/types.ts";

export type TreePlace = "script" | "assets" | "episodes" | "delivery";

export interface DramaTree {
  /** Open reviews, by the place where each is decided (IA §16, rule 2). */
  needs: Record<TreePlace, number>;
  /** The Assets shelves, by the cards the Assets page shows (/api/dramas/:id/cast). */
  shelves: { characters: number; locations: number; props: number };
  /** Every open review of the drama: its filter of the one Reviews queue. */
  reviews: number;
  /** How many items the drama's Out of date holds (lineage.ts, outOfDate). */
  outOfDate: number;
}

// Where each kind of review is decided: looks and shared references on their cards in Assets, storyboards and takes
// in their episode, a cut in Delivery's row; a question in its episode, or, before there are any, about the screenplay.
const PLACE: Record<Exclude<ReviewKind, "question">, TreePlace> = { looks: "assets", references: "assets", storyboards: "episodes", takes: "episodes", cut: "delivery" };

export function dramaTree({ cast, reviews, lineage }: { cast: CastCard[]; reviews: ReviewSummary[]; lineage: Lineage | null }): DramaTree {
  const needs: Record<TreePlace, number> = { script: 0, assets: 0, episodes: 0, delivery: 0 };
  const open = reviews.filter((review) => review.state === "open");
  for (const review of open) needs[review.kind === "question" ? (review.episode ? "episodes" : "script") : PLACE[review.kind]]++;
  const shelf = (kind: CastCard["kind"]) => cast.filter((card) => card.kind === kind).length;
  return { needs, shelves: { characters: shelf("look"), locations: shelf("location"), props: shelf("prop") }, reviews: open.length, outOfDate: lineage ? outOfDate(lineage).size : 0 };
}
