// The Story: the episodes as the bible titles them, the cast as cards named as the bible names
// them with their other names and where each stands, the world as places and props; a card opens
// its asset's detail, which links to its review, as decisions are made there.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CastCard } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { Cast } from "./Cast.tsx";
import { renderAt } from "../test/router.tsx";

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
const names = { title: "T", characters: { lin: { name: "Lin Xiaoyu", aliases: ["Xiaoyu"] } }, locations: { office: "Factory office" }, props: { letter: "The letter" }, episodes: { EP001: "The stepmother arrives" }, logline: "A stepmother wins the house.", beats: ["She arrives."], summaries: { EP001: "She meets the family." }, descriptions: { locations: { office: "Desks under strip lights." }, props: { letter: "A folded letter." } } };

function engine() {
  answer("/api/dramas/d1/cast", cast);
  answer("/api/dramas/d1/project", { state: null, sessions: [], problems: [], names });
}

describe("the Story", () => {
  it("shows the cast named as the bible names them, with their other names and the episodes they are in", async () => {
    engine();
    await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/characters");
    const lin = await screen.findByRole("article", { name: "Lin Xiaoyu" });
    expect(within(lin).getByText("Xiaoyu")).toBeInTheDocument();
    expect(within(lin).getByRole("link", { name: "EP001" })).toHaveAttribute("href", "/d/d1/e/EP001/list");
  });

  it("opens a card's asset at its home: the detail links to its review and shows its earlier versions (J1)", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/characters");
    const lin = await screen.findByRole("article", { name: "Lin Xiaoyu" });
    expect(within(lin).getByText("Waiting for you")).toBeInTheDocument();
    expect(within(lin).getByRole("link", { name: "Lin Xiaoyu" })).toHaveAttribute("href", "/d/d1/assets/characters/lin");
    await user.click(within(lin).getByRole("link", { name: "Lin Xiaoyu" }));
    const detail = await screen.findByRole("complementary", { name: "Lin Xiaoyu: versions, state and review" });
    expect(within(detail).getByText("current v2 · none accepted")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "Review" })).toHaveAttribute("href", "/r/r2");
    expect(within(detail).getByRole("link", { name: "Lineage" })).toHaveAttribute("href", "/d/d1/assets/characters/lin?view=lineage");
    await user.click(within(detail).getByRole("button", { name: "v1" }));
    expect(within(detail).getByText("Sent back")).toBeInTheDocument();
  });

  it("keeps places in Locations with their description, views and times, and props in Props", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<Cast dramaId="d1" />, "/d/d1/assets/locations");
    const office = await screen.findByRole("article", { name: "Factory office" });
    expect(within(office).getByText("Desks under strip lights.")).toBeInTheDocument();
    expect(within(office).getByRole("link", { name: "left side" })).toHaveAttribute("href", "/f/4");
    expect(within(office).getByRole("link", { name: "Night · v2" })).toHaveAttribute("href", "/f/5");
    await user.click(within(office).getByRole("link", { name: "Factory office" }));
    const detail = await screen.findByRole("complementary", { name: "Factory office: versions, state and review" });
    expect(within(detail).getAllByRole("link").map((link) => link.getAttribute("href"))).toContain("/f/3");
    await user.click(screen.getByRole("tab", { name: /Props/ }));
    expect(within(await screen.findByRole("article", { name: "The letter" })).getByText("A folded letter.")).toBeInTheDocument();
  });

  it("keeps the bible on Story, a page of its own with no asset tabs (IA §16)", async () => {
    engine();
    await renderAt(<Cast dramaId="d1" />, "/d/d1/story");
    expect(await screen.findByRole("link", { name: /EP001\s*The stepmother arrives/ })).toHaveAttribute("href", "/d/d1/e/EP001/list");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it.each([
    [{ current: "v1", accepted: "v1", usable: true }, "Bible v1 · accepted"],
    [{ current: "v2", accepted: "v1", usable: false, why: "v2 waits for your review" }, "Bible v2 · not yet accepted · v1 accepted"],
    [{ current: "v2", accepted: "v2", usable: false, why: "made from a screenplay that changed" }, "Bible v2 · accepted · not usable: made from a screenplay that changed"],
  ])("says where the bible stands as drama-cli's status gives it (%o)", async (bible, line) => {
    engine();
    answer("/api/dramas/d1/project", { state: { bible: { candidate: null, run: [], errors: [], ...bible }, episodes: {} }, sessions: [], problems: [], names });
    await renderAt(<Cast dramaId="d1" />, "/d/d1/story");
    expect(await screen.findByText(line)).toBeInTheDocument();
  });

  it("opens on the bible: the logline, the beats and each episode's summary", async () => {
    engine();
    await renderAt(<Cast dramaId="d1" />, "/d/d1/story");
    expect(await screen.findByText("A stepmother wins the house.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Beats" })).getByText("She arrives.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /EP001\s*The stepmother arrives\s*She meets the family\./ })).toBeInTheDocument();
  });
});
