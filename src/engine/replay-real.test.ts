// A sample drama from a real run plays as drama-cli wrote it: picked by its own title though another run of the same
// screenplay is a sample too, its pictures returned with their asset-library records (fixtures/replay/samples/full).
import { describe, expect, it } from "vitest";
import { ReplayFleet } from "./replay-fleet.ts";

async function firstStop(goal: string) {
  const fleet = new ReplayFleet();
  const { id, credentials } = await fleet.newCredentials();
  await fleet.createComputer(credentials);
  const ref = { id } as Parameters<ReplayFleet["createSession"]>[0];
  const session = await fleet.createSession(ref);
  const turn = await fleet.wait(ref, session, (await fleet.run(ref, session, goal, "k")).turnId, 60_000);
  const read = async (path: string) => new TextDecoder().decode(new Uint8Array(await new Response(await fleet.openFile(ref, session, path)).arrayBuffer()));
  return { turn, read };
}

describe("a sample drama from a real run", () => {
  it("is played by its own title, apart from another run of the same screenplay", async () => {
    // double-life-ep001's EP001 has five segments; paper-vows' (another run of the screenplay) three.
    const r1 = await firstStop("Make episode EP001 of The Double Life of My Billionaire Husband (r1). Title: The Double Life of My Billionaire Husband (r1).");
    expect(r1.turn.question).toContain("5 segments");
    const r4 = await firstStop("Make episode EP001 of The Double Life of My Billionaire Husband (r4). Title: The Double Life of My Billionaire Husband (r4).");
    expect(r4.turn.question).toContain("3 segments");
  }, 60_000);

  it("returns a storyboard with drama-cli's asset record, without the account's identifiers", async () => {
    const { turn, read } = await firstStop("Make episode EP001 of The Double Life of My Billionaire Husband (r1). Title: The Double Life of My Billionaire Husband (r1).");
    const records = turn.files.filter((file) => file.path.endsWith("/asset/asset.json"));
    expect(records.length).toBeGreaterThan(0);
    const record = JSON.parse(await read(records[0].path));
    expect(record.Id).toMatch(/^asset-/);
    expect(record).not.toHaveProperty("GroupId");
    expect(record).not.toHaveProperty("ProjectName");
  }, 60_000);
});
