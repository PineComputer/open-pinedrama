// The Graph, used as a maker uses it on real drama-cli exports (fixtures/lineage): each version
// named as the bible names it, around the version in focus out to a depth, of the kinds chosen;
// found from the navigator; traced by a click; brought forward on hover or keyboard focus; what is
// stale in drama-cli's own words, and what was made from a stale version; and one way to act: ask
// the agent to redo them, sent to the session that may. Read-only otherwise, and never a price.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage, type LineageView } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import type { ProjectView } from "../../shared/project.ts";
import type { ChatView, FileItem } from "../../shared/types.ts";
import { navigate } from "../router.tsx";
import { accept, answer, calls } from "../test/server.ts";
import { Graph } from "./Graph.tsx";
import { mockReactFlow } from "../test/react-flow.ts";

mockReactFlow();

const fixture = (folder: string, name: string) => JSON.parse(readFileSync(path.resolve("fixtures", folder, `${name}.json`), "utf8"));
const view = (name: string): LineageView => ({ lineage: parseLineage(fixture("lineage", name)), problems: [] });
const chat = (sessionId: string, label: string, sends: ChatView["sends"]): ChatView => ({ sessionId, label, sends, messages: [] });
const take: FileItem = { id: 7, name: "video.mp4", path: "drama/episodes/EP001/segments/seg01/t01/video.mp4", type: "video/mp4", size: 1, kind: "take", url: "/api/files/7", createdAt: "2026-10-30T10:00:00Z" };
const look: FileItem = { id: 8, name: "image-1.jpg", path: "drama/assets/characters/lin/v1/image-1.jpg", type: "image/jpeg", size: 1, kind: "look", url: "/api/files/8", createdAt: "2026-10-30T10:00:00Z" };

function engine(name: string, sessions: ChatView[] = [chat("setup", "", "run"), chat("ep1", "EP001", "steer")]) {
  navigate("/d/d1/graph", { replace: true });
  answer("/api/dramas/d1/lineage", view(name));
  answer("/api/dramas/d1/files", [take, look]);
  answer("/api/dramas/d1/sessions", sessions);
  answer("/api/dramas/d1/project", { state: null, sessions: [], problems: [], names: parseBibleNames(fixture("status", "bible")) } satisfies ProjectView);
}

/** A version on the canvas, found by its name. */
const node = async (name: RegExp) => within(await screen.findByRole("group", { name: "Graph" })).getByRole("button", { name });
const canvasHas = (name: RegExp) => within(screen.getByRole("group", { name: "Graph" })).queryByRole("button", { name }) !== null;

