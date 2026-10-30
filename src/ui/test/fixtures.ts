// Engine answers for component tests, in the shared types so a change on either side shows.
import type { FileItem, ReviewItem, ReviewView } from "../../shared/types.ts";

let nextFile = 1;

export function file(fields: Partial<FileItem> & Pick<FileItem, "kind" | "name">): FileItem {
  const id = nextFile++;
  return { id, path: `drama/${fields.name}`, type: "image/png", size: 1, url: `/api/files/${id}`, createdAt: "2026-10-29T10:00:00Z", ...fields };
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
    createdAt: "2026-10-29T10:00:00Z",
    reviewItems: segments.map(storyboard),
    otherFiles: [],
  };
}
