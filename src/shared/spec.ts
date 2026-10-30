// What a version's spec.json says about its job, for a row or a panel to show: drama-cli's own
// statement of it, read as written, never worked out. A take's spec carries the video request's
// `model`, `content` (its text prompt among the references), `duration`, `ratio` and `resolution`;
// a picture's carries `provider`, `model`, `prompt`, `aspect_ratio` and `size` (short_drama
// drama_cli/video.py and image specs; ModelArk's create-video-generation-task API names).
import type { FileItem } from "./types.ts";

export interface SpecFacts {
  model?: string;
  ratio?: string;
  seconds?: number;
  resolution?: string;
  prompt?: string;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);

/** The facts of a spec.json's text, or none when it isn't a JSON object. */
export function specFacts(json: string | undefined): SpecFacts | undefined {
  if (!json) return undefined;
  let spec: unknown;
  try {
    spec = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return undefined;
  const s = spec as Record<string, unknown>;
  const content = Array.isArray(s.content) ? (s.content as Record<string, unknown>[]) : [];
  return {
    model: text(s.model),
    ratio: text(s.ratio) ?? text(s.aspect_ratio),
    seconds: typeof s.duration === "number" ? s.duration : undefined,
    resolution: text(s.resolution) ?? text(s.size),
    prompt: text(s.prompt) ?? text(content.find((part) => part?.type === "text")?.text),
  };
}

/** The spec.json in the same version's folder as `file`, among `files`. */
export function specBeside(file: FileItem | undefined, files: FileItem[]): FileItem | undefined {
  if (!file) return undefined;
  const folder = file.path.slice(0, file.path.lastIndexOf("/"));
  return files.find((other) => other.kind === "spec" && other.path === `${folder}/spec.json`);
}
