// The bible's page: the logline and the tone, each episode's title, summary, end hook and seconds, its beats opened
// under it, and where the bible stands and how much it covers, as drama-cli's status says.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { answer } from "../test/server.ts";
import { Bible } from "./Bible.tsx";
import { renderAt } from "../test/router.tsx";

const names = {
  title: "T",
  characters: {},
  locations: {},
  props: {},
  episodes: { EP001: "The stepmother arrives", EP002: "The will" },
  logline: "A stepmother wins the house.",
  tone: "Warm domestic drama, fast.",
  beats: [
    { event: "She arrives.", seconds: 12, lines: [1, 4] },
    { event: "The family stares.", seconds: 8, lines: [5, 9] },
    { event: "The lawyer reads the will.", seconds: 20, lines: [10, 18] },
  ],
  summaries: { EP001: "She meets the family.", EP002: "The will names her." },
  endHooks: { EP001: "A letter under the door.", EP002: "The house is hers." },
  seconds: { EP001: 20, EP002: 20 },
  lines: { EP001: [1, 9], EP002: [10, 18] },
  descriptions: { locations: {}, props: {} },
};

function engine(bible: object | null = null) {
  answer("/api/dramas/d1/project", { state: bible && { bible: { candidate: null, run: [], errors: [], ...bible }, episodes: {} }, sessions: [], problems: [], names });
}

describe("the Bible", () => {
  it("shows the logline and the tone, before anything is drawn", async () => {
    engine();
    await renderAt(<Bible dramaId="d1" />, "/d/d1/bible");
    expect(await screen.findByText("A stepmother wins the house.")).toBeInTheDocument();
    expect(screen.getByText("Warm domestic drama, fast.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bible" })).toBeInTheDocument();
  });

  it("lists each episode's title, summary, end hook and seconds, and opens its own beats under it", async () => {
    const user = userEvent.setup();
    engine();
    await renderAt(<Bible dramaId="d1" />, "/d/d1/bible");
    const table = within(await screen.findByRole("region", { name: "Episodes" }));
    const row = table.getByRole("row", { name: /EP001\s*The stepmother arrives\s*She meets the family\.\s*A letter under the door\.\s*20/ });
    expect(row).toBeInTheDocument();
    expect(screen.queryByText("She arrives.")).not.toBeInTheDocument();
    const open = within(row).getByRole("button", { name: "EP001" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    await user.click(open);
    expect(open).toHaveAttribute("aria-expanded", "true");
    const beats = document.getElementById(open.getAttribute("aria-controls") ?? "");
    expect(beats).toHaveTextContent("Beats · 2");
    expect(beats).toHaveTextContent("She arrives. 12 s");
    expect(beats).toHaveTextContent("The family stares. 8 s");
    expect(beats).not.toHaveTextContent("The lawyer reads the will.");
  });

  it.each([
    [{ current: "v1", accepted: "v1", usable: true, coverage: { episodes: 2 } }, "Bible v1 · accepted · covers all 2 episodes, the whole screenplay"],
    [{ current: "v2", accepted: "v1", usable: false, why: "v2 waits for your review", coverage: { episodes: 2 } }, "Bible v2 · not yet accepted · v1 accepted · covers all 2 episodes, the whole screenplay"],
    [{ current: "v2", accepted: "v2", usable: false, why: "made from a screenplay that changed" }, "Bible v2 · accepted · not usable: made from a screenplay that changed"],
    // Codex round 4, F6: a bible still being written says so with status's next step, never a later range's promise.
    [{ current: "v1", accepted: null, usable: false, coverage: { episodes: 1, next: "drama-cli bible --config drama-cli.cfg.yaml EP002" } }, "Bible v1 · not yet accepted · still being written: covers 1 of 2 episodes · next: drama-cli bible --config drama-cli.cfg.yaml EP002"],
  ])("says where the bible stands and what it covers, as drama-cli's status gives it (%o)", async (bible, line) => {
    engine(bible);
    await renderAt(<Bible dramaId="d1" />, "/d/d1/bible");
    expect(await screen.findByText(line)).toBeInTheDocument();
  });
});
