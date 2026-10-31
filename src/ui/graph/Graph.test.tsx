// The Graph, used as a maker uses it on real drama-cli exports (fixtures/lineage): the version in
// focus and its whole lineage as cards named as the bible names them, with their pictures (never a
// spec or request file); the pipeline's columns; a click to focus and the inspector's lists of what
// a version was made from and what was made from it; what is stale in drama-cli's own words, and what
// was made from a stale version. Read-only, and never a price: a redo is asked on the drama's Out of date
// (OutOfDate.test.tsx), not here.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLineage, type LineageView } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import type { ProjectView } from "../../shared/project.ts";
import type { ChatView, FileItem } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { mockReactFlow } from "../test/react-flow.ts";
import { Graph } from "./Graph.tsx";
import { renderAt } from "../test/router.tsx";

mockReactFlow();
afterEach(() => vi.restoreAllMocks());

const fixture = (folder: string, name: string) => JSON.parse(readFileSync(path.resolve("fixtures", folder, `${name}.json`), "utf8"));
const view = (name: string): LineageView => ({ lineage: parseLineage(fixture("lineage", name)), problems: [] });
const chat = (sessionId: string, label: string, sends: ChatView["sends"]): ChatView => ({ sessionId, label, sends, messages: [] });
const file = (id: number, relPath: string, type: string): FileItem => ({ id, sha: `sha${id}`, name: path.posix.basename(relPath), path: relPath, type, size: 1, kind: "other", url: `/api/files/${id}`, createdAt: "2026-10-30T10:00:00Z" });
// A look's spec and request come back beside its picture, and first.
const files = [file(1, "drama/assets/characters/lin/v1/spec.json", "application/json"), file(2, "drama/assets/characters/lin/v1/request.json", "application/json"), file(8, "drama/assets/characters/lin/v1/image-1.jpg", "image/jpeg"), file(7, "drama/episodes/EP001/segments/seg01/t01/video.mp4", "video/mp4")];

function engine(name: string, sessions: ChatView[] = [chat("setup", "", "run"), chat("ep1", "EP001", "steer")]) {
  answer("/api/dramas/d1/lineage", view(name));
  answer("/api/dramas/d1/files", files);
  answer("/api/dramas/d1/sessions", sessions);
  answer("/api/dramas/d1/project", { state: null, sessions: [], problems: [], names: parseBibleNames(fixture("status", "bible")) } satisfies ProjectView);
}

/** A version's card on the plane, found by its name. */
const card = async (name: RegExp) => within(await screen.findByRole("group", { name: "Lineage" })).findByRole("button", { name });

