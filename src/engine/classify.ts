// What a returned file probably is, from its path. Pine guarantees a file's path, size,
// hash and type, not what it shows, so these are hints: every screen also works from the
// agent's own words and the plain file list (docs/IMPLEMENTATION_PLAN.md, rule 5). The
// patterns follow the folders the drama skill writes, wherever they sit in the path.
import type { FileKind } from "../shared/types.ts";

export interface Hints {
  kind: FileKind;
  episode?: string;
  segment?: string;
  subject?: string;
  look?: string;
  style?: string;
  version?: string;
}

const IMAGE = String.raw`\.(?:png|jpe?g|webp|svg)$`;
const VIDEO = String.raw`\.(?:mp4|mov|webm)$`;
const SEG = String.raw`(seg\d+[a-z]?)`;
const VER = String.raw`(v\d+)`;

const RULES: [RegExp, (m: RegExpMatchArray) => Hints][] = [
  [new RegExp(String.raw`episodes/(EP\d+)/edit/${VER}/[^/]+${VIDEO}`, "i"), (m) => ({ kind: "cut", episode: m[1], version: m[2] })],
  [new RegExp(String.raw`episodes/(EP\d+)/segments/${SEG}/(t\d+)/[^/]+${VIDEO}`, "i"), (m) => ({ kind: "take", episode: m[1], segment: m[2], version: m[3] })],
  [
    new RegExp(String.raw`episodes/(EP\d+)/multi_panel_storyboard/${SEG}/([^/]+)/${VER}/[^/]+${IMAGE}`, "i"),
    (m) => ({ kind: "storyboard", episode: m[1], segment: m[2], style: m[3], version: m[4] }),
  ],
  [new RegExp(String.raw`episodes/(EP\d+)/blocking/${SEG}/${VER}/[^/]+${IMAGE}`, "i"), (m) => ({ kind: "blocking", episode: m[1], segment: m[2], version: m[3] })],
  [new RegExp(String.raw`episodes/(EP\d+)/breakdown/${VER}/[^/]+\.(?:md|json)$`, "i"), (m) => ({ kind: "breakdown", episode: m[1], version: m[2] })],
  [
    new RegExp(String.raw`assets/characters/([^/]+)/states/([^/]+)/${VER}/[^/]+${IMAGE}`, "i"),
    (m) => ({ kind: "look", subject: m[1], look: m[2], version: m[3] }),
  ],
  [new RegExp(String.raw`assets/characters/([^/]+)/${VER}/[^/]+${IMAGE}`, "i"), (m) => ({ kind: "look", subject: m[1], look: "base", version: m[2] })],
  [new RegExp(String.raw`assets/scenes/([^/]+)/(?:[^/]+/)?${VER}/[^/]+${IMAGE}`, "i"), (m) => ({ kind: "location", subject: m[1], version: m[2] })],
  [new RegExp(String.raw`assets/props/([^/]+)/${VER}/[^/]+${IMAGE}`, "i"), (m) => ({ kind: "prop", subject: m[1], version: m[2] })],
  [new RegExp(String.raw`(?:^|/)bible/${VER}/bible\.(?:md|json)$`, "i"), (m) => ({ kind: "bible", version: m[1] })],
  [/(?:^|\/)understanding\//i, () => ({ kind: "observation" })],
];

export function classify(relPath: string): Hints {
  const normal = relPath.replaceAll("\\", "/");
  for (const [pattern, hints] of RULES) {
    const match = normal.match(pattern);
    if (match) {
      const found = hints(match);
      return { ...found, episode: found.episode && episodeCode(found.episode) };
    }
  }
  return { kind: "other" };
}

/** EP1, ep001 and EP0001 all mean EP001. */
export function episodeCode(value: string | number): string {
  const n = typeof value === "number" ? value : Number(String(value).replace(/\D/g, ""));
  return `EP${String(n).padStart(3, "0")}`;
}

/**
 * The episodes a summary lists, one per line as "EP001: title" (the setup goal asks for
 * this form). Lines that don't match are ignored.
 */
export function listedEpisodes(text: string): { number: number; title: string }[] {
  const found = new Map<number, string>();
  for (const line of text.split("\n")) {
    const match = line.match(/\bEP\s*0*(\d{1,4})\b\s*[:：.、\-–—]?\s*(.*)$/i);
    if (match) {
      const number = Number(match[1]);
      if (number > 0 && !found.has(number)) found.set(number, match[2].trim().replace(/^["“「]|["”」]$/g, ""));
    }
  }
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([number, title]) => ({ number, title }));
}
