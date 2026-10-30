// Following the agent on the canvas, and its minimap (P6.4), used as a maker uses them: the
// board keeps the agent's newest work in view; once the maker moves the board themselves,
// following pauses until they resume it; the minimap shows the whole board and moves the view.
import "../test/flow.ts";
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
  answer("/api/dramas/d1/canvas/EP001", { positions: {} });
  answer("/api/dramas/d1/canvas/EP002", { positions: {} });
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

  it("pauses when the maker picks an item, and resumes when asked", async () => {
    const user = userEvent.setup();
    engine([look, board]);
    render(<Canvas drama={drama} />);
    (await screen.findByRole("button", { name: /^办公室/ })).focus();
    await user.keyboard("{Enter}");
    const resume = screen.getByRole("button", { name: "Following paused · Resume" });
    expect(resume).toHaveAttribute("aria-pressed", "false");
    expect(followed()).toBeNull();
    resume.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Following the agent" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(followed()?.textContent).toMatch(/^seg01/));
  });
});
