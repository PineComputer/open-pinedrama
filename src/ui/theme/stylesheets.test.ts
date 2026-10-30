// The studio's own stylesheets keep to the text-on-ground pairs contrast.test.ts allows: no
// letters in --text-subtle, and no muted letters on the high container or a hover or selected
// ground. A rule is read on its own; what one rule inherits from another is axe's to catch on
// the pages the end-to-end tests visit.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Every stylesheet of the studio's own under src/ui, a new screen's included; Reveric's two are its palette and
// tokens, and studio.css is the approved prototype's, taken as it is (axe checks what it draws, in the end-to-end tests).
const UI = fileURLToPath(new URL("..", import.meta.url));
const SHEETS = (readdirSync(UI, { recursive: true }) as string[]).filter((name) => name.endsWith(".css") && !path.basename(name).startsWith("reveric-") && path.basename(name) !== "studio.css").map((name) => path.join(UI, name));

interface Rule {
  sheet: string;
  selector: string;
  body: string;
}

function rules(): Rule[] {
  return SHEETS.flatMap((sheet) => {
    const css = readFileSync(sheet, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sheet: path.relative(UI, sheet), selector: m[1].trim(), body: m[2] }));
  });
}

const colour = (body: string) => body.match(/(?:^|;)\s*color:\s*([^;]+)/)?.[1].trim();
const ground = (body: string) => body.match(/(?:^|;)\s*background(?:-color)?:\s*([^;]+)/)?.[1].trim();
// An icon is drawn in currentColor: a mark, not letters.
const isIcon = (selector: string) => /\.ds-icon\b|\bsvg\b/.test(selector.split(",").at(-1) ?? "");

describe("the stylesheets", () => {
  it("are read, rule by rule, every one of the studio's own", () => {
    expect(SHEETS.map((sheet) => path.relative(UI, sheet)).sort()).toEqual(expect.arrayContaining(["components/components.css", "screens/canvas.css", "shell/shell.css", "styles.css", "theme/base.css"]));
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
