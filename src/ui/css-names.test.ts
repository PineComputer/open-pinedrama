// No class the studio's own stylesheets style may share its name with a Tailwind utility. index.css puts our stylesheets
// in Tailwind's components layer and Tailwind's utilities come in the later utilities layer
// (tailwindcss.com/docs/adding-custom-styles), and a later layer wins whatever the specificity (CSS Cascade 5, cascade
// layers). So once a name like "block" appears in the sources, Tailwind generates .block { display: block } and it
// silently overrides ours: Welcome's gaps collapsed that way (Codex RC2, C2). Tailwind itself says which names it owns.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

/** Every class name a selector in the studio's own CSS names (design/ and src/ui/; libraries' stylesheets are theirs). */
function ourClasses(): Set<string> {
  const files = execFileSync("git", ["ls-files", "design/*.css", "src/ui/*.css", "src/ui/**/*.css"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const names = new Set<string>();
  for (const file of files) {
    // Comments and strings hold words, not selectors; a number like .5em starts with a digit and is never matched.
    const css = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/"[^"\n]*"|'[^'\n]*'/g, "")
      .replace(/url\([^)]*\)/g, "");
    for (const [, name] of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(name!);
  }
  return names;
}

describe("the studio's CSS class names", () => {
  it("are none of Tailwind's utilities, which would override them from a later layer", async () => {
    const require = createRequire(import.meta.url);
    const tailwind = await compile(`${readFileSync(require.resolve("tailwindcss/theme.css"), "utf8")}\n@tailwind utilities;`);
    const ours = ourClasses();
    expect(ours.size).toBeGreaterThan(100);
    // The utilities Tailwind generates for exactly these names, if they appeared in a className.
    const generated = new Set([...tailwind.build([...ours]).matchAll(/\.([\w-]+)\s*\{/g)].map(([, name]) => name!));
    expect([...ours].filter((name) => generated.has(name)).sort()).toEqual([]);
  });

  it("would catch a name Tailwind owns", async () => {
    const require = createRequire(import.meta.url);
    const tailwind = await compile(`${readFileSync(require.resolve("tailwindcss/theme.css"), "utf8")}\n@tailwind utilities;`);
    expect([...tailwind.build(["block", "fill", "stack"]).matchAll(/\.([\w-]+)\s*\{/g)].map(([, name]) => name)).toEqual(["block"]);
  });
});
