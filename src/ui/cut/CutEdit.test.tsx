// The maker's edit of a cut (Codex's IA re-review D1–D4): a draft of drama-cli edit's plan apart from the notes,
// bound to its cut and to each take's file, sent once with Apply.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { FileItem } from "../../shared/types.ts";
import { cutReview, file } from "../test/fixtures.ts";
import { renderAt } from "../test/router.tsx";
import { accept, answer, calls } from "../test/server.ts";
import { Review } from "../screens/Review.tsx";

const take = (segment: string, version: string, sha = `${segment}-${version}`): FileItem =>
  file({ kind: "take", name: "video.mp4", path: `drama/episodes/EP002/segments/${segment}/${version}/video.mp4`, type: "video/mp4", episode: "EP002", segment, version, sha });

async function openEdit(takes: FileItem[]) {
  const review = { ...cutReview(), episodeId: "e2" };
  answer(`/api/reviews/${review.id}`, review);
  accept(`/api/reviews/${review.id}/decision`);
  answer("/api/dramas/d1/files", [...review.reviewItems[0].files, ...takes]);
  const user = userEvent.setup();
  await renderAt(<Review id={review.id} />, `/r/${review.id}`);
  await user.click(await screen.findByRole("radio", { name: "Edit" }));
  return { review, user };
}

describe("the cut's Edit tab", () => {
  it("counts only edits of the spec, and Apply sends them once, bound to the cut and each take's file", async () => {
    const { review, user } = await openEdit([take("seg01", "t01"), take("seg01", "t02"), take("seg02", "t01"), take("seg03", "t01")]);
    expect(await screen.findByText("No edits")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move seg02 earlier" }));
    await user.click(screen.getByRole("button", { name: "Silence" }));
    expect(screen.getByText("Draft · 2 edits")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Draft · 1 edits")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(calls("POST", `/api/reviews/${review.id}/decision`)).toHaveLength(1));
    const sent = calls("POST", `/api/reviews/${review.id}/decision`)[0].body as { edit: { base: number; clips: { segment: string; sha: string; audio: string }[] } };
    expect(sent.edit.base).toBe(review.reviewItems[0].files[0].id);
    expect(sent.edit.clips.map((clip) => [clip.segment, clip.sha, clip.audio])).toEqual([
      ["seg02", "seg02-t01", "source"],
      ["seg01", "seg01-t02", "source"],
      ["seg03", "seg03-t01", "source"],
    ]);
    expect(await screen.findByText("Sent to EP002's agent.")).toBeInTheDocument();
  });

  it("holds Apply while a take the draft uses is not the file the episode returned, with no Re-check for a take that's gone", async () => {
    const { user } = await openEdit([take("seg02", "t01"), take("seg03", "t01")]);
    await user.click(await screen.findByRole("button", { name: "Silence" }));
    expect(screen.getByText("Your draft's inputs changed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Re-check" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(screen.getByText("No edits")).toBeInTheDocument();
  });
});
