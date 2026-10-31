// The drama's Out of date on real drama-cli exports (fixtures/lineage): what drama-cli calls stale and what was made
// from it, grouped by the session that redoes them, each row opening its home or its Lineage; the reason readable where
// classify knows the file, drama-cli's words always there; a redo asked with its impact, sent once (D21; IA §15–16).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage, type LineageView } from "../../shared/lineage.ts";
import { parseBibleNames } from "../../shared/names.ts";
import type { ChatView } from "../../shared/types.ts";
import { useT } from "../i18n.ts";
import { href, renderAt } from "../test/router.tsx";
import { answer, calls, server } from "../test/server.ts";
import { OutOfDate, readable } from "./OutOfDate.tsx";

const fixture = (folder: string, name: string) => JSON.parse(readFileSync(path.resolve("fixtures", folder, `${name}.json`), "utf8"));
const view = (name: string): LineageView => ({ lineage: parseLineage(fixture("lineage", name)), problems: [] });
const chat = (sessionId: string, label: string, sends: ChatView["sends"]): ChatView => ({ sessionId, label, sends, messages: [] });

function engine(name: string, sessions: ChatView[] = [chat("setup", "", "run"), chat("ep1", "EP001", "steer")]) {
  answer("/api/dramas/d1/lineage", view(name));
  answer("/api/dramas/d1/sessions", sessions);
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
    expect(within(plate).getByText("Changed selection: assets/scenes/office/accepted.json")).toBeInTheDocument();
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

  it("asks before a redo with what it remakes, then sends it once to the session that owns them", async () => {
    const user = userEvent.setup();
    engine("location-plate-replaced");
    server.use(http.post("/api/sessions/setup/redo", async ({ request }) => HttpResponse.json({ ...((await request.json()) as object), id: "x", sessionId: "setup", state: "sent" })));
    await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    await user.click(within(await waitFor(() => group(/^Assets$/))).getByRole("button", { name: "Ask the setup's agent to redo them" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/It will remake .*Day.* v1\. It spends from the drama's budget; the earlier versions stay\./);
    expect(calls("POST", "/api/sessions/setup/redo")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Ask to redo" }));
    expect(await within(group(/^Assets$/)).findByText("Sent to the setup's agent.")).toBeInTheDocument();
    const sent = calls("POST", "/api/sessions/setup/redo");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ submissionId: expect.any(String), text: expect.stringContaining("assets/scenes/office/times/Day v1") });
  });

  it("redoes one row alone, and says the engine's refusal with Send again under the same submission", async () => {
    const user = userEvent.setup();
    engine("location-plate-replaced");
    server.use(http.post("/api/sessions/ep1/redo", () => HttpResponse.json({ error: "This session has ended.", code: "session-ended" }, { status: 409 })));
    await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    const take = await waitFor(() => row(/take/i));
    await user.click(within(take).getByRole("button", { name: "Redo this" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Ask to redo" }));
    expect(await within(take).findByText("This session has ended.")).toBeInTheDocument();
    await user.click(within(take).getByRole("button", { name: "Send again" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Ask to redo" }));
    await waitFor(() => expect(calls("POST", "/api/sessions/ep1/redo")).toHaveLength(2));
    const [first, again] = calls("POST", "/api/sessions/ep1/redo").map((call) => (call.body as { submissionId: string; text: string }));
    expect(again.submissionId).toBe(first.submissionId);
    expect(first.text).toContain("episodes/EP001/segments/seg01 t01");
    expect(first.text).not.toContain("blocking");
  });

  it("says a shared reference can't be redone once the setup has handed over, while an episode's still can", async () => {
    engine("location-plate-replaced", [chat("setup", "", "none"), chat("ep1", "EP001", "steer")]);
    await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    const assets = await waitFor(() => group(/^Assets/));
    expect(await within(assets).findByText("Shared references are redone in a new setup session. Not available yet.")).toBeInTheDocument();
    expect(within(assets).getByRole("button", { name: "Ask the setup's agent to redo them" })).toBeDisabled();
    expect(within(row(/take/i)).getByRole("button", { name: "Redo this" })).toBeEnabled();
  });

  it("can't ask while the owner's session waits on a review, and says why", async () => {
    engine("location-plate-replaced", [chat("setup", "", "review"), chat("ep1", "EP001", "steer")]);
    await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    const button = within(await waitFor(() => group(/^Assets$/))).getByRole("button", { name: "Ask the setup's agent to redo them" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("title", "The agent waits on your review first: decide it, then ask.");
  });

  it("keeps the story apart from the assets, both the setup's", async () => {
    engine("location-plate-replaced");
    const lineage = view("location-plate-replaced").lineage!;
    answer("/api/dramas/d1/lineage", { lineage: { ...lineage, nodes: lineage.nodes.map((node) => (node.id === "bible" ? { ...node, fresh: false, problems: ["Changed file: screenplay/v2/screenplay.fountain"] } : node)) }, problems: [] });
    await renderAt(<OutOfDate dramaId="d1" />, "/d/d1/out-of-date");
    const story = await waitFor(() => group(/^Story$/));
    expect(within(story).getByRole("button", { name: "Ask the setup's agent to redo them" })).toBeInTheDocument();
    expect(within(row(/bible/i)).getByText("An input changed: Screenplay v2")).toBeInTheDocument();
    expect(group(/^Assets$/)).not.toBe(story);
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
    return <span>{readable(problem, t) ?? "unknown"}</span>;
  }

  it.each([
    ["Changed file: bible/v3/bible.json", "An input changed: Bible v3"],
    ["Changed file: assets/props/letter/v2/image-1.png", "An input changed: Prop v2"],
    ["Changed selection: assets/scenes/office/times/Day/accepted.json", "unknown"],
    ["the export could not read it", "unknown"],
  ])("reads %s by what classify knows of its file", async (problem, line) => {
    await renderAt(<Probe problem={problem} />);
    expect(screen.getByText(line)).toBeInTheDocument();
  });
});
