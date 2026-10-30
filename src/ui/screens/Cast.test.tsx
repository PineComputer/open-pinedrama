// The Story: the episodes as the bible titles them, the cast as cards named as the bible names
// them with their other names and where each stands, the world as places and props; a card
// waiting for the maker links to its review, as decisions are made there.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CastCard } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { Cast } from "./Cast.tsx";

const file = (id: number, version: string) => ({ id, name: "image-1.png", path: `drama/assets/x/${version}/image-1.png`, type: "image/png", size: 1, kind: "look", url: `/f/${id}`, version, createdAt: "2026-10-30T10:00:00Z" });
const cast: CastCard[] = [
  {
    kind: "look",
    subject: "lin",
    episodes: ["EP001"],
    looks: [
      {
        look: "base",
        versions: [
          { turnId: "t2", files: [file(2, "v2")] as never, review: { reviewId: "r2", kind: "looks", state: "open", notes: [] } },
          { turnId: "t1", files: [file(1, "v1")] as never, review: { reviewId: "r1", kind: "looks", state: "answered", verdict: "revise", notes: [] } },
        ],
      },
    ],
  },
  { kind: "location", subject: "office", episodes: [], looks: [{ look: "", versions: [{ turnId: "t3", files: [file(3, "v1")] as never }] }] },
];
const names = { title: "T", characters: { lin: { name: "Lin Xiaoyu", aliases: ["Xiaoyu"] } }, locations: { office: "Factory office" }, props: {}, episodes: { EP001: "The stepmother arrives" } };

function engine() {
  answer("/api/dramas/d1/cast", cast);
  answer("/api/dramas/d1/project", { state: null, sessions: [], problems: [], names });
}

describe("the Story", () => {
  it("shows the cast named as the bible names them, with their other names and the episodes they are in", async () => {
    engine();
    render(<Cast dramaId="d1" />);
    const lin = await screen.findByRole("article", { name: "Lin Xiaoyu" });
    expect(within(lin).getByText("Xiaoyu")).toBeInTheDocument();
    expect(within(lin).getByRole("link", { name: "EP001" })).toHaveAttribute("href", "/d/d1/e/EP001");
  });

  it("links a card waiting for the maker to its review, and shows its earlier versions", async () => {
    const user = userEvent.setup();
    engine();
    render(<Cast dramaId="d1" />);
    const lin = await screen.findByRole("article", { name: "Lin Xiaoyu" });
    expect(within(lin).getByText("Waiting for you")).toBeInTheDocument();
    expect(within(lin).getByRole("link", { name: "Review" })).toHaveAttribute("href", "/r/r2");
    await user.click(within(lin).getByRole("button", { name: "v1" }));
    expect(within(lin).getByText("Sent back")).toBeInTheDocument();
  });

  it("keeps places and props in the world, and the episodes in the bible", async () => {
    const user = userEvent.setup();
    engine();
    render(<Cast dramaId="d1" />);
    await user.click(await screen.findByRole("tab", { name: /World/ }));
    expect(screen.getByRole("article", { name: "Factory office" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Bible/ }));
    expect(screen.getByRole("link", { name: /EP001\s*The stepmother arrives/ })).toHaveAttribute("href", "/d/d1/e/EP001");
  });
});
