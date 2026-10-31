import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LineageError, madeFromStale, mergeLineage, outOfDate, parseLineage, trace, type Lineage } from "./lineage.ts";

type Props = { id: string; kind: string; column: number; version: string | null; accepted: string | null; fresh: boolean | null; shows: string | null; reads: string[]; problems: string[]; label: string };

/** A node as `drama-cli export comfyui` writes it (short_drama drama_cli/export.py, comfyui). */
function node(n: number, props: Partial<Props> & Pick<Props, "id" | "kind" | "column">): Record<string, unknown> {
  return {
    id: n,
    type: "DramaCliStep",
    title: props.label ?? props.id,
    pos: [0, 0],
    size: [300, 340],
    properties: { version: "v1", accepted: "v1", fresh: true, shows: null, reads: [], problems: [], label: props.id, section: "Text", ...props },
  };
}

function exported(nodes: Record<string, unknown>[], links: [number, number][]): Record<string, unknown> {
  return {
    last_node_id: nodes.length,
    last_link_id: links.length,
    nodes,
    links: links.map(([from, to], i) => [i + 1, from, 0, to, 0, "DRAMA_CLI_FILE"]),
    groups: [],
    config: {},
    extra: { ds: { scale: 0.75, offset: [80, 80] }, drama_cli: { project: "/work/drama" } },
    version: 0.4,
  };
}

const PLATE = "assets/scenes/office/times/Day";
const BOARD = "episodes/EP001/multi_panel_storyboard/seg01/line-art";
const TAKE = "episodes/EP001/segments/seg01";

function sample(): Record<string, unknown> {
  return exported(
    [
      node(1, { id: "bible", kind: "bible", column: 0, shows: "bible/v1/bible.md" }),
      node(2, { id: "assets/characters/lin", kind: "look", column: 1, shows: "assets/characters/lin/v1/image-1.png", reads: ["bible"] }),
      node(3, { id: PLATE, kind: "plate", column: 1, version: "v2", accepted: "v2", reads: ["bible"] }),
      node(4, { id: "episodes/EP001/breakdown", kind: "breakdown", column: 2, reads: ["bible"] }),
      node(5, { id: BOARD, kind: "storyboard", column: 4, reads: ["bible", "episodes/EP001/breakdown"] }),
      node(6, { id: TAKE, kind: "take", column: 6, version: "t01", accepted: null, fresh: false, problems: [`Changed selection: ${PLATE}/accepted.json`] }),
      node(7, { id: "episodes/EP001/edit", kind: "cut", column: 7 }),
    ],
    [
      [2, 5],
      [3, 6],
      [5, 6],
      [6, 7],
    ],
  );
}

describe("drama-cli's lineage, as its comfyui export writes it", () => {
  it("reads each stage with its versions, freshness, reasons and links", () => {
    const lineage = parseLineage(sample());
    const take = lineage.nodes.find((n) => n.id === TAKE)!;
    expect(take).toMatchObject({ kind: "take", column: 6, version: "t01", accepted: null, fresh: false, problems: [`Changed selection: ${PLATE}/accepted.json`] });
    expect(take.where).toEqual({ episode: "EP001", segment: "seg01" });
    expect(lineage.nodes.find((n) => n.id === PLATE)!.where).toEqual({ subject: "office", time: "Day" });
    expect(lineage.nodes.find((n) => n.id === BOARD)!.where).toEqual({ episode: "EP001", segment: "seg01", style: "line-art" });
    expect(lineage.links).toContainEqual({ from: PLATE, to: TAKE });
    expect(lineage.links).toContainEqual({ from: "bible", to: BOARD });
    expect(lineage.project).toBe("/work/drama");
  });

  it.each([
    ["a node's reasons", (raw: any) => delete raw.nodes[5].properties.problems, "nodes.5.properties.problems"],
    ["a node's freshness", (raw: any) => (raw.nodes[5].properties.fresh = "no"), "nodes.5.properties.fresh"],
    ["a kind drama-cli doesn't write", (raw: any) => (raw.nodes[0].properties.kind = "poster"), "nodes.0.properties.kind"],
    ["a stage of another kind's path", (raw: any) => (raw.nodes[1].properties.kind = "prop"), "nodes.1.properties.id"],
    ["a link to no node", (raw: any) => (raw.links[0][3] = 99), "links.0"],
    ["a read of no stage", (raw: any) => (raw.nodes[1].properties.reads = ["nowhere"]), "nodes.1.properties.reads.0"],
    ["the project", (raw: any) => delete raw.extra.drama_cli, "extra.drama_cli"],
  ])("refuses an export without %s, naming the field", (_what, spoil, field) => {
    const raw = sample();
    spoil(raw);
    expect(() => parseLineage(raw)).toThrow(LineageError);
    expect(() => parseLineage(raw)).toThrow(`${field} `);
  });
});

