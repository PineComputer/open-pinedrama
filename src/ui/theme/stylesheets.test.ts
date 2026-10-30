// The studio's own stylesheets keep to the text-on-ground pairs contrast.test.ts allows: no
// letters in --text-subtle, and no muted letters on the high container or a hover or selected
// ground. A rule is read on its own; what one rule inherits from another is axe's to catch on
// the pages the end-to-end tests visit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SHEETS = ["../styles.css", "../components/components.css", "../shell/shell.css", "../screens/canvas.css", "./base.css"];

interface Rule {
  sheet: string;
  selector: string;
  body: string;
}

function rules(): Rule[] {
  return SHEETS.flatMap((sheet) => {
    const css = readFileSync(new URL(sheet, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sheet, selector: m[1].trim(), body: m[2] }));
  });
}

const colour = (body: string) => body.match(/(?:^|;)\s*color:\s*([^;]+)/)?.[1].trim();
const ground = (body: string) => body.match(/(?:^|;)\s*background(?:-color)?:\s*([^;]+)/)?.[1].trim();
// An icon is drawn in currentColor: a mark, not letters.
const isIcon = (selector: string) => /\.ds-icon\b|\bsvg\b/.test(selector.split(",").at(-1) ?? "");

describe("the stylesheets", () => {
  it("are read, rule by rule", () => {
    expect(rules().length).toBeGreaterThan(200);
  });

  it("never letter text in --text-subtle", () => {
    const subtle = rules().filter((rule) => colour(rule.body)?.includes("--text-subtle") && !isIcon(rule.selector));
    expect(subtle.map((rule) => `${rule.sheet}: ${rule.selector}`)).toEqual([]);
  });

  it("never set muted text on the high container, or on a hover or selected ground", () => {
    const short = rules().filter((rule) => colour(rule.body)?.includes("--text-muted") && /--surface-container-high|--hover|--selected/.test(ground(rule.body) ?? ""));
    expect(short.map((rule) => `${rule.sheet}: ${rule.selector}`)).toEqual([]);
  });
});
