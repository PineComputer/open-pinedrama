// A sample drama's red line stops the episode whose bible range names it, on drama-cli's refusal, and asks
// the maker; the other episodes carry on (fixtures/replay/dramas.json, Bride on Bail's EP007).
import { describe, expect, it } from "vitest";
import { ReplayFleet } from "./replay-fleet.ts";

async function firstStop(goal: string) {
  const fleet = new ReplayFleet();
  const { id, credentials } = await fleet.newCredentials();
  await fleet.createComputer(credentials);
  const ref = { id } as Parameters<ReplayFleet["createSession"]>[0];
  const session = await fleet.createSession(ref);
  const turn = await fleet.wait(ref, session, (await fleet.run(ref, session, goal, "k")).turnId, 60_000);
  const refusals = turn.files.some((file) => file.path === "handoff/refusals.jsonl")
    ? new TextDecoder().decode(new Uint8Array(await new Response(await fleet.openFile(ref, session, "handoff/refusals.jsonl")).arrayBuffer()))
    : "";
  return { turn, refusals };
}

describe("a sample's red line", () => {
  it("stops the episode whose bible range names it, and asks the maker", async () => {
    const { turn, refusals } = await firstStop("Make episode EP007 of Bride on Bail. Title: Bride on Bail.");
    expect(turn.state).toBe("needs_input");
    expect(turn.question).toContain("red line");
    expect(JSON.parse(refusals.trim()).error).toMatchObject({ code: "RedLine", action: "ask_person" });
    expect(JSON.parse(refusals.trim()).error.message).toContain("--episodes EP007-EP012");
  }, 30_000);

  it("lets the other episodes carry on", async () => {
    const { turn, refusals } = await firstStop("Make episode EP006 of Bride on Bail. Title: Bride on Bail.");
    expect(refusals).toBe("");
    expect(turn.question).toContain("storyboards");
  }, 30_000);
});
