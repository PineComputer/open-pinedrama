// The Export menu (design/app.js, ExportMenu), used as a maker uses it: before any stop has returned the drama's
// exports, both downloads are offered disabled, saying why; once returned, each is the newest file of its kind,
// downloaded under the drama's name.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { DramaView, FileItem, FileKind } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { ExportMenu } from "./ExportMenu.tsx";

const drama = { id: "d1", title: "Bride on Bail" } as DramaView;
const file = (id: number, kind: FileKind, name: string): FileItem => ({ id, sha: `abc${id}`, name, path: `handoff/${name}`, type: "application/octet-stream", size: 1, kind, url: `/api/files/${id}?v=abc${id}`, createdAt: "2026-10-30T10:00:00Z" });

async function open() {
  render(<ExportMenu drama={drama} />);
  await userEvent.click(await screen.findByRole("button", { name: /^Export/ }));
  return screen.findByRole("menu", { name: "Export" });
}

describe("the Export menu", () => {
  it("offers both downloads disabled, saying why, until a stop has returned them", async () => {
    answer("/api/dramas/d1/files", []);
    const menu = await open();
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveTextContent("Ready after the agent's next stop returns it.");
      expect(item).not.toHaveAttribute("href");
    }
  });

  it("downloads the newest file of each kind under the drama's name, with how to open it", async () => {
    answer("/api/dramas/d1/files", [file(3, "lineage", "lineage.json"), file(5, "lineage", "lineage.json"), file(6, "infinite-canvas", "infinite-canvas.zip"), file(7, "status", "status.json")]);
    const menu = await open();
    const comfy = within(menu).getByRole("menuitem", { name: /^ComfyUI workflow/ });
    expect(comfy).toHaveAttribute("href", "/api/files/5?v=abc5&download=bride-on-bail-lineage.json");
    expect(comfy).toHaveAttribute("download", "bride-on-bail-lineage.json");
    const canvas = within(menu).getByRole("menuitem", { name: /^infinite-canvas/ });
    expect(canvas).toHaveAttribute("href", "/api/files/6?v=abc6&download=bride-on-bail-infinite-canvas.zip");
    expect(canvas).toHaveAttribute("download", "bride-on-bail-infinite-canvas.zip");
    expect(canvas).toHaveTextContent("Open infinite-canvas → Import → choose this file.");
  });
});
