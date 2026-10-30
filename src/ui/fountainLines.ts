// A Fountain file as the lines a screenplay prints, from fountain-js's tokens (the JavaScript Fountain parser,
// https://github.com/jonnygreenwald/fountain-js). Each line carries the element class design/studio.css styles
// (.fl.heading, .fl.character, ...); a gap opens each block. Notes, boneyard and synopses don't print (fountain.io, syntax):
// the lexer drops boneyard, the note and synopsis tokens have no line, and an inline note goes by fountain-js's own rule.
import { Fountain, rules } from "fountain-js";

export type FountainLine = { gap: true } | { gap?: false; el: string; text: string };

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
  const lines: FountainLine[] = [];
  for (const token of new Fountain().parse(text, true).tokens) {
    if (token.is_title) {
      lines.push({ el: "action", text: `${token.type}: ${token.text ?? ""}` });
      continue;
    }
    const last = lines.at(-1);
    if (BLOCK.has(token.type) && last && !last.gap) lines.push({ gap: true });
    const el = ELEMENT[token.type];
    const text = (token.text ?? "").replace(rules.note_inline, "").trimEnd();
    if (el) lines.push({ el, text: token.scene_number ? `${text} #${token.scene_number}#` : text });
  }
  return lines;
}
