// Following the agent on the canvas, and its minimap (P6.4), used as a maker uses them: the
// board keeps the agent's newest work in view; once the maker moves the board themselves,
// following pauses until they resume it; the minimap shows the whole board and moves the view.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseLineage } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import { parseStatus, type ProjectView } from "../../shared/project.ts";
import type { DramaView, FileItem } from "../../shared/types.ts";
import { changed } from "../test/live.ts";
import { answer } from "../test/server.ts";
import { Canvas } from "./Canvas.tsx";

const fixture = (name: string) => JSON.parse(readFileSync(path.resolve("fixtures/status", `${name}.json`), "utf8"));
const lineageView = () => ({ lineage: parseLineage(JSON.parse(readFileSync(path.resolve("fixtures/lineage", "shot.json"), "utf8"))), problems: [] });
const drama = { id: "d1", title: "The Stepmother", status: "production", crew: [], episodeRows: [] } as unknown as DramaView;

function project(): ProjectView {
  const { budget: _budget, ...state } = parseStatus(fixture("boards"));
  return { state, sessions: [], problems: [], names: parseBibleNames(fixture("bible")) };
}

const file = (id: number, filePath: string, createdAt: string) => ({ id, name: "image-1.png", path: filePath, type: "image/png", size: 1, kind: "look", url: `/f/${id}`, createdAt }) as unknown as FileItem;
const look = file(1, "/work/drama/assets/characters/lin/v1/image-1.png", "2026-10-30T10:00:00Z");
const board = file(2, "/work/drama/episodes/EP001/multi_panel_storyboard/seg01/line-art/v1/image-1.png", "2026-10-30T10:05:00Z");

function engine(files: FileItem[]) {
  answer("/api/dramas/d1/project", project());
  answer("/api/dramas/d1/files", files);
  answer("/api/dramas/d1/lineage", lineageView());
  answer("/api/inbox", []);
}

const followed = () => document.querySelector(".ds-cnode[data-followed]");
const transform = () => (document.querySelector(".ds-board .layer") as HTMLElement).style.transform;

// jsdom lays nothing out: the board gets a size, so the camera has a view to fit.
const sized = Object.getOwnPropertyDescriptors(Element.prototype);
beforeEach(() => {
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get() { return this.classList?.contains("ds-board") ? 1000 : 0; } });
  Object.defineProperty(Element.prototype, "clientHeight", { configurable: true, get() { return this.classList?.contains("ds-board") ? 600 : 0; } });
});
afterEach(() => {
  Object.defineProperty(Element.prototype, "clientWidth", sized.clientWidth);
  Object.defineProperty(Element.prototype, "clientHeight", sized.clientHeight);
});

describe("following the agent", () => {
  it("keeps the agent's newest work in view", async () => {
    engine([look, board]);
    render(<Canvas drama={drama} />);
    expect(await screen.findByRole("button", { name: "Following the agent" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(followed()?.textContent).toMatch(/^seg01/));
  });

  it("moves on to the work the agent saves next", async () => {
    engine([look]);
    render(<Canvas drama={drama} />);
    await waitFor(() => expect(followed()?.textContent).toMatch(/^林/));
    engine([look, board]);
    changed("drama:d1");
    await waitFor(() => expect(followed()?.textContent).toMatch(/^seg01/));
  });

  it("pauses when the maker moves the board, and resumes when asked", async () => {
    const user = userEvent.setup();
    engine([look]);
    render(<Canvas drama={drama} />);
    const area = await screen.findByRole("application", { name: "The board" });
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(area, { clientX: 60, clientY: 40 });
    fireEvent.pointerUp(area);
    const resume = await screen.findByRole("button", { name: "Following paused · Resume" });
    expect(resume).toHaveAttribute("aria-pressed", "false");
    // Paused: new work doesn't move the board.
    const still = transform();
    engine([look, board]);
    changed("drama:d1");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(followed()).toBeNull();
    expect(transform()).toBe(still);
    await user.click(resume);
    expect(screen.getByRole("button", { name: "Following the agent" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(followed()?.textContent).toMatch(/^seg01/));
  });

  it("pauses when the maker zooms or picks an item", async () => {
    const user = userEvent.setup();
    engine([look]);
    render(<Canvas drama={drama} />);
    await user.click(await screen.findByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Following paused · Resume" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Following paused · Resume" }));
    await user.click(screen.getByRole("button", { name: /^办公室/ }));
    expect(screen.getByRole("button", { name: "Following paused · Resume" })).toBeInTheDocument();
  });
});

describe("zoomed far out", () => {
  it("draws cards as bars, without their pictures", async () => {
    const user = userEvent.setup();
    engine([look]);
    render(<Canvas drama={drama} />);
    const lin = await screen.findByRole("button", { name: /^林/ });
    await waitFor(() => expect(lin.querySelector("img")).not.toBeNull());
    while (Number.parseInt(screen.getByRole("status", { name: "Zoom" }).textContent!) >= 55) await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(lin.querySelector("img")).toBeNull();
  });
});

describe("the minimap", () => {
  it("shows the whole board with the view on it, and hides on request", async () => {
    const user = userEvent.setup();
    engine([look]);
    render(<Canvas drama={drama} />);
    const map = await screen.findByRole("button", { name: "Minimap: move the view" });
    expect(map.querySelectorAll(".item").length).toBe(3);
    expect(map.querySelector(".view")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Hide the minimap" }));
    expect(screen.queryByRole("button", { name: "Minimap: move the view" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show the minimap" }));
    expect(screen.getByRole("button", { name: "Minimap: move the view" })).toBeInTheDocument();
  });

  it("moves the view where the maker clicks it, and pauses following", async () => {
    engine([look]);
    render(<Canvas drama={drama} />);
    const map = await screen.findByRole("button", { name: "Minimap: move the view" });
    const layer = document.querySelector(".ds-board .layer") as HTMLElement;
    const before = layer.style.transform;
    fireEvent.click(map, { clientX: 80, clientY: 40 });
    expect(layer.style.transform).not.toBe(before);
    expect(screen.getByRole("button", { name: "Following paused · Resume" })).toBeInTheDocument();
  });
});
