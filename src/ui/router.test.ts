// A drama page's place (Codex's IA review, B1): the episode and the item travel apart, so switching surface keeps
// both, and an asset's id is never taken for an episode.
import { describe, expect, it } from "vitest";
import { placeHref, placeOf } from "./router.tsx";

const at = (href: string) => {
  const url = new URL(href, "http://studio");
  return placeOf(url.pathname, url.searchParams);
};

describe("a drama page's place", () => {
  it.each([
    ["a character", { item: "assets/characters/ivy" }, "/d/d1/story"],
    ["a location", { item: "assets/scenes/cell" }, "/d/d1/story"],
    ["an episode's storyboard", { episode: "EP006", item: "episodes/EP006/multi_panel_storyboard/seg01/line-art" }, "/d/d1/e/EP006"],
  ])("keeps %s picked on Graph when it switches to Canvas and to Studio", (_, picked, studio) => {
    const graph = placeHref({ dramaId: "d1", surface: "graph", ...picked });
    const canvas = placeHref({ ...at(graph)!, surface: "canvas" });
    expect(at(canvas)).toEqual({ dramaId: "d1", surface: "canvas", ...picked });
    expect(placeHref({ ...at(canvas)!, surface: "studio" })).toBe(studio);
  });

  it("reads an episode's page, and the drama's other pages as Studio", () => {
    expect(at("/d/d1/e/EP006")).toEqual({ dramaId: "d1", surface: "studio", episode: "EP006" });
    expect(at("/d/d1/story")).toEqual({ dramaId: "d1", surface: "studio" });
  });

  it("reads no place from a path that isn't a drama's page", () => {
    expect(at("/d/d1/e/assets/characters/ivy")).toBeNull();
    expect(at("/settings")).toBeNull();
  });
});
