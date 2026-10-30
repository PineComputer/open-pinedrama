// A cut's clips, read from drama-cli's plan of the cut: the cut.json it writes beside cut.mp4
// (short_drama drama_cli/edit.py, `build`). Each clip is a segment's take, played from its `in`
// to its `out` in seconds, and the clips play one after another, each starting where the one
// before ends (edit.py, `_join` and `_encode`). The plan states the cut's output too, its frame
// rate among it (edit.py, `_encode`, `fps={output['fps']}`), by which the cut viewer steps a frame.
// The studio reads the clips and the frame rate.
import type { CutClip } from "../shared/types.ts";
import { classify } from "./classify.ts";

/** A cut.json, as parsed JSON: its clips timed in the cut, and its frame rate. Throws, saying what is wrong, for a plan that isn't one. */
export function readCutPlan(plan: unknown): { clips: CutClip[]; fps: number } {
  const { clips, output } = plan && typeof plan === "object" ? (plan as { clips?: unknown; output?: { fps?: unknown } }) : {};
  if (!Array.isArray(clips) || !clips.length) throw new Error("cut.json lists no clips");
  const fps = output && typeof output === "object" ? output.fps : undefined;
  if (typeof fps !== "number" || !Number.isFinite(fps) || fps <= 0) throw new Error("cut.json states no output frame rate (output.fps)");
  let start = 0;
  const timed = clips.map((clip: unknown, index) => {
    const which = `clip ${index + 1} of cut.json`;
    if (!clip || typeof clip !== "object") throw new Error(`${which} is not an object`);
    const { path, in: from, out } = clip as Record<string, unknown>;
    const take = typeof path === "string" ? classify(path) : undefined;
    if (take?.kind !== "take" || !take.segment || !take.version) throw new Error(`${which} is not a segment's take: ${JSON.stringify(path)}`);
    if (typeof from !== "number" || typeof out !== "number" || !Number.isFinite(from) || !Number.isFinite(out) || from < 0 || out <= from) {
      throw new Error(`${which} has no in and out in seconds, out after in: ${JSON.stringify({ in: from, out })}`);
    }
    const entry = { segment: take.segment, take: take.version, start, end: start + out - from };
    start = entry.end;
    return entry;
  });
  return { clips: timed, fps };
}
