// A sample drama's screenplay is its own (QA Y7: every sample had shown The Stepmother's): the original it starts from and the
// Fountain its rewrite returns come from the sample itself, and a sample with no screenplay of its own gets one written from its
// episodes, never another sample's.
import { describe, expect, it } from "vitest";
import { ReplayFleet, sampleScreenplay, screenplayOf, STORIES } from "./replay-fleet.ts";

const story = (episodes: { title: string; segments: { heading: string; shots: string[] }[] }[]) =>
  ({ ...STORIES[Object.keys(STORIES)[0]].en, episodes: episodes.map((e) => ({ ...e, segments: e.segments.map((s, i) => ({ id: `seg0${i + 1}`, ...s })) })) });

describe("a sample's screenplay", () => {
  it("is written from its episodes in Fountain: a section per episode, a numbered scene per heading, a shot per action line", () => {
    const text = screenplayOf(
      story([
        { title: "The Wedding", segments: [{ heading: "EXT. GARDEN - DAY", shots: ["Ivy at the aisle"] }, { heading: "EXT. GARDEN - DAY", shots: ["The rings"] }, { heading: "INT. CELL - NIGHT", shots: ["Luca waits"] }] },
        { title: "Night Shift", segments: [{ heading: "INT. APARTMENT - NIGHT", shots: ["Ivy at the window"] }] },
      ]),
      "en",
    );
    expect(text.split("\n").filter(Boolean)).toEqual([
      "# Episode 1",
      "= The Wedding",
      "EXT. GARDEN - DAY #1-1#",
      "Ivy at the aisle",
      "The rings",
      "INT. CELL - NIGHT #1-2#",
      "Luca waits",
      "# Episode 2",
      "= Night Shift",
      "INT. APARTMENT - NIGHT #2-1#",
      "Ivy at the window",
    ]);
  });

  it("forces a heading that isn't INT. or EXT., as the Chinese sample's own screenplay does", () => {
    const text = screenplayOf(story([{ title: "婚礼", segments: [{ heading: "外景 花园婚礼 日", shots: ["交换戒指"] }] }]), "zh");
    expect(text.split("\n").filter(Boolean)).toEqual(["# 第1集", "= 婚礼", ".外景 花园婚礼 日 #1-1#", "交换戒指"]);
  });

  it("is each sample's own: none starts from The Stepmother's screenplay but The Stepmother", () => {
    const first = Object.keys(STORIES)[0];
    const stepmother = new TextDecoder().decode(sampleScreenplay(first, "en").bytes);
    for (const id of Object.keys(STORIES).filter((id) => id !== first)) {
      const own = new TextDecoder().decode(sampleScreenplay(id, "en").bytes);
      expect(own, id).not.toBe(stepmother);
    }
  });

  it("is returned at The Stepmother's rewrite as drama-cli recorded it: its Fountain, review, original and validate.json with the line map", async () => {
    const fleet = new ReplayFleet();
    const { id, credentials } = await fleet.newCredentials();
    await fleet.createComputer(credentials);
    const ref = { id } as Parameters<ReplayFleet["createSession"]>[0];
    const session = await fleet.createSession(ref);
    // The setup's goal as replay recognises it (scriptFor: "vertical short drama from my screenplay"), naming the sample by its title.
    const goal = `Make a vertical short drama from my screenplay. Title: ${STORIES[Object.keys(STORIES)[0]].en.title}.`;
    await fleet.wait(ref, session, (await fleet.run(ref, session, goal, "k")).turnId, 60_000);
    const read = async (file: string) => new TextDecoder().decode(new Uint8Array(await new Response(await fleet.openFile(ref, session, file)).arrayBuffer()));
    const validate = JSON.parse(await read("drama/screenplay/v1/validate.json")) as { rewrite: boolean; lines: { line: number; to: number[] }[] };
    expect(validate.rewrite).toBe(true);
    expect(validate.lines.some((line) => line.to.length > 0)).toBe(true);
    expect(await read("drama/screenplay/v1/original.txt")).toBe(new TextDecoder().decode(sampleScreenplay(Object.keys(STORIES)[0], "en").bytes));
  });

});
