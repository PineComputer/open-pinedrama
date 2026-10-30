// The pipeline as the studio's boards lay it out, one table for Canvas and Graph: the column each
// kind of drama-cli stage stands in, left to right as the work flows (the pro prototype's
// pipeline: the script, the cast, places and props, then per segment blocking, storyboard and
// take, then the cut), its name and its tone; and the one map from a stage's folder (drama-cli's
// lineage id, short_drama drama_cli/lineage.py) to the canvas item that shows it.
import type { LineageKind } from "./lineage.ts";

export interface Lane {
  column: number;
  /** Its name, an i18n key. */
  label: `pipeline.${LineageKind}`;
  /** The token its accent is drawn in. */
  tone: string;
}

const lane = (kind: LineageKind, column: number, tone: string): Lane => ({ column, label: `pipeline.${kind}`, tone });

export const PIPELINE: Record<LineageKind, Lane> = {
  screenplay: lane("screenplay", 0, "--text-tertiary"),
  bible: lane("bible", 0, "--text-tertiary"),
  breakdown: lane("breakdown", 1, "--text-tertiary"),
  look: lane("look", 2, "--accent"),
  plate: lane("plate", 3, "--accent-warm"),
  prop: lane("prop", 3, "--accent-warm"),
  blocking: lane("blocking", 4, "--text-secondary"),
  first_frame_reference: lane("first_frame_reference", 4, "--text-secondary"),
  storyboard: lane("storyboard", 5, "--accent-amber"),
  video_prompts: lane("video_prompts", 5, "--text-tertiary"),
  take: lane("take", 6, "--success"),
  subtitles: lane("subtitles", 7, "--text-tertiary"),
  cut: lane("cut", 7, "--agent"),
};

/** A canvas item's kind: a shared reference, one of a segment's stages (its storyboard is its card), or the episode's cut. */
export type ItemKind = "character" | "location" | "prop" | "blocking" | "segment" | "take" | "cut";

/** The stage kind each canvas item shows, so the canvas takes its lanes from PIPELINE. */
export const SHOWS: Record<ItemKind, LineageKind> = { character: "look", location: "plate", prop: "prop", blocking: "blocking", segment: "storyboard", take: "take", cut: "cut" };

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^assets\/characters\/([^/]+)/, (m) => `character:${m[1]}`],
  [/^assets\/scenes\/([^/]+)/, (m) => `location:${m[1]}`],
  [/^assets\/props\/([^/]+)/, (m) => `prop:${m[1]}`],
  [/^episodes\/(EP\d+)\/blocking\/([^/]+)/, (m) => `blocking:${m[1]}/${m[2]}`],
  [/^episodes\/(EP\d+)\/multi_panel_storyboard\/([^/]+)/, (m) => `segment:${m[1]}/${m[2]}`],
  [/^episodes\/(EP\d+)\/segments\/([^/]+)/, (m) => `take:${m[1]}/${m[2]}`],
  [/^episodes\/(EP\d+)\/edit$/, (m) => `cut:${m[1]}`],
];

/**
 * The canvas item a stage's folder is shown by: a character by its looks, a location by its
 * plates and times, a segment by its storyboards. Undefined for a stage the canvas shows no item
 * for (the bible, a breakdown, video prompts).
 */
export function boardIdOf(stage: string): string | undefined {
  for (const [rule, id] of RULES) {
    const m = stage.match(rule);
    if (m) return id(m);
  }
  return undefined;
}
