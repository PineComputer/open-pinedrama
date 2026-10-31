// An episode's segments, scene by scene: each scene with how many of its segments are accepted,
// each segment with where it stands and its shot list, and its way onto Canvas.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseStatus } from "../../shared/project.ts";
import type { EpisodePage } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { Segments } from "./Segments.tsx";
import { href, renderAt } from "../test/router.tsx";

function project(change?: (report: Record<string, any>) => void) {
  const report = JSON.parse(readFileSync(path.resolve("fixtures/status/boards.json"), "utf8"));
  change?.(report);
  const { budget: _budget, ...state } = parseStatus(report);
  answer("/api/dramas/d1/project", { state, sessions: [], problems: [], names: null });
}

/** seg01 shot: its take t01, accepted, beside its storyboard. */
const withTake = (report: Record<string, any>) => {
  const { why: _why, ...seg01 } = report.episodes.EP001.segments.seg01;
  report.episodes.EP001.segments.seg01 = { ...seg01, current: "t01", accepted: "t01", usable: true };
};

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
    await renderAt(<Segments dramaId="d1" page={page} />);
    const scene = await screen.findByRole("region", { name: "Scene 1 · INT. OFFICE - DAY" });
    expect(within(scene).getByText("0 of 1 accepted")).toBeInTheDocument();
    expect(within(scene).getByText("seg01")).toBeInTheDocument();
  });

  it("say where each segment stands: its storyboard until it has a take", async () => {
    project((report) => {
      report.episodes.EP001.multi_panel_storyboard.seg01["line-art"] = { ...report.episodes.EP001.multi_panel_storyboard.seg01["line-art"], current: "v2", candidate: "v2", accepted: "v1", usable: false };
    });
    await renderAt(<Segments dramaId="d1" page={page} />);
    expect(await screen.findByText("Storyboard · Waiting for you")).toBeInTheDocument();
  });

  it("link a segment to Canvas at its newest stage, and say when the breakdown lists no shots for it", async () => {
    project(withTake);
    await renderAt(<Segments dramaId="d1" page={page} />);
    await screen.findByRole("button", { name: "seg01 Take t01" });
    expect(screen.getByRole("link", { name: "On Canvas" })).toHaveAttribute("href", "/d/d1/e/EP001/canvas?item=episodes%2FEP001%2Fsegments%2Fseg01");
    expect(screen.getByText("The breakdown lists no shots for it yet.")).toBeInTheDocument();
  });

  it("land on the stage a link names, never the segment's newest, and keep it on Canvas (Codex's IA round 3, fix 3)", async () => {
    const user = userEvent.setup();
    project(withTake);
    const board = "episodes/EP001/multi_panel_storyboard/seg01/line-art";
    const { router } = await renderAt(<Segments dramaId="d1" page={page} />, `/d/d1/e/EP001/list?item=${encodeURIComponent(board)}`);
    await screen.findByRole("button", { name: "seg01 Take t01" });
    const tiles = screen.getAllByRole("button", { name: /^seg01 / });
    expect(tiles.map((tile) => [tile.getAttribute("aria-label")?.split(" ")[1], tile.getAttribute("aria-pressed")])).toEqual([
      ["Storyboard", "true"],
      ["Take", "false"],
    ]);
    expect(screen.getByText("seg01").closest(".segrow")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "On Canvas" })).toHaveAttribute("href", `/d/d1/e/EP001/canvas?item=${encodeURIComponent(board)}`);
    expect(screen.getByRole("link", { name: "Lineage" })).toHaveAttribute("href", `/d/d1/e/EP001/list?item=${encodeURIComponent(board)}&view=lineage`);
    // A tile picks its own stage.
    await user.click(tiles[1]);
    await waitFor(() => expect(href(router)).toBe("/d/d1/e/EP001/list?item=episodes%2FEP001%2Fsegments%2Fseg01"));
  });

  it("pick no row when nothing is named", async () => {
    project();
    await renderAt(<Segments dramaId="d1" page={page} />, "/d/d1/e/EP001/list");
    await screen.findAllByRole("button", { name: /^seg01 / });
    expect(screen.getByText("seg01").closest(".segrow")).toHaveAttribute("aria-current", "false");
  });
});
