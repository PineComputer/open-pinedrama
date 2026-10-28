import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown.tsx";

describe("a returned Markdown document", () => {
  it("keeps a fenced block line for line, as a screenplay rewrite's review gives its line table", () => {
    // The form short_drama's `screenplay validate` writes to drama/screenplay/vN/review.md (PR #629).
    const text = [
      "# The rewrite of screenplay.txt",
      "",
      "## Each line of the original, with what the rewrite made of it",
      "",
      "```text",
      "    1 | 第一集 | episode",
      "    2 | 1-1  夜  内  华丽宴会厅 | heading",
      "```",
      "",
      "## Added by the rewrite",
      "",
      "None.",
    ].join("\n");
    const html = renderToStaticMarkup(createElement(Markdown, { text }));
    expect(html).toContain('<pre class="fenced">    1 | 第一集 | episode\n    2 | 1-1  夜  内  华丽宴会厅 | heading</pre>');
    expect(html).toContain("<h3>Added by the rewrite</h3>");
    expect(html).toContain("<p>None.</p>");
  });
});
