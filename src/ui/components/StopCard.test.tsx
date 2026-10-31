// StopCard on drama-cli's own refusals for a budget, a cap and the credentials, word for word as drama-cli prints them
// (short_drama drama_cli/errors.py describe): each line goes through parseRefusals as a stop's handoff/refusals.jsonl
// would, so the card is tested on what a real stop returns.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseRefusals } from "../../shared/refusal.ts";
import { StopCard } from "./StopCard.tsx";

const card = (line: string) => render(<StopCard refusal={parseRefusals(`${line}\n`)[0]} />);

describe("StopCard on drama-cli's refusals", () => {
  // drama_cli/records.py: a paid call past budget_usd is refused before it is sent. Its command has no code yet, so
  // describe gives the bare Refused, no param and no action. The studio sets no budget (goals.ts NO_CAP), so a maker
  // meets this only on a project whose config states one.
  it("shows the budget refusal as one to read, with drama-cli's sums as they came", () => {
    const said = "Budget exceeded: spent 996.40 + reserved 3.20 + this 1.20 > budget 1000.00";
    card(`{"error": {"code": "Refused", "message": "${said}", "param": null, "action": null}}`);
    const stop = screen.getByRole("region", { name: "The agent needs you to read this" });
    expect(stop).toHaveClass("stopcard");
    expect(within(stop).getByText("Refused")).toBeInTheDocument();
    expect(within(stop).getByText(said)).toBeInTheDocument();
    expect(within(stop).queryByText("Limit")).toBeNull();
  });

  // drama_cli/stages.py _limit_failure: SetLimitExceeded.<key>, param defaults.<key>, action ask_person.
  it("shows a cap with the config key it names, and drama-cli's whole sentence", () => {
    const said =
      "episodes/EP004/multi_panel_storyboard/seg06/line-art has had 3 new paid versions after its first, the limit defaults.max_new_versions (3); ask the person before making it again: they lift the limit for that item by raising defaults.max_new_versions in the config, then set it back; then run drama-cli multi-panel-storyboard --config drama-cli.cfg.yaml line-art EP004 seg06";
    card(`{"error": {"code": "SetLimitExceeded.max_new_versions", "message": "${said}", "param": "defaults.max_new_versions", "action": "ask_person"}}`);
    const stop = screen.getByRole("region", { name: "defaults.max_new_versions is reached" });
    expect(stop).toHaveClass("stopcard", "cap");
    expect(within(stop).getByText("Limit reached")).toBeInTheDocument();
    expect(within(stop).getByText("SetLimitExceeded.max_new_versions")).toBeInTheDocument();
    expect(within(stop).getByText("defaults.max_new_versions")).toBeInTheDocument();
    expect(within(stop).getByText(said)).toBeInTheDocument();
  });

  // drama_cli/stages.py _failed_limit_problem, then _limit_failure with "trying it again".
  it("shows the failed-attempts cap by its own key", () => {
    const said =
      "assets/characters/luca has failed 3 times before any picture, the limit defaults.max_failed_attempts (3); ask the person before trying it again: they lift the limit for that item by raising defaults.max_failed_attempts in the config, then set it back";
    card(`{"error": {"code": "SetLimitExceeded.max_failed_attempts", "message": "${said}", "param": "defaults.max_failed_attempts", "action": "ask_person"}}`);
    expect(screen.getByRole("region", { name: "defaults.max_failed_attempts is reached" })).toHaveClass("cap");
  });

  // drama_cli/errors.py describe: an env.ConfigError is InvalidParameter.env, param --env, action fix_input;
  // drama_cli/env.py words a missing key as "Missing credential: set <NAME> in <the .env>".
  it("shows missing credentials as one to read: --env is no limit to raise", () => {
    const said = "Missing credential: set ARK_API_KEY in /work/drama/.env";
    card(`{"error": {"code": "InvalidParameter.env", "message": "${said}", "param": "--env", "action": "fix_input"}}`);
    const stop = screen.getByRole("region", { name: "The agent needs you to read this" });
    expect(within(stop).getByText("InvalidParameter.env")).toBeInTheDocument();
    expect(within(stop).getByText(said)).toBeInTheDocument();
    expect(within(stop).queryByText("Limit")).toBeNull();
  });
});
