// drama-cli's breakdown.json, the part the canvas shows: each segment's shots (short_drama drama_cli/schemas/breakdown.py,
// Breakdown.segments, Segment.id and Segment.shots; Shot.time, size, angle, camera, visual and audio). Read as drama-cli
// writes it: a missing or mistyped field is an error that names it, never a guess. The other fields are left unread.

/** One shot, in drama-cli's fields: time ("0-3s"), size and angle (its enums), camera, what is seen, what is heard. */
export interface Shot {
  time: string;
  size: string;
  angle: string;
  camera: string;
  visual: string;
  audio: string;
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
      const shots = list(segment.shots, `segments[${n}].shots`).map((shot, m) => {
        const fields = object(shot, `segments[${n}].shots[${m}]`);
        return Object.fromEntries(SHOT_FIELDS.map((key) => [key, text(fields[key], `segments[${n}].shots[${m}].${key}`)])) as unknown as Shot;
      });
      return [text(segment.id, `segments[${n}].id`), shots];
    }),
  );
}
