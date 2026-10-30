// A Fountain file as the lines a screenplay prints, from fountain-js's tokens (the JavaScript Fountain parser,
// https://github.com/jonnygreenwald/fountain-js). Each line carries the element class design/studio.css styles
// (.fl.heading, .fl.character, ...), and a gap opens each block; a section keeps its # marks and a heading its number,
// as design/data.js shows them. Notes, boneyard and synopses don't print (fountain.io, syntax): the lexer drops
// boneyard, the note and synopsis tokens have no line, and an inline note goes by fountain-js's own rule.
import { Fountain, rules } from "fountain-js";

/** A printed line, and the file's line it was written on (0-based), so a review can set it beside what it came from. */
export type FountainLine = { gap: true } | { gap?: false; el: string; text: string; source?: number };

const ELEMENT: Record<string, string> = {
  section: "section",
  scene_heading: "heading",
  action: "action",
  centered: "action",
  lyrics: "action",
  character: "character",
  parenthetical: "paren",
  dialogue: "dialogue",
  transition: "transition",
};
const BLOCK = new Set(["section", "scene_heading", "action", "centered", "lyrics", "dialogue_begin", "transition", "page_break"]);

export function fountainLines(text: string): FountainLine[] {
  const file = text.replace(/\r/g, "").split("\n");
  // fountain-js's tokens carry no position: each printed line is the next line of the file that holds its text.
  let cursor = 0;
  const sourceOf = (written: string): number | undefined => {
    const wanted = written.trim();
    if (!wanted) return undefined;
    const found = file.findIndex((line, index) => index >= cursor && line.includes(wanted));
    if (found < 0) return undefined;
    cursor = found + 1;
    return found;
  };
  const lines: FountainLine[] = [];
  for (const token of new Fountain().parse(text, true).tokens) {
    if (token.is_title) {
      lines.push({ el: "action", text: `${token.type}: ${token.text ?? ""}`, source: sourceOf((token.text ?? "").split("\n")[0]!) });
      continue;
    }
    const last = lines.at(-1);
    if (BLOCK.has(token.type) && last && !last.gap) lines.push({ gap: true });
    const el = ELEMENT[token.type];
    if (!el) continue;
    for (const written of (token.text ?? "").split("\n")) {
      const source = sourceOf(written);
      const shown = written.replace(rules.note_inline, "").trimEnd();
      const marked = token.type === "section" ? `${"#".repeat(token.depth ?? 1)} ${shown}` : token.scene_number ? `${shown} #${token.scene_number}#` : shown;
      if (shown) lines.push({ el, text: marked, source });
    }
  }
  return lines;
}
