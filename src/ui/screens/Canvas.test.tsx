// The canvas (P6.2), used as a maker uses it: the series as one board, every item named as the
// bible names it with where it stands and its current picture, grouped by episode and scene, and
// moved about with zoom and fit. It only reads: nothing on it makes or changes an item.
import "../test/flow.ts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import { parseStatus, type ProjectView } from "../../shared/project.ts";
import type { DramaView, FileItem } from "../../shared/types.ts";
import { changed } from "../test/live.ts";
import { answer, calls } from "../test/server.ts";
import { Canvas } from "./Canvas.tsx";

const fixture = (name: string) => JSON.parse(readFileSync(path.resolve("fixtures/status", `${name}.json`), "utf8"));
const lineageView = () => ({ lineage: parseLineage(JSON.parse(readFileSync(path.resolve("fixtures/lineage", "shot.json"), "utf8"))), problems: [] });
const drama = { id: "d1", title: "The Stepmother" } as unknown as DramaView;

function project(change?: (report: Record<string, any>) => void, names = true): ProjectView {
  const report = fixture("boards");
  change?.(report);
  const { budget: _budget, ...state } = parseStatus(report);
  return { state, sessions: [], problems: [], names: names ? parseBibleNames(fixture("bible")) : null };
}

const file = (id: number, filePath: string, createdAt = "2026-10-30T10:00:00Z") => ({ id, name: "image-1.png", path: filePath, type: "image/png", size: 1, kind: "look", url: `/f/${id}`, createdAt }) as unknown as FileItem;

function engine(view: ProjectView | null, files: FileItem[] = []) {
  answer("/api/dramas/d1/project", view ?? { state: null, sessions: [], problems: [], names: null });
  answer("/api/dramas/d1/files", files);
  answer("/api/dramas/d1/lineage", lineageView());
  answer("/api/dramas/d1/canvas/EP001", { positions: {} });
  answer("/api/dramas/d1/canvas/EP002", { positions: {} });
}

describe("the canvas", () => {
  it("names every item as the bible does, never by its id", async () => {
    engine(project());
    render(<Canvas drama={drama} />);
    const board = await screen.findByRole("region", { name: "Canvas" });
    expect(within(board).getByRole("button", { name: /^林/ })).toBeInTheDocument();
    expect(within(board).getByRole("button", { name: /^办公室/ })).toBeInTheDocument();
    expect(within(board).queryByRole("button", { name: /^lin\b/ })).toBeNull();
  });

  it("says where each item stands", async () => {
    engine(project((report) => {
      report.characters.lin = { ...report.characters.lin, current: "v2", candidate: "v2", usable: false, why: "not accepted" };
    }));
    render(<Canvas drama={drama} />);
    expect(await screen.findByRole("button", { name: /^林.*Waiting for you/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^办公室.*Accepted/ })).toBeInTheDocument();
  });

  it("shows each item's current picture, not an older one", async () => {
    engine(project(), [file(1, "/work/drama/assets/characters/lin/v0/image-1.png", "2026-10-30T09:00:00Z"), file(2, "/work/drama/assets/characters/lin/v1/image-1.png")]);
    render(<Canvas drama={drama} />);
    const lin = await screen.findByRole("button", { name: /^林/ });
    // The picture is the button's content, named by the button: decorative, so found by tag.
    await waitFor(() => expect(lin.closest(".ds-cnode")!.querySelector("img")).toHaveAttribute("src", "/f/2"));
  });

  it("takes the new pictures as a turn's files are saved", async () => {
    engine(project(), [file(1, "/work/drama/assets/characters/lin/v1/image-1.png")]);
    render(<Canvas drama={drama} />);
    await screen.findByRole("button", { name: /^林/ });
    await waitFor(() => expect(calls("GET", "/api/dramas/d1/files")).toHaveLength(1));
    changed("drama:d1");
    await waitFor(() => expect(calls("GET", "/api/dramas/d1/files")).toHaveLength(2));
  });

  it("shows one episode, its scenes as bands, with the references it uses", async () => {
    engine(project());
    render(<Canvas drama={drama} />);
    expect(await screen.findByRole("group", { name: "Scene 1 · INT. OFFICE - DAY #1-1#" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^seg01/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^EP001 · x/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^林/ })).toBeInTheDocument();
  });

  it("shows the episode chosen elsewhere, and moves between episodes with its switcher", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/d/d1/canvas?item=EP002");
    engine(project((report) => {
      report.episodes.EP002 = { ...report.episodes.EP001, scene_chains: [{ scene_heading: "EXT. YARD - NIGHT #2-1#", segments: ["seg01"] }] };
    }));
    render(<Canvas drama={drama} />);
    expect(await screen.findByRole("group", { name: "Scene 1 · EXT. YARD - NIGHT #2-1#" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Scene 1 · INT. OFFICE - DAY #1-1#" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next episode" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous episode" }));
    expect(location.search).toBe("?item=EP001");
    expect(await screen.findByRole("group", { name: "Scene 1 · INT. OFFICE - DAY #1-1#" })).toBeInTheDocument();
    window.history.pushState(null, "", "/");
  });

  it("offers React Flow's controls, named in the maker's words, and the minimap", async () => {
    engine(project());
    render(<Canvas drama={drama} />);
    for (const name of ["Zoom in", "Zoom out", "Fit the board", "Lay out again"]) expect(await screen.findByRole("button", { name })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Minimap: move the view" })).toBeInTheDocument();
  });

  it("points to what waits for the maker, beside the agent", async () => {
    engine(project());
    render(<Canvas drama={{ ...drama, waiting: 3 } as DramaView} />);
    expect(await screen.findByRole("link", { name: "3 waiting for you" })).toHaveAttribute("href", "/d/d1/inbox");
  });

  it("offers no way to make, change or draw an item", async () => {
    engine(project());
    render(<Canvas drama={drama} />);
    await screen.findByRole("region", { name: "Canvas" });
    const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent ?? "");
    expect(names.filter((name) => /generate|regenerate|redo|edit|draw|prompt|new item|add/i.test(name))).toEqual([]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says what will appear before the agent has reported", async () => {
    engine(null);
    render(<Canvas drama={drama} />);
    expect(await screen.findByRole("heading", { name: "The board fills in as the agent works" })).toBeInTheDocument();
  });
});