describe("the Graph", () => {
  it("opens on the episode's storyboard, as the prototype does, and draws its lineage as cards named as the bible names them, with their pictures, never a spec", async () => {
    engine("shot");
    await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    expect(await screen.findByRole("complementary", { name: "EP001 seg01 storyboard (line-art)" })).toBeInTheDocument();
    // The take's lineage holds the look and the plate.
    await userEvent.click(await card(/^EP001 seg01 take/));
    expect(await screen.findByRole("complementary", { name: "EP001 seg01 take" })).toBeInTheDocument();
    const lin = await card(/^林 v1/);
    expect(lin.querySelector("img")).toHaveAttribute("src", "/api/files/8");
    expect(await card(/^办公室 · Day v1/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assets\/characters/ })).toBeNull();
  });

  it("leaves Lineage for the item's one home: a look in Assets, a storyboard in its episode, never Home (IA §16; Codex's IA review, B1)", async () => {
    engine("shot");
    const { unmount } = await renderAt(<Graph dramaId="d1" />, "/d/d1/assets/characters/lin?view=lineage");
    expect(await screen.findByRole("link", { name: "Open in Assets" })).toHaveAttribute("href", "/d/d1/assets/characters/lin");
    unmount();
    await renderAt(<Graph dramaId="d1" />, "/d/d1/e/EP001/list?item=episodes%2FEP001%2Fmulti_panel_storyboard%2Fseg01%2Fline-art&view=lineage");
    expect(await screen.findByRole("link", { name: "Open in EP001" })).toHaveAttribute("href", "/d/d1/e/EP001/list?item=episodes%2FEP001%2Fmulti_panel_storyboard%2Fseg01%2Fline-art");
  });

  it("names a cut's home EPxxx › Cut, apart from the episode's List", async () => {
    engine("shot");
    // The shot export has no cut: one is added, made from its take, as drama-cli's edit stage is (lineage.ts, KINDS).
    const shot = view("shot");
    const take = shot.lineage!.nodes.find((node) => node.kind === "take")!;
    const cut = { ...take, id: "episodes/EP001/edit", kind: "cut" as const, label: "EP001 cut", version: "v1", accepted: "v1", where: { episode: "EP001" } };
    answer("/api/dramas/d1/lineage", { ...shot, lineage: { ...shot.lineage!, nodes: [...shot.lineage!.nodes, cut], links: [...shot.lineage!.links, { from: take.id, to: cut.id }] } });
    await renderAt(<Graph dramaId="d1" />, "/d/d1/e/EP001/cut?item=episodes%2FEP001%2Fedit&view=lineage");
    expect(await screen.findByRole("link", { name: "Open in EP001 › Cut" })).toHaveAttribute("href", "/d/d1/e/EP001/cut?item=episodes%2FEP001%2Fedit");
  });

  it("heads the columns with the pipeline's names for their kinds", async () => {
    engine("shot");
    await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    await card(/^EP001 breakdown v1/);
    const headings = [...screen.getByRole("group", { name: "Lineage" }).querySelectorAll(".gcol")].map((heading) => heading.textContent);
    expect(headings.some((text) => /storyboard/i.test(text ?? ""))).toBe(true);
    expect(headings.some((text) => /bible/i.test(text ?? ""))).toBe(true);
  });

  it("focuses a version on a click, and lists all it was made from and all that was made from it", async () => {
    engine("shot");
    await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    await userEvent.click(await card(/^EP001 seg01 storyboard \(line-art\) v1/));
    expect(await screen.findByRole("complementary", { name: "EP001 seg01 storyboard (line-art)" })).toBeInTheDocument();
    const from = screen.getByRole("region", { name: /^Made from \d/ });
    expect(within(from).getByRole("button", { name: /^EP001 breakdown/ })).toBeInTheDocument();
    expect(within(from).getByRole("button", { name: /^Bible/ })).toBeInTheDocument();
    const made = screen.getByRole("region", { name: /^Made from it/ });
    expect(within(made).getByRole("button", { name: /^EP001 seg01 take/ })).toBeInTheDocument();
    await userEvent.click(within(made).getByRole("button", { name: /^EP001 seg01 take/ }));
    expect(await screen.findByRole("complementary", { name: "EP001 seg01 take" })).toBeInTheDocument();
  });

  it("opens with the focus in view beside what it was made from, scrolling the plane rather than shrinking it (QA J2)", async () => {
    engine("time-plate-replaced");
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    const scrolled: number[] = [];
    vi.spyOn(HTMLElement.prototype, "scrollLeft", "set").mockImplementation((value: number) => void scrolled.push(value));
    await renderAt(<Graph dramaId="d1" />, "/d/d1/e/EP001/list?item=episodes%2FEP001%2Fsegments%2Fseg01&view=lineage");
    expect(await card(/^EP001 seg01 take t01/)).toBeInTheDocument();
    // The take stands in a far column: 400 px of plane can't show it from the left edge, so the plane scrolls to it.
    await waitFor(() => expect(Math.max(0, ...scrolled)).toBeGreaterThan(400));
  });

  it("says what is stale in drama-cli's own words", async () => {
    engine("time-plate-replaced");
    await renderAt(<Graph dramaId="d1" />, "/d/d1/e/EP001/list?item=episodes%2FEP001%2Fsegments%2Fseg01&view=lineage");
    expect(await card(/^EP001 seg01 take t01/)).toHaveTextContent("Out of date");
    expect(screen.getByRole("region", { name: "State" })).toHaveTextContent("Changed selection: assets/scenes/office/times/Day/accepted.json");
  });

  it("marks what was made from a stale version, which drama-cli calls fresh, apart from what drama-cli calls stale", async () => {
    engine("location-plate-replaced");
    await renderAt(<Graph dramaId="d1" />, "/d/d1/assets/locations/office?item=assets%2Fscenes%2Foffice%2Ftimes%2FDay&view=lineage");
    expect(await card(/^办公室 · Day v1/)).toHaveTextContent("Out of date");
    expect(await card(/^EP001 seg01 take t01/)).toHaveTextContent("Made from an out-of-date version");
  });

  it("offers no way to make, edit or keep a version, and shows no price", async () => {
    engine("time-plate-replaced");
    const { container } = await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    await card(/^EP001 seg01 take t01/);
    const actions = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    expect(actions.filter((text) => /generat|draw|edit|keep|regenerat|\bmake\b/i.test(text))).toEqual([]);
    expect(container.textContent).not.toMatch(/\$|USD|¥/);
  });

  it("says plainly when no stop has returned a lineage yet", async () => {
    answer("/api/dramas/d1/lineage", { lineage: null, problems: [] } satisfies LineageView);
    answer("/api/dramas/d1/files", []);
    answer("/api/dramas/d1/sessions", []);
    answer("/api/dramas/d1/project", { state: null, sessions: [], problems: [], names: null } satisfies ProjectView);
    await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    expect(await screen.findByText(/No version has a lineage yet/)).toBeInTheDocument();
  });
});
