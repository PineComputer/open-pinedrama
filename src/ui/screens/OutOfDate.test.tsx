// The drama's Out of date on real drama-cli exports (fixtures/lineage): what drama-cli calls stale and what was made
// from it, grouped by the session that redoes them, each row opening its home or its Lineage; the reason readable where
// classify knows the file, drama-cli's words always there; a redo asked with its impact, sent once (D21; IA §15–16).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage, type LineageView } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import { useT } from "../i18n.ts";
import { href, renderAt } from "../test/router.tsx";
import { answer, calls } from "../test/server.ts";
import { OutOfDate, readable } from "./OutOfDate.tsx";

const fixture = (folder: string, name: string) => JSON.parse(readFileSync(path.resolve("fixtures", folder, `${name}.json`), "utf8"));
const view = (name: string): LineageView => ({ lineage: parseLineage(fixture("lineage", name)), problems: [] });

function engine(name: string) {
  answer("/api/dramas/d1/lineage", view(name));
  answer("/api/dramas/d1/project", { state: null, sessions: [], problems: [], names: parseBibleNames(fixture("status", "bible")) });
}

const group = (name: RegExp) => screen.getByText(name, { selector: "b" }).closest("tr")!;
const row = (name: RegExp) => screen.getByRole("link", { name }).closest("tr")!;

describe("the drama's Out of date", () => {
  it("lists what drama-cli calls stale and what was made from it, the setup's apart from each episode's", async () => {
    engine("location-plate-replaced");
    await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    expect(await screen.findByText(/out of date$/)).toHaveTextContent(/^\d+ out of date$/);
    expect(group(/^Assets$/)).toBeInTheDocument();
    expect(group(/^Episodes · EP001$/)).toBeInTheDocument();
    // The plate drama-cli calls stale, its reason in drama-cli's words (classify doesn't know an accepted.json).
    const plate = row(/Day/);
    // A changed selection reads as the stage it names and the version it selects now (one line for its accepted.json and
    // current.json), drama-cli's words under it.
    expect(within(plate).getByText("An input changed: Place v2")).toBeInTheDocument();
    expect(within(plate).getByText("Changed selection: assets/scenes/office/accepted.json")).toBeInTheDocument();
    expect(within(plate).getByText("Changed selection: assets/scenes/office/current.json")).toBeInTheDocument();
    expect(within(plate).getByText(/^Stale artifact: Changed selection/)).toBeInTheDocument();
    // What drama-cli calls fresh but was made from it says so, naming what it was made from.
    expect(within(row(/take/i)).getByText(/^Made from .*, which is out of date\.$/)).toBeInTheDocument();
  });

  it("opens each row's home, or its Lineage there, marking the row for Back", async () => {
    const user = userEvent.setup();
    engine("location-plate-replaced");
    const { router } = await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    const plate = await waitFor(() => row(/Day/));
    expect(within(plate).getByRole("link", { name: /Day/ })).toHaveAttribute("href", "/d/d1/assets/locations/office?item=assets%2Fscenes%2Foffice%2Ftimes%2FDay");
    expect(within(plate).getByRole("link", { name: "Lineage" })).toHaveAttribute("href", "/d/d1/assets/locations/office?item=assets%2Fscenes%2Foffice%2Ftimes%2FDay&view=lineage");
    await user.click(within(plate).getByRole("link", { name: "Lineage" }));
    await waitFor(() => expect(href(router)).toBe("/d/d1/assets/locations/office?item=assets%2Fscenes%2Foffice%2Ftimes%2FDay&view=lineage"));
    // The top bar's Back to says where Back returns (TopBar.tsx, BackTo).
    expect(router.state.location.state.backTo).toBe("Out of date");
    // Back lands on this page with the row marked (the history entry; the app's router follows it on popstate).
    router.history.back();
    expect(router.history.location.pathname + router.history.location.search).toBe("/d/d1/out-of-date?item=assets%2Fscenes%2Foffice%2Ftimes%2FDay");
  });

  it("is a view: no redo or other action, one line pointing to the agent in the sidebar (UI actions rule)", async () => {
    engine("location-plate-replaced");
    await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    expect(await screen.findByText("Ask the agent in the sidebar to redo them.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(calls("GET", "/api/dramas/d1/sessions")).toHaveLength(0);
  });

  it("keeps the script and the bible apart from the assets", async () => {
    engine("location-plate-replaced");
    const lineage = view("location-plate-replaced").lineage!;
    answer("/api/dramas/d1/lineage", { lineage: { ...lineage, nodes: lineage.nodes.map((node) => (node.id === "bible" ? { ...node, fresh: false, problems: ["Changed file: screenplay/v2/screenplay.fountain"] } : node)) }, problems: [] });
    await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    const written = await waitFor(() => group(/^Script and bible$/));
    expect(within(row(/bible/i)).getByText("An input changed: Screenplay v2")).toBeInTheDocument();
    expect(group(/^Assets$/)).not.toBe(written);
  });

  it("says when nothing is out of date, with no action", async () => {
    engine("time-plate-replaced");
    answer("/api/dramas/d1/lineage", { lineage: { ...view("time-plate-replaced").lineage!, nodes: view("time-plate-replaced").lineage!.nodes.map((node) => ({ ...node, fresh: true, problems: [] })) }, problems: [] });
    await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    expect(await screen.findByText("Nothing is out of date.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("a drama-cli reason, as the maker reads it", () => {
  function Probe({ problem }: { problem: string }) {
    const { t } = useT();
    return <span>{readable(problem, t, (stage) => (stage === "episodes/EP006/multi_panel_storyboard/seg04/line-art" ? "v2" : undefined)) ?? "unknown"}</span>;
  }

  it.each([
    ["Changed file: bible/v3/bible.json", "An input changed: Bible v3"],
    ["Changed file: assets/props/letter/v2/image-1.png", "An input changed: Prop v2"],
    ["Changed selection: episodes/EP006/multi_panel_storyboard/seg04/line-art/accepted.json", "An input changed: Storyboard v2"],
    ["Changed selection: episodes/EP006/multi_panel_storyboard/seg04/line-art/current.json", "An input changed: Storyboard v2"],
    ["Changed selection: assets/scenes/office/times/Day/accepted.json", "An input changed: Place"],
    ["Changed selection: somewhere/else/accepted.json", "unknown"],
    ["the export could not read it", "unknown"],
  ])("reads %s by what classify knows of its file", async (problem, line) => {
    await renderAt(<Probe problem={problem} />);
    expect(screen.getByText(line)).toBeInTheDocument();
  });
});
