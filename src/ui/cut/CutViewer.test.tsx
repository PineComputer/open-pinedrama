// The cut viewer, used as the maker uses it: media-chrome plays the cut, react-timeline-editor
// shows its segments. What is ours is tested here: the cut's plan as the timeline's rows, the
// transport's cut points and segment, what a cut without a plan says, and that the timeline's
// editing is off and sends nothing.
import { fireEvent, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CutPlan, FileItem } from "../../shared/types.ts";
import { CutViewer, EDITING, WATCH_ONLY, cutRows } from "./CutViewer.tsx";

const cut = (cutPlan?: CutPlan): FileItem => ({
  id: 7,
  name: "cut.mp4",
  path: "drama/episodes/EP001/edit/v2/cut.mp4",
  type: "video/mp4",
  size: 1,
  kind: "cut",
  episode: "EP001",
  version: "v2",
  url: "/api/files/7/cut.mp4",
  createdAt: "2026-10-30T00:00:00Z",
  cutPlan,
});

const PLAN = {
  fps: 24,
  clips: [
    { segment: "seg01", take: "t02", start: 0, end: 4 },
    { segment: "seg02", take: "t01", start: 4, end: 6 },
    { segment: "seg03", take: "t01", start: 6, end: 8 },
  ],
};

/** The viewer rendered, its queries kept to its own part of the page. */
function view(file: FileItem, onTime?: (seconds: number) => void) {
  const { container } = render(<CutViewer file={file} tag="EP001 · cut v2" onTime={onTime} />);
  return { page: within(container), video: container.querySelector("video")!, container };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("cutRows", () => {
  it("is the pins' row above the segments' row: a strip for each segment's take at its time in the cut, named by its place in the plan", () => {
    expect(cutRows(PLAN.clips)).toEqual([
      { id: "notes", rowHeight: 14, actions: [] },
      {
        id: "picture",
        rowHeight: 52,
        actions: [
          { id: "0", start: 0, end: 4, effectId: "clip", movable: false, flexible: false },
          { id: "1", start: 4, end: 6, effectId: "clip", movable: false, flexible: false },
          { id: "2", start: 6, end: 8, effectId: "clip", movable: false, flexible: false },
        ],
      },
    ]);
  });

  it("pins each of the maker's notes at its time: those on this cut, with a time", () => {
    const notes = [
      { fileId: 7, time: 6, text: "Too dark" },
      { fileId: 8, time: 3, text: "On the earlier cut" },
      { fileId: 7, text: "Overall: faster" },
      { time: 2, text: "Cut in sooner" },
    ];
    expect(cutRows(PLAN.clips, notes, 7)[0].actions).toEqual([
      { id: "note-0", start: 6, end: 6, effectId: "note", movable: false, flexible: false },
      { id: "note-3", start: 2, end: 2, effectId: "note", movable: false, flexible: false },
    ]);
  });
});

describe("phase 1", () => {
  it("doesn't edit the cut: the timeline's editing is off, and nothing it would ask is sent", () => {
    expect(EDITING).toBe(false);
    const sent = vi.spyOn(globalThis, "fetch");
    WATCH_ONLY.move(1, 3);
    WATCH_ONLY.trim(1, 4, 5);
    expect(sent).not.toHaveBeenCalled();
  });
});

describe("CutViewer", () => {
  it("plays the cut through media-chrome's controller", () => {
    const { video } = view(cut(PLAN));
    expect(video).toHaveAttribute("src", "/api/files/7/cut.mp4");
    expect(video).toHaveAttribute("slot", "media");
    expect(video.closest("media-controller")).not.toBeNull();
  });

  it("steps a frame with the arrow keys, at the cut's rate", () => {
    const controller = view(cut(PLAN)).container.querySelector("media-controller")!;
    expect(controller.getAttribute("keyboardforwardseekoffset")).toBe(String(1 / 24));
    expect(controller.getAttribute("keyboardbackwardseekoffset")).toBe(String(1 / 24));
  });

  it("shows the prototype's player: its tag, a big Play over the picture, and the time below", () => {
    const { page, video } = view(cut(PLAN));
    expect(page.getByText("EP001 · cut v2")).toBeInTheDocument();
    expect(video.closest(".player")).not.toBeNull();
    video.currentTime = 4.5;
    fireEvent.timeUpdate(video);
    expect(page.getByText("4.5s")).toBeInTheDocument();
    expect(page.getByText("/ 8.0s")).toBeInTheDocument();
  });

  it("tells the caller where the cut is", () => {
    const onTime = vi.fn();
    const { video } = view(cut(PLAN), onTime);
    video.currentTime = 2.5;
    fireEvent.timeUpdate(video);
    expect(onTime).toHaveBeenLastCalledWith(2.5);
  });

  it("says so when no segment list came with the cut", () => {
    const { page } = view(cut());
    expect(page.getByText("No segment list came with this cut.")).toBeInTheDocument();
  });

  it("says what is wrong when the cut's segment list doesn't read", () => {
    const { page } = view(cut({ error: "cut.json lists no clips" }));
    expect(page.getByText("The cut's segment list doesn't read: cut.json lists no clips")).toBeInTheDocument();
  });
});
