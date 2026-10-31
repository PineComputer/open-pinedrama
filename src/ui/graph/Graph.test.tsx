// The Graph, used as a maker uses it on real drama-cli exports (fixtures/lineage): the version in
// focus and its whole lineage as cards named as the bible names them, with their pictures (never a
// spec or request file); the pipeline's columns; a click to focus and the inspector's lists of what
// a version was made from and what was made from it; what is stale in drama-cli's own words, and what
// was made from a stale version; and one way to act: ask the agent to redo them, sent to the session
// that may. Read-only otherwise, and never a price.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLineage, type LineageView } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import type { ProjectView } from "../../shared/project.ts";
import type { ChatView, FileItem } from "../../shared/types.ts";
import { accept, answer, calls } from "../test/server.ts";
import { mockReactFlow } from "../test/react-flow.ts";
import { Graph } from "./Graph.tsx";
import { renderAt } from "../test/router.tsx";

mockReactFlow();
afterEach(() => vi.restoreAllMocks());

const fixture = (folder: string, name: string) => JSON.parse(readFileSync(path.resolve("fixtures", folder, `${name}.json`), "utf8"));
const view = (name: string): LineageView => ({ lineage: parseLineage(fixture("lineage", name)), problems: [] });
const chat = (sessionId: string, label: string, sends: ChatView["sends"]): ChatView => ({ sessionId, label, sends, messages: [] });
const file = (id: number, relPath: string, type: string): FileItem => ({ id, name: path.posix.basename(relPath), path: relPath, type, size: 1, kind: "other", url: `/api/files/${id}`, createdAt: "2026-10-30T10:00:00Z" });
// A look's spec and request come back beside its picture, and first.
const files = [file(1, "drama/assets/characters/lin/v1/spec.json", "application/json"), file(2, "drama/assets/characters/lin/v1/request.json", "application/json"), file(8, "drama/assets/characters/lin/v1/image-1.jpg", "image/jpeg"), file(7, "drama/episodes/EP001/segments/seg01/t01/video.mp4", "video/mp4")];

function engine(name: string, sessions: ChatView[] = [chat("setup", "", "run"), chat("ep1", "EP001", "steer")]) {
  answer("/api/dramas/d1/lineage", view(name));
  answer("/api/dramas/d1/files", files);
  answer("/api/dramas/d1/sessions", sessions);
  answer("/api/dramas/d1/project", { state: null, sessions: [], problems: [], names: parseBibleNames(fixture("status", "bible")) } satisfies ProjectView);
}

/** A version's card on the plane, found by its name. */
const card = async (name: RegExp) => within(await screen.findByRole("group", { name: "Graph" })).findByRole("button", { name });

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

  it("heads the columns with the pipeline's names for their kinds", async () => {
    engine("shot");
    await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    await card(/^EP001 breakdown v1/);
    const headings = [...screen.getByRole("group", { name: "Graph" }).querySelectorAll(".gcol")].map((heading) => heading.textContent);
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
    await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    const bar = await screen.findByRole("region", { name: /stale/i });
    expect(bar).toHaveTextContent("EP001 seg01 take t01: Changed selection: assets/scenes/office/times/Day/accepted.json");
    expect(await card(/^EP001 seg01 take t01/)).toHaveTextContent("Stale");
  });

  it("marks what was made from a stale version, which drama-cli calls fresh, apart from what drama-cli calls stale", async () => {
    engine("location-plate-replaced");
    await renderAt(<Graph dramaId="d1" />, "/d/d1/assets/locations/office?item=assets%2Fscenes%2Foffice%2Ftimes%2FDay&view=lineage");
    expect(await card(/^办公室 · Day v1/)).toHaveTextContent("Stale");
    expect(await card(/^EP001 seg01 take t01/)).toHaveTextContent("Made from a stale version");
  });

  it("asks the agent to redo them, each in the session that may: an episode's own in its session", async () => {
    engine("time-plate-replaced");
    accept("/api/sessions/ep1/chat");
    await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    await userEvent.click(await screen.findByRole("button", { name: "Ask the agent to redo them" }));
    await waitFor(() => expect(calls("POST", "/api/sessions/ep1/chat")).toHaveLength(1));
    const [{ body }] = calls("POST", "/api/sessions/ep1/chat") as { body: { text: string } }[];
    expect(body.text).toContain("episodes/EP001/segments/seg01 t01: Changed selection: assets/scenes/office/times/Day/accepted.json");
    expect(calls("POST", "/api/sessions/setup/chat")).toHaveLength(0);
    expect(await screen.findByRole("status")).toHaveTextContent("Sent to the agent.");
  });

  it("sends a shared stage's redo to the setup's session", async () => {
    engine("location-plate-replaced");
    accept("/api/sessions/setup/chat");
    await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    await userEvent.click(await screen.findByRole("button", { name: "Ask the agent to redo them" }));
    await waitFor(() => expect(calls("POST", "/api/sessions/setup/chat")).toHaveLength(1));
    expect(calls("POST", "/api/sessions/ep1/chat")).toHaveLength(0);
  });

  it("says why it can't ask while the session waits on the maker's review, and sends nothing", async () => {
    engine("time-plate-replaced", [chat("setup", "", "run"), chat("ep1", "EP001", "review")]);
    await renderAt(<Graph dramaId="d1" />, "/d/d1/out-of-date");
    const ask = await screen.findByRole("button", { name: "Ask the agent to redo them" });
    await waitFor(() => expect(ask).toHaveAccessibleDescription(/review/i));
    expect(ask).toBeDisabled();
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