describe("tracing a version", () => {
  const lineage = parseLineage(sample());

  it("finds what it was made from and what was made from it, through pictures and the texts read", () => {
    const { up, down } = trace(lineage, BOARD);
    expect([...up].sort()).toEqual(["assets/characters/lin", "bible", "episodes/EP001/breakdown"]);
    expect([...down].sort()).toEqual(["episodes/EP001/edit", TAKE]);
  });

  it("marks what was made from a stale version, which drama-cli itself may call fresh", () => {
    expect([...madeFromStale(lineage)]).toEqual(["episodes/EP001/edit"]);
  });

  it("holds as out of date what drama-cli calls stale and what was made from it", () => {
    expect([...outOfDate(lineage)].sort()).toEqual(["episodes/EP001/edit", TAKE]);
  });
});

describe("one drama's lineage from its sessions", () => {
  const setup = parseLineage(sample());

  function episodeExport(boardVersion: string, plateVersion: string): Lineage {
    const raw = sample() as any;
    raw.nodes[4].properties.version = boardVersion;
    raw.nodes[2].properties.version = plateVersion;
    return parseLineage(raw);
  }

  it("takes the shared stages from the setup and each episode's from its own sessions", () => {
    const merged = mergeLineage(setup, { EP001: episodeExport("v3", "v9") });
    expect(merged.nodes.find((n) => n.id === BOARD)!.version).toBe("v3");
    expect(merged.nodes.find((n) => n.id === PLATE)!.version).toBe("v2");
  });

  it("keeps the setup's view of an episode until that episode reports, and a link only when both its ends are kept", () => {
    const own = episodeExport("v3", "v2");
    own.nodes = own.nodes.filter((n) => n.id !== "episodes/EP001/edit");
    own.links = own.links.filter((l) => l.to !== "episodes/EP001/edit");
    const merged = mergeLineage(setup, { EP001: own });
    expect(merged.nodes.some((n) => n.id === "episodes/EP001/edit")).toBe(false);
    expect(merged.links.some((l) => l.to === "episodes/EP001/edit")).toBe(false);
    expect(mergeLineage(setup, {}).nodes).toEqual(setup.nodes);
  });

  it("takes an episode stage's links from the export that stage comes from, never the setup's older view of it", () => {
    const own = episodeExport("v3", "v2");
    own.links = own.links.filter((l) => !(l.from === PLATE && l.to === TAKE));
    const merged = mergeLineage(setup, { EP001: own });
    expect(merged.links).not.toContainEqual({ from: PLATE, to: TAKE });
    expect(merged.links).toContainEqual({ from: BOARD, to: TAKE });
  });
});

describe("real exports of drama-cli's (fixtures/lineage)", () => {
  const real = (name: string) => parseLineage(JSON.parse(readFileSync(new URL(`../../fixtures/lineage/${name}.json`, import.meta.url), "utf8")));

  it("read, every stage fresh once a take is shot", () => {
    const lineage = real("shot");
    expect(lineage.nodes.every((node) => node.fresh === true)).toBe(true);
    expect(trace(lineage, TAKE).up).toContain(PLATE);
  });

  it("say the take is stale, and why, once its plate at Day is replaced", () => {
    const take = real("time-plate-replaced").nodes.find((node) => node.id === TAKE)!;
    expect(take.fresh).toBe(false);
    expect(take.problems).toContain(`Changed selection: ${PLATE}/accepted.json`);
  });

  it("keep a take fresh when its location's plate is replaced, and the studio marks it made from a stale version", () => {
    const lineage = real("location-plate-replaced");
    expect(lineage.nodes.find((node) => node.id === PLATE)!.fresh).toBe(false);
    expect(lineage.nodes.find((node) => node.id === TAKE)!.fresh).toBe(true);
    expect(madeFromStale(lineage)).toContain(TAKE);
  });
});
