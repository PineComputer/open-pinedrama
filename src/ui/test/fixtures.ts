// Engine answers for component tests, in the shared types so a change on either side shows.
import type { FileItem, ReviewItem, ReviewView } from "../../shared/types.ts";

let nextFile = 1;

export function file(fields: Partial<FileItem> & Pick<FileItem, "kind" | "name">): FileItem {
  const id = nextFile++;
  return { id, sha: `sha${id}`, path: `drama/${fields.name}`, type: "image/png", size: 1, url: `/api/files/${id}`, createdAt: "2026-10-29T10:00:00Z", ...fields };
}

export function storyboard(segment: string): ReviewItem {
  return {
    key: segment,
    label: segment,
    files: [file({ kind: "storyboard", name: `episodes/EP002/storyboard/${segment}/v1/line-art.png`, episode: "EP002", segment, style: "line-art", version: "v1" })],
  };
}

/** An open review of EP002's storyboards, one item per segment named. */
export function storyboardReview(...segments: string[]): ReviewView {
  return {
    id: "r1",
    dramaId: "d1",
    dramaTitle: "The Ferry Heiress",
    episode: "EP002",
    episodeId: "e2",
    kind: "storyboards",
    state: "open",
    question: "EP002's storyboards are ready for your review.",
    items: segments.length,
    subjects: segments,
    createdAt: "2026-10-29T10:00:00Z",
    reviewItems: segments.map(storyboard),
    otherFiles: [],
    refusals: [],
  };
}

/** An open review of EP002's cut, v2, whose cut.json lists three segments over 8 seconds. */
export function cutReview(): ReviewView {
  const cut = file({
    kind: "cut",
    name: "cut.mp4",
    path: "drama/episodes/EP002/edit/v2/cut.mp4",
    type: "video/mp4",
    episode: "EP002",
    version: "v2",
    cutPlan: {
      fps: 24,
      clips: [
        { segment: "seg01", take: "t02", start: 0, end: 4, in: 0, out: 4, audio: "source" as const },
        { segment: "seg02", take: "t01", start: 4, end: 6, in: 0, out: 2, audio: "source" as const },
        { segment: "seg03", take: "t01", start: 6, end: 8, in: 0, out: 2, audio: "source" as const },
      ],
    },
  });
  return { ...storyboardReview(), id: "r9", kind: "cut", question: "The cut of EP002 is ready. Please watch it.", items: 1, reviewItems: [{ key: "cut", label: "Cut", files: [cut] }] };
}
