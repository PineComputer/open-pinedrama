// Replay's sample pictures and clips (fixtures/replay/samples/): JPEGs and short clips from our own
// test runs, stored with Git LFS, that replay returns in place of its drawn placeholders where
// samples.json names one for the path's first version. A redrawn version (v2 on) is drawn as a
// placeholder, so the maker sees what changed. Without LFS a checkout holds pointer files; those,
// and any path samples.json leaves out, give none, so replay draws its placeholder as before.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface Sample {
  path: string;
  type: string;
  bytes: Uint8Array;
}

type Lang = "en" | "zh";

/** A file Git LFS stands in for until it is fetched (git-lfs's pointer format, spec v1). */
const POINTER = "version https://git-lfs.github.com/spec/";

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".mp4": "video/mp4" };

/** The path as samples.json keys it: its version as vN, without the extension; none for a redrawn version. */
export function sampleKey(relPath: string): string | undefined {
  const version = relPath.match(/\/v(\d+)\//);
  if (version && version[1] !== "1") return undefined;
  return relPath.replace(/\/v1\//, "/vN/").replace(/\.[a-z0-9]+$/i, "");
}

/**
 * Samples from a folder: for a language and the path replay would return, the sample file and
 * the path to return it at (its own extension in place of the placeholder's), or undefined.
 */
export function samplesFrom(root: string): (lang: Lang, relPath: string) => Sample | undefined {
  let table: Record<string, Record<string, string>> | null | undefined;
  let warned = false;
  return (lang, relPath) => {
    if (table === undefined) {
      const file = path.join(root, "samples.json");
      table = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    }
    const key = sampleKey(relPath);
    const name = key && table?.[lang]?.[key];
    if (!name) return undefined;
    const bytes = readFileSync(path.join(root, name));
    if (new TextDecoder().decode(bytes.subarray(0, POINTER.length)) === POINTER) {
      if (!warned) console.warn(`Replay's sample pictures are Git LFS pointers (${root}); run \`git lfs install && git lfs pull\` to see them. Placeholders are drawn meanwhile.`);
      warned = true;
      return undefined;
    }
    const ext = path.extname(name).toLowerCase();
    if (!TYPES[ext]) throw new Error(`Replay's sample ${name} (samples.json) is a ${ext} file; samples are ${Object.keys(TYPES).join(" or ")}.`);
    return { path: relPath.replace(/\.[a-z0-9]+$/i, ext), type: TYPES[ext], bytes };
  };
}
