// Assets: the cast as cards named as the bible names them with their other names and where each stands,
// the world as places and props; a card opens its asset's detail, which links to its review, as decisions are
// made there. The bible's own page is Bible.test.tsx's.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CastCard } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { Cast } from "./Cast.tsx";
import { href, renderAt } from "../test/router.tsx";

// The asset grid lays out its rows by its own width (react-photo-album reads clientWidth); jsdom has no layout, so the
// grid is given a page's width here.
beforeAll(() => Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 960 }));
afterAll(() => Reflect.deleteProperty(HTMLElement.prototype, "clientWidth"));

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
  {
    kind: "location",
    subject: "office",
    episodes: [],
    looks: [
      { look: "", versions: [{ turnId: "t3", files: [file(3, "v1"), { ...file(4, "v1"), style: "left-side" }] as never }] },
      { look: "Night", versions: [{ turnId: "t5", files: [file(5, "v2")] as never }] },
    ],
  },
  { kind: "prop", subject: "letter", episodes: [], looks: [{ look: "", versions: [{ turnId: "t6", files: [file(6, "v1")] as never }] }] },
];
const names = { title: "T", characters: { lin: { name: "Lin Xiaoyu", aliases: ["Xiaoyu"] } }, locations: { office: "Factory office" }, props: { letter: "The letter" }, episodes: { EP001: "The stepmother arrives" }, logline: "A stepmother wins the house.", beats: [], summaries: { EP001: "She meets the family." }, endHooks: {}, seconds: {}, lines: {}, descriptions: { locations: { office: "Desks under strip lights." }, props: { letter: "A folded letter." } } };

function engine() {
  answer("/api/dramas/d1/cast", cast);
  answer("/api/dramas/d1/project", { state: null, sessions: [], problems: [], names });
}

describe("Assets", () => {
  it("shows a card as the picture, the name, the version and where it stands, and the rest in the detail (D56)", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/characters");
    expect(await screen.findByRole("heading", { name: /Characters\s*· 1/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    const lin = await screen.findByRole("article", { name: "Lin Xiaoyu" });
    expect(lin.querySelector(".ctxt")).toHaveTextContent(/^Lin Xiaoyuv2$/);
    // The whole name, never cut: it wraps in the card, and the link carries it as its title too (Codex round 4, F7).
    expect(within(lin).getByRole("link", { name: "Lin Xiaoyu" })).toHaveAttribute("title", "Lin Xiaoyu");
    expect(within(lin).queryByRole("link", { name: "EP001" })).not.toBeInTheDocument();
    await user.click(within(lin).getByRole("link", { name: "Lin Xiaoyu" }));
    const detail = await screen.findByRole("complementary", { name: "Lin Xiaoyu: versions, state and review" });
    expect(detail).toHaveTextContent("Also called Xiaoyu");
    expect(within(detail).getByRole("link", { name: "EP001" })).toHaveAttribute("href", "/d/d1/e/EP001/canvas");
  });

  it("opens a card's asset at its home: the detail links to its review and shows its earlier versions (J1)", async () => {
    const user = userEvent.setup();
    engine();
    const { router } = await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/characters");
    const lin = await screen.findByRole("article", { name: "Lin Xiaoyu" });
    expect(within(lin).getByText("Waiting for you")).toBeInTheDocument();
    expect(within(lin).getByRole("link", { name: "Lin Xiaoyu" })).toHaveAttribute("href", "/d/d1/assets/characters/lin");
    await user.click(within(lin).getByRole("link", { name: "Lin Xiaoyu" }));
    const detail = await screen.findByRole("complementary", { name: "Lin Xiaoyu: versions, state and review" });
    expect(within(detail).getByText("current v2 · none accepted")).toBeInTheDocument();
    expect(within(detail).getByText("Base look · v2")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "Review" })).toHaveAttribute("href", "/r/r2");
    expect(within(detail).getByRole("link", { name: "Lineage" })).toHaveAttribute("href", "/d/d1/assets/characters/lin?view=lineage");
    await user.click(within(detail).getByRole("button", { name: "v1" }));
    expect(await within(detail).findByText("Sent back")).toBeInTheDocument();
    // The version picked is the URL's, so the crumbs and Back agree on it (D48).
    expect(href(router)).toBe("/d/d1/assets/characters/lin?item=assets%2Fcharacters%2Flin&version=v1");
    expect(within(detail).getByRole("button", { name: "v1" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens an asset at the version a link names (D48)", async () => {
    engine();
    await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/characters/lin?item=assets%2Fcharacters%2Flin&version=v1");
    const detail = await screen.findByRole("complementary", { name: "Lin Xiaoyu: versions, state and review" });
    expect(within(detail).getByRole("button", { name: "v1" })).toHaveAttribute("aria-pressed", "true");
    expect(within(detail).getByText("Base look · v1")).toBeInTheDocument();
  });

  it("shows a place's views and times as a strip under its picture, and its description clamped with More (D56)", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/locations");
    const office = await screen.findByRole("article", { name: "Factory office" });
    expect(within(office).queryByText("Desks under strip lights.")).not.toBeInTheDocument();
    await user.click(within(office).getByRole("link", { name: "Factory office" }));
    const detail = await screen.findByRole("complementary", { name: "Factory office: versions, state and review" });
    const strip = within(detail).getByRole("group", { name: "Views" });
    expect(within(strip).getAllByRole("button").map((button) => button.textContent)).toEqual(["Plate", "left side", "Night"]);
    await user.click(within(strip).getByRole("button", { name: "left side" }));
    // The viewer shows the picked view large (yet-another-react-lightbox's slide).
    expect([...document.querySelectorAll(".assetviewer img")].map((image) => image.getAttribute("src"))).toContain("/f/4");
    expect(within(detail).getByText("Desks under strip lights.")).toHaveClass("clamp3");
    await user.click(within(detail).getByRole("button", { name: "More" }));
    expect(within(detail).getByText("Desks under strip lights.")).not.toHaveClass("clamp3");
    expect(within(detail).queryByText("image-1.png")).not.toBeInTheDocument();
  });

  it("moves the viewer's picture toward the side the picked view lies on, and opens an asset without moving (D56)", async () => {
    const user = userEvent.setup();
    engine();
    // jsdom has no View Transition API; the stub records each transition's types and applies its update at once.
    const types: string[][] = [];
    document.startViewTransition = ((options: StartViewTransitionOptions) => {
      types.push([...(options.types ?? [])]);
      void options.update?.();
    }) as never;
    try {
      await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/locations/office");
      const detail = await screen.findByRole("complementary", { name: "Factory office: versions, state and review" });
      const strip = within(detail).getByRole("group", { name: "Views" });
      expect(types).toEqual([]);
      await user.click(within(strip).getByRole("button", { name: "left side" }));
      await user.click(within(strip).getByRole("button", { name: "Plate" }));
      expect(types).toEqual([["asset-forward"], ["asset-backward"]]);
      expect([...document.querySelectorAll(".assetviewer img")].map((image) => image.getAttribute("src"))).toContain("/f/3");
    } finally {
      Reflect.deleteProperty(document, "startViewTransition");
    }
  });

  it("opens an asset in the viewer, its details beside it, and Esc goes back to the grid (D56)", async () => {
    const user = userEvent.setup();
    engine();
    const { router } = await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/characters/lin");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Lin Xiaoyu: versions, state and review" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(href(router)).toBe("/d/d1/assets/characters"));
  });

  it("keeps props on their own shelf", async () => {
    engine();
    await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/props");
    expect(await screen.findByRole("article", { name: "The letter" })).toBeInTheDocument();
  });
});
