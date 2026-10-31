// A sample's recorded history can redraw a storyboard after its take was shot (DramaData.boardsAfterTakes): Bride on
// Bail's EP006 redraws seg04's once a takes review accepts seg04's take, so that take, shot from the earlier board, is out
// of date by drama-cli's rule in the lineage that stop hands back, while the other segments' takes stay fresh.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLineage } from "../shared/lineage.ts";

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "studio-redraw-"));
process.env.STUDIO_SECRET = Buffer.alloc(32, 1).toString("base64");

describe("a recorded late redraw", () => {
  it("leaves Bride's EP006 seg04 take out of date once a takes review accepts it", async () => {
    const { episodeScript, STORIES } = await import("./replay-fleet.ts");
    const play = episodeScript("EP006", "en", "en-us-live-sfw", { id: "bride-on-bail", story: STORIES["bride-on-bail"].en });
    const lineageOf = (step: ReturnType<typeof play>) => parseLineage(JSON.parse(new TextDecoder().decode(step.files.find((file) => file.path === "handoff/lineage.json")!.bytes)));
    const take = (step: ReturnType<typeof play>, segment: string) => lineageOf(step).nodes.find((node) => node.id === `episodes/EP006/segments/${segment}`)!;
    play("");
    const shot = play("");
    // The takes are shot from the storyboards then accepted: all fresh.
    expect(take(shot, "seg04").fresh).toBe(true);
    // The seed's first takes review: seg01 and seg03 sent back, seg02's and seg04's takes accepted; seg04's storyboard is
    // redrawn as v2 and accepted, its t01 shot from v1.
    const answered = play("Revise:\n- seg01: tighter\n- seg03: too dark");
    expect(answered.files.map((file) => file.path)).toContain("drama/episodes/EP006/multi_panel_storyboard/seg04/line-art/v2/image-1.svg");
    expect(take(answered, "seg04")).toMatchObject({ fresh: false, problems: expect.arrayContaining(["Changed selection: episodes/EP006/multi_panel_storyboard/seg04/line-art/accepted.json"]) });
    expect(take(answered, "seg02").fresh).toBe(true);
    expect(take(answered, "seg03").fresh).toBe(true);
  });

  it("waits until seg04's take is accepted: a take sent back is shot again first, from the board as it is", async () => {
    const { episodeScript, STORIES } = await import("./replay-fleet.ts");
    const play = episodeScript("EP006", "en", "en-us-live-sfw", { id: "bride-on-bail", story: STORIES["bride-on-bail"].en });
    const lineageOf = (step: ReturnType<typeof play>) => parseLineage(JSON.parse(new TextDecoder().decode(step.files.find((file) => file.path === "handoff/lineage.json")!.bytes)));
    const take = (step: ReturnType<typeof play>) => lineageOf(step).nodes.find((node) => node.id === "episodes/EP006/segments/seg04")!;
    play("");
    play("");
    // The first takes review sends seg04 back (the decision's "Revise:" list, decisions.ts): reshot, its board unchanged.
    const reshot = play("Revise:\n- seg04: too dark");
    expect(reshot.files.map((file) => file.path)).not.toContain("drama/episodes/EP006/multi_panel_storyboard/seg04/line-art/v2/image-1.svg");
    expect(take(reshot).fresh).toBe(true);
    // The next one accepts it: then the board moves on, and the take shot from the earlier one is out of date.
    const accepted = play("");
    expect(take(accepted).fresh).toBe(false);
  });
});
