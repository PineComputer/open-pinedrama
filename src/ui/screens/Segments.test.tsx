// An episode's segments, scene by scene: each scene with how many of its segments are accepted,
// each segment with where its storyboard and take stand and its shot list, and the episode's
// standing at the foot. It reads: a segment opens on its pictures, and on Canvas.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseStatus } from "../../shared/project.ts";
import type { EpisodePage } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { Segments } from "./Segments.tsx";

function project(change?: (report: Record<string, any>) => void) {
  const report = JSON.parse(readFileSync(path.resolve("fixtures/status/boards.json"), "utf8"));
  change?.(report);
  const { budget: _budget, ...state } = parseStatus(report);
  answer("/api/dramas/d1/project", { state, sessions: [], problems: [], names: null });
}

const page = {
  dramaId: "d1",
  row: { code: "EP001", spent: { total: 0, media: 0, partial: false } },
  segments: [{ key: "seg01", boards: [], stills: [], takes: [] }],
  cuts: [],
  other: [],
} as unknown as EpisodePage;

describe("an episode's segments", () => {
  it("are grouped by scene, each scene saying how many of its segments are accepted", async () => {
    project();
    render(<Segments dramaId="d1" page={page} onOpen={() => {}} />);
    const scene = await screen.findByRole("region", { name: "INT. OFFICE - DAY #1-1#" });
    expect(within(scene).getByText(/segments accepted/)).toBeInTheDocument();
    expect(within(scene).getByRole("button", { name: "seg01" })).toBeInTheDocument();
  });

  it("say where each segment's storyboard and take stand", async () => {
    project((report) => {
      report.episodes.EP001.multi_panel_storyboard.seg01["line-art"] = { ...report.episodes.EP001.multi_panel_storyboard.seg01["line-art"], current: "v2", candidate: "v2", accepted: "v1", usable: false };
    });
    render(<Segments dramaId="d1" page={page} onOpen={() => {}} />);
    expect(await screen.findByText("Storyboard · Waiting for you")).toBeInTheDocument();
  });

  it("open a segment on its pictures, and link it to Canvas", async () => {
    const user = userEvent.setup();
    project();
    const onOpen = vi.fn();
    render(<Segments dramaId="d1" page={page} onOpen={onOpen} />);
    await user.click(await screen.findByRole("button", { name: "seg01" }));
    expect(onOpen).toHaveBeenCalledWith("seg01");
    expect(screen.getByRole("link", { name: "On Canvas" })).toHaveAttribute("href", "/d/d1/canvas?item=EP001");
  });

  it("say where the episode stands at the foot", async () => {
    project();
    render(<Segments dramaId="d1" page={page} onOpen={() => {}} />);
    const status = await screen.findByRole("status", { name: "Where the episode stands" });
    expect(status).toHaveTextContent("1 segments / 1 scenes");
  });

  it("fold a segment's shots", async () => {
    const user = userEvent.setup();
    project();
    render(<Segments dramaId="d1" page={page} onOpen={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Fold segment 1-1" }));
    expect(screen.queryByText("The breakdown lists no shots for it yet.")).toBeNull();
  });
});
