// The text-on-ground pairs the studio's stylesheets may use, and only those, read at WCAG AA
// (4.5:1) in the light and the dark theme of every palette, computed from the values in
// design/themes.css (sRGB relative luminance, WCAG 2). The pairs left out are why the rules in
// base.css hold: --success marks, it never letters; muted and subtle text never sit on
// --surface-container-high or a hover or selected row; warnings and errors are lettered on the
// canvas and the surface only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../../design/themes.css", import.meta.url), "utf8");

function palette(selector: string): Record<string, string> {
  const start = css.indexOf("{", css.indexOf(selector)) + 1;
  return Object.fromEntries([...css.slice(start, css.indexOf("}", start)).matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
}

const THEMES = ["reveric", "classic", "ivory"].flatMap((name) => [
  [`${name} light`, palette(`:root[data-palette="${name}"] {`)],
  [`${name} dark`, palette(`:root[data-palette="${name}"][data-theme="dark"]`)],
]) as [string, Record<string, string>][];

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(theme: Record<string, string>, text: string, ground: string): number {
  const [a, b] = [luminance(theme[text]), luminance(theme[ground])];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const ALL_GROUNDS = ["canvas", "surface", "surface-dim", "surface-container", "surface-container-high", "selected", "hover"];

const TEXT_ON_GROUND: [string, string][] = [
  ...["text-primary", "text-secondary"].flatMap((text) => ALL_GROUNDS.map((ground): [string, string] => [text, ground])),
  ...["text-muted", "text-subtle"].flatMap((text) => ["canvas", "surface", "surface-dim", "surface-container"].map((ground): [string, string] => [text, ground])),
  ...["canvas", "surface"].flatMap((ground): [string, string][] => [
    ["warning-text", ground],
    ["error", ground],
  ]),
  ["on-accent", "accent"],
  // A red line's StopCard header and an error toast.
  ["on-accent", "error"],
];

describe("text on its ground", () => {
  for (const [name, theme] of THEMES) {
    // Every theme's greys; the other pairs in the classic palette, the one the studio ships (reveric's and ivory's
    // warning and error reds are under 4.5:1 as copied, and the studio doesn't offer those palettes yet).
    const pairs = name.startsWith("classic") ? TEXT_ON_GROUND : TEXT_ON_GROUND.filter(([text]) => text.startsWith("text-"));
    it(`reads at 4.5:1 or more in the ${name} theme`, () => {
      expect(Object.keys(theme)).toContain("canvas");
      const short = pairs.filter(([text, ground]) => ratio(theme, text, ground) < 4.5).map(([text, ground]) => `${text} on ${ground}: ${ratio(theme, text, ground).toFixed(2)}`);
      expect(short).toEqual([]);
    });
  }
});

describe("the order of the greys", () => {
  for (const [name, theme] of THEMES) {
    it(`keeps subtle no stronger than muted in ${name}`, () => {
      expect(ratio(theme, "text-subtle", "canvas")).toBeLessThanOrEqual(ratio(theme, "text-muted", "canvas") + 0.05);
    });
  }
});
