// The Fountain a peek shows: each element as the line a screenplay prints, a gap before each block, notes left out.
import { describe, expect, it } from "vitest";
import { fountainLines } from "./fountainLines.ts";

describe("fountainLines", () => {
  it("gives each element its line class, the file's line it was written on, and a heading its scene number; opens each block with a gap and leaves notes out", () => {
    const text = "Title: 后妈\n\n# Act One\n\nINT. TENEMENT FLAT - DAY #1-1#\n\nLin stares at the door.\n[[a note]]\n\nLIN\n(quietly)\nOpen it.\n\nCUT TO:";
    expect(fountainLines(text)).toEqual([
      { el: "action", text: "title: 后妈", source: 0 },
      { gap: true },
      { el: "section", text: "# Act One", source: 2 },
      { gap: true },
      { el: "heading", text: "INT. TENEMENT FLAT - DAY #1-1#", source: 4 },
      { gap: true },
      { el: "action", text: "Lin stares at the door.", source: 6 },
      { gap: true },
      { el: "character", text: "LIN", source: 9 },
      { el: "paren", text: "(quietly)", source: 10 },
      { el: "dialogue", text: "Open it.", source: 11 },
      { gap: true },
      { el: "transition", text: "CUT TO:", source: 13 },
    ]);
  });
});
