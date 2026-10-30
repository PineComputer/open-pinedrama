// Every text-on-ground pair the tokens allow reads at WCAG AA (4.5:1) in the light and the dark
// theme, computed from the values in tokens.css (OKLCH to sRGB, then relative luminance).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function block(selector: string): string {
  const start = css.indexOf("{", css.indexOf(selector)) + 1;
  let depth = 1;
  let end = start;
  while (depth) {
    if (css[end] === "{") depth++;
    if (css[end] === "}") depth--;
    end++;
  }
  return css.slice(start, end - 1);
}

function colours(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(oklch\([^)]*\))/g)].map((m) => [m[1], m[2]]));
}

const light = colours(block(":root {"));
const dark = { ...light, ...colours(block(':root[data-theme="dark"]')) };
const system = { ...light, ...colours(block(':root:not([data-theme="light"])')) };

/** Relative luminance of an oklch() colour (CSS Color 4's OKLab matrices; WCAG 2's luminance). */
function luminance(value: string): number {
  const [l, c, h] = value.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)/)!.slice(1).map(Number);
  const L = l / 100;
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lms = [L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.291485548 * b].map((x) => x ** 3);
  const [lo, mo, so] = lms;
  const rgb = [4.0767416621 * lo - 3.3077115913 * mo + 0.2309699292 * so, -1.2684380046 * lo + 2.6097574011 * mo - 0.3413193965 * so, -0.0041960863 * lo - 0.7034186147 * mo + 1.707614701 * so];
  const [r, g, bl] = rgb.map((x) => Math.min(1, Math.max(0, x)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function ratio(theme: Record<string, string>, text: string, ground: string): number {
  const [a, b] = [luminance(theme[text]), luminance(theme[ground])];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const TEXT_ON_GROUND: [string, string][] = [
  ...["ink", "ink-2", "ink-3"].flatMap((text) => ["paper", "paper-2", "paper-3", "sheet"].map((ground): [string, string] => [text, ground])),
  ["seal", "paper"],
  ["seal", "sheet"],
  ["seal-deep", "seal-wash"],
  ["on-seal", "seal"],
  ["done", "done-wash"],
  ["work", "work-wash"],
  ["warn", "warn-wash"],
  ["stale", "stale-wash"],
  ["paper", "ink"],
  ["on-room", "room"],
  ["on-room", "room-2"],
  ["on-room-2", "room"],
  ["on-room-2", "room-2"],
];

describe("text on its ground", () => {
  for (const [name, theme] of [["light", light], ["dark", dark], ["dark by the system's choice", system]] as const) {
    it(`reads at 4.5:1 or more in the ${name} theme`, () => {
      const short = TEXT_ON_GROUND.filter(([text, ground]) => ratio(theme, text, ground) < 4.5).map(([text, ground]) => `${text} on ${ground}: ${ratio(theme, text, ground).toFixed(2)}`);
      expect(short).toEqual([]);
    });
  }

  it("is the same in dark whether the maker or the system chose it", () => {
    expect(system).toEqual(dark);
  });
});

describe("the colours kept from text", () => {
  it("are below 4.5:1 on paper, which is why they are for marks only", () => {
    expect(ratio(light, "ink-4", "paper")).toBeLessThan(4.5);
    expect(ratio(light, "on-room-3", "room")).toBeLessThan(4.5);
  });
});
