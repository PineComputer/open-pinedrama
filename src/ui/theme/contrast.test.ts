// The text-on-ground pairs the studio's stylesheets may use, and only those, read at WCAG AA
// (4.5:1) in the light and the dark theme of the classic palette, computed from the values in
// reveric-themes.css (sRGB relative luminance, WCAG 2). The pairs left out are why the rules in
// base.css hold: --text-subtle and --success mark, they never letter; muted text never sits on
// --surface-container-high or a hover or selected row; warnings and errors are lettered on the
// canvas and the surface only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./reveric-themes.css", import.meta.url), "utf8");

function palette(selector: string): Record<string, string> {
  const start = css.indexOf("{", css.indexOf(selector)) + 1;
  return Object.fromEntries([...css.slice(start, css.indexOf("}", start)).matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
}

const light = palette(':root[data-palette="classic"] {');
const dark = palette(':root[data-palette="classic"][data-theme="dark"]');

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
  ...["canvas", "surface", "surface-dim", "surface-container"].map((ground): [string, string] => ["text-muted", ground]),
  ...["canvas", "surface"].flatMap((ground): [string, string][] => [
    ["warning-text", ground],
    ["error", ground],
  ]),
  ["on-accent", "accent"],
  // A red line's StopCard header and an error toast.
  ["on-accent", "error"],
];

describe("text on its ground", () => {
  for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
    it(`reads at 4.5:1 or more in the ${name} theme`, () => {
      expect(Object.keys(theme)).toContain("canvas");
      const short = TEXT_ON_GROUND.filter(([text, ground]) => ratio(theme, text, ground) < 4.5).map(([text, ground]) => `${text} on ${ground}: ${ratio(theme, text, ground).toFixed(2)}`);
      expect(short).toEqual([]);
    });
  }
});

describe("the colours kept from text", () => {
  it("are below 4.5:1 on the canvas, which is why they only mark", () => {
    expect(ratio(light, "text-subtle", "canvas")).toBeLessThan(4.5);
    expect(ratio(dark, "text-subtle", "canvas")).toBeLessThan(4.5);
    expect(ratio(light, "success", "canvas")).toBeLessThan(4.5);
  });
});
