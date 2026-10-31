// drama-cli's breakdown.json, the part the canvas shows: each segment's shots (short_drama drama_cli/schemas/breakdown.py,
// Breakdown.segments, Segment.id, Segment.shots and Segment.dialogue; Shot.time, size, angle, camera, visual, audio and
// lines, the positions in the segment's dialogue of the lines it speaks, optional; Line.speaker and line). Read as
// drama-cli writes it: a missing or mistyped field is an error that names it, never a guess. The others are left unread.

/** One shot, in drama-cli's fields: time ("0-3s"), size and angle (its enums), camera, what is seen, what is heard. */
export interface Shot {
  time: string;
  size: string;
  angle: string;
  camera: string;
  visual: string;
  audio: string;
  /** The lines the shot speaks, each as "speaker: line" (Shot.lines into Segment.dialogue). */
  dialogue: string[];
}

export class BreakdownError extends Error {
  constructor(field: string, expected: string) {
    super(`drama-cli's breakdown.json: ${field} is not ${expected}`);
  }
}

const SHOT_FIELDS = ["time", "size", "angle", "camera", "visual", "audio"] as const;

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BreakdownError(field, "an object");
  return value as Record<string, unknown>;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new BreakdownError(field, "a list");
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new BreakdownError(field, "a string");
  return value;
}

/** Each segment's shots, by segment id, in the breakdown's order. */
export function breakdownShots(value: unknown): Map<string, Shot[]> {
  const segments = list(object(value, "breakdown").segments, "segments");
  return new Map(
    segments.map((raw, n) => {
      const segment = object(raw, `segments[${n}]`);
      const dialogue = list(segment.dialogue, `segments[${n}].dialogue`).map((line, d) => {
        const fields = object(line, `segments[${n}].dialogue[${d}]`);
        return `${text(fields.speaker, `segments[${n}].dialogue[${d}].speaker`)}: ${text(fields.line, `segments[${n}].dialogue[${d}].line`)}`;
      });
      const shots = list(segment.shots, `segments[${n}].shots`).map((shot, m) => {
        const field = `segments[${n}].shots[${m}]`;
        const fields = object(shot, field);
        const lines = fields.lines === undefined ? [] : list(fields.lines, `${field}.lines`).map((at, l) => {
          if (typeof at !== "number" || !Number.isInteger(at) || at < 0 || at >= dialogue.length) throw new BreakdownError(`${field}.lines[${l}]`, `a position in segments[${n}].dialogue`);
          return dialogue[at];
        });
        return { ...(Object.fromEntries(SHOT_FIELDS.map((key) => [key, text(fields[key], `${field}.${key}`)])) as Omit<Shot, "dialogue">), dialogue: lines };
      });
      return [text(segment.id, `segments[${n}].id`), shots];
    }),
  );
}
