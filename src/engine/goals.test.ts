// What the goals ask the agent to hand back at each stop besides the files under review:
// drama-cli's own status of the project, which the skill calls the source of truth.
import { describe, expect, it } from "vitest";
import { episodeGoal, rehearsed, resumeGoal, setupGoal, type DramaBrief } from "./goals.ts";

const drama: DramaBrief = {
  title: "The Stepmother",
  language: "en",
  look: "",
  format: "9:16, 480p",
  notes: "",
  length: "60",
  preset: "en-us-live-sfw",
  screenplay_language: "en",
};

const STATUS = "drama-cli status --config drama/drama-cli.cfg.yaml > handoff/status.json";

function times(text: string, part: string): number {
  return text.split(part).length - 1;
}

describe("each stop returns drama-cli's status", () => {
  it("in the setup session", () => {
    const goal = setupGoal(drama, ["screenplay.md", "brief.md"], { screenplay: "screenplay.md", brief: "brief.md" });
    expect(times(goal, STATUS)).toBe(1);
    expect(goal).toContain("return handoff/status.json");
  });

  it("in an episode's session", () => {
    const goal = episodeGoal(drama, "EP002", ["project.tar.part-aa"], true, "screenplay.md");
    expect(times(goal, STATUS)).toBe(1);
    expect(goal).toContain("return handoff/status.json");
  });

  it("in a session that carries an episode on", () => {
    const goal = resumeGoal(drama, "EP002", ["project.tar.part-aa", "EP002.tar.part-aa"], true, undefined, "screenplay.md");
    expect(times(goal, STATUS)).toBe(1);
  });

  it("with the config the session's own init writes, the one every other command in the goal names", () => {
    const goal = episodeGoal(drama, "EP002", ["project.tar.part-aa"], true, "screenplay.md");
    expect(goal).toContain("drama-cli status --config drama/drama-cli.cfg.yaml`.");
    expect(goal).toContain("drama-cli init drama ");
  });

  it("but not in a rehearsal, which has no drama-cli to ask", () => {
    const goal = rehearsed(episodeGoal(drama, "EP002", ["project.tar.part-aa"], true, "screenplay.md"));
    expect(goal).toContain("return no handoff/status.json");
  });
});

const REFUSALS = "exactly the JSON line the command printed (`{\"error\": ...}`), one per line, in handoff/refusals.jsonl";

describe("a stop that asks about a drama-cli refusal returns the refusal", () => {
  it.each([
    ["the setup session", setupGoal(drama, ["screenplay.md", "brief.md"], { screenplay: "screenplay.md", brief: "brief.md" })],
    ["an episode's session", episodeGoal(drama, "EP002", ["project.tar.part-aa"], true, "screenplay.md")],
    ["a session that carries an episode on", resumeGoal(drama, "EP002", ["project.tar.part-aa", "EP002.tar.part-aa"], true, undefined, "screenplay.md")],
  ])("in %s, as drama-cli printed it, afresh at each such stop and at no other", (_where, goal) => {
    expect(times(goal, REFUSALS)).toBe(1);
    expect(goal).toContain("written afresh at each such stop");
    expect(goal).toContain("at any other stop, return none");
  });

  it("but not in a rehearsal, which has no drama-cli to refuse", () => {
    const goal = rehearsed(episodeGoal(drama, "EP002", ["project.tar.part-aa"], true, "screenplay.md"));
    expect(goal).toContain("return no handoff/status.json, handoff/lineage.json or handoff/refusals.jsonl");
  });
});

const LINEAGE = "drama-cli export comfyui --config drama/drama-cli.cfg.yaml --out handoff/lineage.json";

describe("each stop returns drama-cli's lineage", () => {
  it.each([
    ["the setup session", setupGoal(drama, ["screenplay.md", "brief.md"], { screenplay: "screenplay.md", brief: "brief.md" })],
    ["an episode's session", episodeGoal(drama, "EP002", ["project.tar.part-aa"], true, "screenplay.md")],
    ["a session that carries an episode on", resumeGoal(drama, "EP002", ["project.tar.part-aa", "EP002.tar.part-aa"], true, undefined, "screenplay.md")],
  ])("in %s, written outside the project, as drama-cli's export requires", (_where, goal) => {
    expect(times(goal, LINEAGE)).toBe(1);
    expect(goal).toContain("return handoff/lineage.json");
  });

  it("but not in a rehearsal, which has no drama-cli to ask", () => {
    const goal = rehearsed(episodeGoal(drama, "EP002", ["project.tar.part-aa"], true, "screenplay.md"));
    expect(goal).toContain("return no handoff/status.json, handoff/lineage.json or handoff/refusals.jsonl");
  });
});

const SPECS = "also return the spec.json and request.json in that version's folder";

describe("each picture, take or cut comes with drama-cli's statement of the job", () => {
  it.each([
    ["the setup session", setupGoal(drama, ["screenplay.md", "brief.md"], { screenplay: "screenplay.md", brief: "brief.md" })],
    ["an episode's session", episodeGoal(drama, "EP002", ["project.tar.part-aa"], true, "screenplay.md")],
    ["a session that carries an episode on", resumeGoal(drama, "EP002", ["project.tar.part-aa", "EP002.tar.part-aa"], true, undefined, "screenplay.md")],
  ])("in %s, asked for by name, never worked out from the folder", (_where, goal) => {
    expect(times(goal, SPECS)).toBe(1);
  });

  it("but not in a rehearsal, whose stand-in writes none", () => {
    const goal = rehearsed(episodeGoal(drama, "EP002", ["project.tar.part-aa"], true, "screenplay.md"));
    expect(goal).toContain("and no spec.json or request.json");
  });
});
