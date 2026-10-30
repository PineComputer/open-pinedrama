// The status report replay hands back at each stop, as Pine's agent hands back drama-cli's
// (goals.ts RETURN_STATUS). Replay has no drama-cli project, so this writes the report its
// recording would have: the same shape as drama-cli's status (fixtures/status, v0.7.4), with the
// versions the recording made and what the maker has approved so far.

type Version = string | null;

export interface Made {
  current: Version;
  accepted: Version;
}

export interface EpisodeMade {
  segments: string[];
  /** Each segment's scene heading, as the screenplay heads its scene. */
  headings?: Record<string, string>;
  /** Each segment's storyboards, once drawn, by segment: line-art and photoreal share a version; its blocking reference is accepted with them. */
  boards?: Record<string, Made>;
  /** The takes made of each segment, t01 first, and whether its newest is accepted. */
  takes?: Record<string, { count: number; accepted: boolean }>;
  cut?: Made;
}

/** A shared reference and the asset it is: assets/characters/<id>[/states/<look>], assets/scenes/<id>[/times/<time>] or assets/props/<id>. */
export interface Reference extends Made {
  path: string;
}

export interface ReplayProgress {
  preset: string;
  bible: Version;
  /** A lead's base look, by id, and the shared references by the key the maker names each by (a further look as id/look). */
  looks: Record<string, Made>;
  references: Record<string, Reference>;
  episodes: Record<string, EpisodeMade>;
}

const CONFIG = "/work/drama/drama-cli.cfg.yaml";
/** The storyboard styles replay draws for each segment (replay-fleet.ts, boards). */
const STYLES = ["line-art", "photoreal"];

function stage(path: string, made: Made) {
  const usable = made.current !== null && made.current === made.accepted;
  const why = made.current === null ? `${path}: none is made` : `${path}: its working version ${made.current} is not accepted`;
  return {
    current: made.current,
    candidate: usable ? null : made.current,
    accepted: made.accepted,
    usable,
    ...(usable ? {} : { why, run: [`drama-cli accept /work/drama/${path} <vN> --reason <why> --config ${CONFIG}`] }),
    requests: [],
  };
}

const accepted = (version: string): Made => ({ current: version, accepted: version });
const none: Made = { current: null, accepted: null };

function episode(code: string, made: EpisodeMade, references: Record<string, Reference>) {
  const base = `episodes/${code}`;
  const each = <T>(read: (segment: string) => T) => Object.fromEntries(made.segments.map((segment) => [segment, read(segment)]));
  const takes = made.takes;
  const missing = Object.entries(references).filter(([, reference]) => reference.current === null || reference.current !== reference.accepted);
  return {
    breakdown: { ...stage(`${base}/breakdown`, accepted("v1")), accepted_file: `/work/drama/${base}/breakdown/v1/breakdown.json` },
    edit: stage(`${base}/edit`, made.cut ?? none),
    video_prompts: { current: takes ? "v1" : null, stale: [] },
    blocking: made.boards ? each((segment) => stage(`${base}/blocking/${segment}`, accepted("v1"))) : {},
    first_frame_reference: {},
    multi_panel_storyboard: made.boards
      ? each((segment) => Object.fromEntries(STYLES.map((style) => [style, stage(`${base}/multi_panel_storyboard/${segment}/${style}`, made.boards![segment])])))
      : {},
    segments: each((segment) => {
      const shot = takes?.[segment];
      const versions = Array.from({ length: shot?.count ?? 0 }, (_, n) => `t${String(n + 1).padStart(2, "0")}`);
      const newest = versions.at(-1) ?? null;
      return {
        ...stage(`${base}/segments/${segment}`, { current: newest, accepted: shot?.accepted ? newest : null }),
        takes: versions.map((version) => ({ version, state: "downloaded", accepted: Boolean(shot?.accepted) && version === newest })),
      };
    }),
    // Each segment its own scene, numbered as drama-cli numbers them (#episode-scene#).
    scene_chains: made.segments.map((segment, i) => ({ scene_heading: `${made.headings?.[segment] ?? "INT. HOME - DAY"} #${Number(code.slice(2))}-${i + 1}#`, segments: [segment] })),
    needs: missing.map(([key, reference]) => {
      const state = stage(reference.path, reference);
      return { reference: key, path: `/work/drama/${reference.path}`, why: state.why ?? "", run: state.run ?? [], segments: made.segments };
    }),
  };
}

/** The report, as the bytes of handoff/status.json. */
export function replayStatus(progress: ReplayProgress): { path: string; type: string; bytes: Uint8Array } {
  const characters: Record<string, ReturnType<typeof stage> & { states?: Record<string, ReturnType<typeof stage>> }> = {};
  const scenes: Record<string, ReturnType<typeof stage> & { times?: Record<string, ReturnType<typeof stage>> }> = {};
  const props: Record<string, ReturnType<typeof stage>> = {};
  for (const [id, made] of Object.entries(progress.looks)) characters[id] = stage(`assets/characters/${id}`, made);
  // A base before its further looks and times: its path is the shorter.
  for (const reference of Object.values(progress.references).sort((x, y) => x.path.length - y.path.length)) {
    const [, kind, id, , inner] = reference.path.split("/");
    const state = stage(reference.path, reference);
    if (kind === "characters" && inner) (characters[id].states ??= {})[inner] = state;
    else if (kind === "characters") characters[id] = state;
    else if (kind === "scenes" && inner) (scenes[id].times ??= {})[inner] = state;
    else if (kind === "scenes") scenes[id] = state;
    else props[id] = state;
  }
  const report = {
    project: "/work/drama",
    preset: progress.preset,
    bible: progress.bible
      ? { ...stage("bible", accepted(progress.bible)), accepted_file: `/work/drama/bible/${progress.bible}/bible.json`, coverage: { episodes: Object.keys(progress.episodes).length } }
      : stage("bible", none),
    characters,
    scenes,
    props,
    episodes: Object.fromEntries(Object.entries(progress.episodes).map(([code, made]) => [code, episode(code, made, progress.references)])),
    budget: { budget_usd: null, spent_usd: 0, reserved_usd: 0, remaining_usd: null, cost_valuation: null },
  };
  return { path: "handoff/status.json", type: "application/json", bytes: new TextEncoder().encode(JSON.stringify(report, null, 2)) };
}
