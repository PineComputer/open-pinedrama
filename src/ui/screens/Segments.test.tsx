// An episode's segments, scene by scene: each scene with how many of its segments are accepted,
// each segment with where it stands and its shot list, and its way onto Canvas.
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
    render(<Segments dramaId="d1" page={page} />);
    const scene = await screen.findByRole("region", { name: "Scene 1 · INT. OFFICE - DAY" });
    expect(within(scene).getByText("0 of 1 accepted")).toBeInTheDocument();
    expect(within(scene).getByText("seg01")).toBeInTheDocument();
  });

  it("say where each segment stands: its storyboard until it has a take", async () => {
    project((report) => {
      report.episodes.EP001.multi_panel_storyboard.seg01["line-art"] = { ...report.episodes.EP001.multi_panel_storyboard.seg01["line-art"], current: "v2", candidate: "v2", accepted: "v1", usable: false };
    });
    render(<Segments dramaId="d1" page={page} />);
    expect(await screen.findByText("Storyboard · Waiting for you")).toBeInTheDocument();
  });

  it("link a segment to Canvas, and say when the breakdown lists no shots for it", async () => {
    project();
    render(<Segments dramaId="d1" page={page} />);
    expect(await screen.findByRole("link", { name: "On Canvas" })).toHaveAttribute("href", "/d/d1/canvas?item=EP001");
    expect(screen.getByText("The breakdown lists no shots for it yet.")).toBeInTheDocument();
  });
});