describe("the Graph", () => {
  it("draws the episode's newest work in focus, each version around it named as the bible names it, with its picture, never an id", async () => {
    engine("shot");
    render(<Graph dramaId="d1" />);
    expect(await screen.findByRole("heading", { name: "EP001 seg01 take" })).toBeInTheDocument();
    const lin = await node(/^林 v1/);
    expect(lin.querySelector("img")).toHaveAttribute("src", "/api/files/8");
    expect(await node(/^办公室 · Day v1/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assets\/characters/ })).toBeNull();
  });

  it("focuses a version on a click, and lists what it was made from and what was made from it", async () => {
    engine("shot");
    render(<Graph dramaId="d1" />);
    await userEvent.click(await node(/^EP001 seg01 storyboard \(line-art\) v1/));
    expect(await screen.findByRole("heading", { name: "EP001 seg01 storyboard (line-art)" })).toBeInTheDocument();
    const from = screen.getByRole("region", { name: /^Made from \d/ });
    expect(within(from).getByRole("button", { name: /^EP001 breakdown/ })).toBeInTheDocument();
    const made = screen.getByRole("region", { name: /^Made from it/ });
    expect(within(made).getByRole("button", { name: /^EP001 seg01 take/ })).toBeInTheDocument();
    expect(within(made).getByRole("button", { name: /^EP001 video prompts/ })).toBeInTheDocument();
    await userEvent.click(within(made).getByRole("button", { name: /^EP001 seg01 take/ }));
    expect(await screen.findByRole("heading", { name: "EP001 seg01 take" })).toBeInTheDocument();
  });

  it("reaches as many links out as the depth chosen", async () => {
    engine("shot");
    render(<Graph dramaId="d1" />);
    await node(/^办公室 · Day v1/);
    expect(canvasHas(/^办公室 v1/)).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: /^Depth/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "2 links out" }));
    await waitFor(() => expect(canvasHas(/^办公室 v1/)).toBe(true));
  });

  it("shows only the kinds chosen", async () => {
    engine("shot");
    render(<Graph dramaId="d1" />);
    await node(/^林 v1/);
    await userEvent.click(screen.getByRole("button", { name: /^Kinds/ }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Looks/ }));
    // The menu stays open for another choice, as Reveric's does; Escape closes it.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvasHas(/^林 v1/)).toBe(false));
    expect(canvasHas(/^EP001 seg01 take/)).toBe(true);
  });

  it("finds a version from the navigator and focuses it", async () => {
    engine("shot");
    render(<Graph dramaId="d1" />);
    const versions = await screen.findByRole("complementary", { name: "Versions" });
    await userEvent.type(within(versions).getByRole("textbox", { name: "Find a version…" }), "办公");
    expect(within(versions).queryByRole("button", { name: /^林/ })).toBeNull();
    await userEvent.click(within(versions).getByRole("button", { name: /^办公室 · Day/ }));
    expect(await screen.findByRole("heading", { name: "办公室 · Day" })).toBeInTheDocument();
  });

  it("brings a version forward on hover or keyboard focus, with a card saying where it stands", async () => {
    engine("time-plate-replaced");
    render(<Graph dramaId="d1" />);
    await userEvent.hover(await node(/^EP001 seg01 take t01/));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Changed selection: assets/scenes/office/times/Day/accepted.json");
    await userEvent.unhover(await node(/^EP001 seg01 take t01/));
    expect(screen.queryByRole("tooltip")).toBeNull();
    (await node(/^林 v1/)).focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("林");
  });

  it("says what is stale in drama-cli's own words", async () => {
    engine("time-plate-replaced");
    render(<Graph dramaId="d1" />);
    const bar = await screen.findByRole("region", { name: /stale/i });
    const row = within(bar).getByRole("button", { name: /^EP001 seg01 take t01/ }).closest("li")!;
    expect(row).toHaveTextContent("Changed selection: assets/scenes/office/times/Day/accepted.json");
    expect(await node(/^EP001 seg01 take t01/)).toHaveAccessibleName("EP001 seg01 take t01 · Stale");
  });

  it("marks what was made from a stale version, which drama-cli calls fresh, apart from what drama-cli calls stale", async () => {
    engine("location-plate-replaced");
    render(<Graph dramaId="d1" />);
    expect(await node(/^办公室 · Day v1/)).toHaveAccessibleName("办公室 · Day v1 · Stale");
    expect(await node(/^EP001 seg01 take t01/)).toHaveAccessibleName("EP001 seg01 take t01 · Made from a stale version");
  });

  it("asks the agent to redo them, each in the session that may: an episode's own in its session, a shared one in the setup's", async () => {
    engine("time-plate-replaced");
    accept("/api/sessions/ep1/chat");
    render(<Graph dramaId="d1" />);
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
    render(<Graph dramaId="d1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Ask the agent to redo them" }));
    await waitFor(() => expect(calls("POST", "/api/sessions/setup/chat")).toHaveLength(1));
    expect(calls("POST", "/api/sessions/ep1/chat")).toHaveLength(0);
  });

  it("says why it can't ask while the session waits on the maker's review, and sends nothing", async () => {
    engine("time-plate-replaced", [chat("setup", "", "run"), chat("ep1", "EP001", "review")]);
    render(<Graph dramaId="d1" />);
    const ask = await screen.findByRole("button", { name: "Ask the agent to redo them" });
    await waitFor(() => expect(ask).toHaveAccessibleDescription(/review/i));
    expect(ask).toBeDisabled();
  });

  it("offers no way to make, edit or keep a version, and shows no price", async () => {
    engine("time-plate-replaced");
    const { container } = render(<Graph dramaId="d1" />);
    await node(/^EP001 seg01 take t01/);
    const actions = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    expect(actions.filter((text) => /generat|draw|edit|keep|regenerat|\bmake\b/i.test(text))).toEqual([]);
    expect(container.textContent).not.toMatch(/\$|USD|¥/);
  });

  it("says plainly when no stop has returned a lineage yet", async () => {
    answer("/api/dramas/d1/lineage", { lineage: null, problems: [] } satisfies LineageView);
    answer("/api/dramas/d1/files", []);
    answer("/api/dramas/d1/sessions", []);
    answer("/api/dramas/d1/project", { state: null, sessions: [], problems: [], names: null } satisfies ProjectView);
    render(<Graph dramaId="d1" />);
    expect(await screen.findByText(/No version has a lineage yet/)).toBeInTheDocument();
  });
});
