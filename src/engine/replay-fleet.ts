// The Fleet in replay mode: a recording of the drama skill's stops, played through the
// same calls as Pine, with placeholder files. It is not a simulated agent: each run or
// answer plays the next recorded turn, and an answer that asks for revisions replays the
// redraw of what it names. It lives in memory, so a restarted engine finds its Computers
// gone, as it would after a real stop.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Refusal } from "../shared/refusal.ts";
import path from "node:path";
import { typeOf } from "./classify.ts";
import { FIXTURES } from "./config.ts";
import { revisedKeys } from "./decisions.ts";
import { DRAMA_SKILL } from "./goals.ts";
import type { Attached, ComputerRef, Fleet, FleetEvent, Limits, SessionRef, TurnFile, TurnInfo } from "./fleet.ts";
import { blocking, lookSheet, plate, prop, storyboard } from "./placeholders.ts";
import { samplesFrom } from "./replay-samples.ts";
import { lineageAt, replayLineage } from "./replay-lineage.ts";
import { type EpisodeMade, type Made, type ReplayProgress, replayStatus } from "./replay-status.ts";

const SPEED = Number(process.env.STUDIO_REPLAY_SPEED ?? 1);

interface Out {
  path: string;
  type: string;
  bytes: Uint8Array;
}

interface Step {
  progress: string[];
  files: Out[];
  ask?: string;
  summary?: string;
}

interface Turn {
  info: TurnInfo;
  waiters: (() => void)[];
}

interface Session {
  name: string;
  token: string;
  taskId: string;
  turns: Map<string, Turn>;
  latest?: string;
  keys: Map<string, string>;
  events: FleetEvent[];
  files: Map<string, Out>;
  play?: Player;
  lang?: Lang;
}

interface Machine {
  state: string;
  sessions: Map<string, Session>;
}

/** What a script does next, given the maker's answer (empty for the first turn). */
type Player = (answer: string) => Step;

const text = (s: string) => new TextEncoder().encode(s);
const svg = (p: string, body: string): Out => ({ path: p, type: "image/svg+xml", bytes: text(body) });
const video = (p: string, name: "take" | "cut"): Out => ({ path: p, type: "video/mp4", bytes: readFileSync(path.join(FIXTURES, `${name}.mp4`)) });

const sample = samplesFrom(path.join(FIXTURES, "samples"));
/** A picture: the sample for its path, where there is one, else the placeholder drawn for it. */
const art = (set: string, p: string, body: string): Out => sample(set, p) ?? svg(p, body);
/** A clip: the sample for its path, else the take's or the cut's placeholder clip. */
const clip = (set: string, p: string, name: "take" | "cut"): Out => sample(set, p) ?? video(p, name);
/** A JSON file as replay returns it. */
const json = (p: string, value: unknown): Out => ({ path: p, type: "application/json", bytes: text(JSON.stringify(value, null, 1)) });
/**
 * A picture's or take's spec.json and request.json in its version's folder, as drama-cli writes them, and its
 * asset-library record (asset/asset.json, whose Id a request names as asset://<Id>): the sample's, copied from the run it
 * comes from, where it has them. Only a placeholder picture gets a spec of drama-cli's shape written for it; a real
 * picture whose run left no spec gets none, rather than words drama-cli never wrote.
 */
const specs = (set: string, dir: string, placeholder: Record<string, unknown>): Out[] => {
  const own = [`${dir}/spec.json`, `${dir}/request.json`, `${dir}/asset/asset.json`].flatMap((p) => sample(set, p) ?? []);
  const real = sample(set, `${dir}/image-1.svg`) ?? sample(set, `${dir}/video.mp4`);
  return own.length || real ? own : [json(`${dir}/spec.json`, placeholder)];
};
/** A placeholder picture's spec: drama-cli's image spec, with the samples' model (fixtures/replay/samples/full). */
const imageSpec = (prompt: string, aspect: "16:9" | "9:16") => ({ provider: "openai", model: "gpt-image-2.5-sunburst", prompt, aspect_ratio: aspect, size: aspect === "16:9" ? "2048x1152" : "1152x2048", quality: "high" });
/** A placeholder take's spec: drama-cli's video spec, as long as replay bills a take (TAKE_SECONDS). */
const takeSpec = (prompt: string) => ({ model: "sd25", content: [{ type: "text", text: prompt }], duration: TAKE_SECONDS, ratio: "9:16", resolution: "480p", generate_audio: true, watermark: false, return_last_frame: true });
/** A story's pictures in samples.json: the first sample's by language, the others' by id. */
const pictures = (id: string, lang: Lang) => (id === Object.keys(STORIES)[0] ? lang : id);

/**
 * How long an MP4 plays, in seconds, from its movie header: duration over timescale, 32-bit fields
 * in a version 0 box and 64-bit in a version 1 (ISO/IEC 14496-12, 8.2.2, MovieHeaderBox).
 */
export function mp4Seconds(bytes: Uint8Array): number {
  const at = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).indexOf("mvhd");
  if (at < 4) throw new Error("This MP4 has no movie header (mvhd).");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const box = at + 4;
  return view.getUint8(box) === 1
    ? Number(view.getBigUint64(box + 24)) / view.getUint32(box + 20)
    : view.getUint32(box + 16) / view.getUint32(box + 12);
}

/**
 * A replayed cut's plan, in drama-cli's form (short_drama drama_cli/edit.py, `build`): each segment's
 * newest take, in order, as replay returned it. A sample drama's episode may give the real cut's in and
 * out for each segment (its data's `cut`, from the run it comes from); otherwise each take is trimmed to
 * an equal share of the cut replay returns.
 */
export function cutPlan(p: string, code: string, cut: Out, takes: { segment: string; take: string; bytes: Uint8Array }[], real?: { segment: string; in: number; out: number }[]): Out {
  const share = mp4Seconds(cut.bytes) / takes.length;
  const clips = takes.map(({ segment, take, bytes }) => {
    const known = real?.find((clip) => clip.segment === segment);
    return {
      path: `episodes/${code}/segments/${segment}/${take}/video.mp4`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      in: known ? known.in : 0,
      out: known ? known.out : share,
      audio: "source",
    };
  });
  // Replay's clips, the placeholders and the samples alike, are 24 frames a second; the size is the samples' (the studio reads only the rate).
  const output = { width: 480, height: 854, fps: 24 };
  return { path: p, type: typeOf("cut.json"), bytes: text(JSON.stringify({ schema_version: 1, episode: code, output, clips })) };
}

/** The refusals a stop asks about, one JSON line each, as drama-cli prints them (goals.ts RETURN_REFUSALS). */
const refusals = (list: Refusal[]): Out => ({ path: "handoff/refusals.jsonl", type: typeOf("refusals.jsonl"), bytes: text(list.map((error) => `${JSON.stringify({ error })}\n`).join("")) });

/** A bible range's red line, as drama-cli refuses the bible for it (stages.py, RedLine): the range from the episode it stops, six episodes. */
const redLine = (line: string, code: string): Refusal => ({
  code: "RedLine",
  message: `Bible v1 is not usable: red line: ${line}; report it to the person and pass their decision back with drama-cli bible --config drama/drama-cli.cfg.yaml --episodes ${code}-${codeOf(Number(code.slice(2)) + 4)} --feedback "<their decision>"`,
  param: null,
  action: "ask_person",
});

/** The replayed project's shoot.max_new_takes: the new takes of a segment past its first that drama-cli shoots. */
const MAX_NEW_TAKES = 2;

/**
 * The take cap's refusal, as drama-cli words it, with the code it should have (short_drama #664;
 * drama-cli v0.7.4 refuses it as a bare Refused).
 */
const takeCap = (seg: string): Refusal => ({
  code: "SetLimitExceeded.max_new_takes",
  message: `${seg} has had ${MAX_NEW_TAKES} new paid takes, the limit shoot.max_new_takes (${MAX_NEW_TAKES}); ask the person before shooting it again`,
  param: "shoot.max_new_takes",
  action: "ask_person",
});

type Lang = "zh" | "en";

/** The drama's language, from the goal's brief ("Language: Chinese."), as the real agent would read it. */
function languageOf(goal: string): Lang {
  return /summaries in Chinese/i.test(goal) ? "zh" : "en";
}

/** A word or line in both languages, as fixtures/replay/dramas.json gives it. */
type Both<T> = Record<Lang, T>;

/**
 * A sample drama as fixtures/replay/dramas.json states it: its title; its cast, the first two its
 * leads, each with its further looks; its places, each with the times of day drawn apart; its
 * props; and its episodes, each with its segments' shots. Every replayed drama plays the same
 * recording; only these and its pictures (fixtures/replay/samples/samples.json) differ.
 */
interface DramaData {
  title: Both<string>;
  /** The bible's logline. */
  logline: Both<string>;
  /** Its genres, as the brief's notes give them. */
  genres: Both<string[]>;
  /** The storyboard styles its segments are drawn in, where not both: a sample with real line-art only shows no photoreal placeholder beside it. */
  styles?: string[];
  /**
   * Each item's version in the project a sample comes from, as drama-cli numbered it (`assets/characters/natalie/states/S2`: `v3`,
   * `episodes/EP002/segments/seg01`: `t03`): replay draws an item first at that version, so its files, lineage and specs agree.
   */
  versions?: Record<string, string>;
  /**
   * Files of the sample's project that replay doesn't draw by itself (a plate's views, the first-frame references), by the stop
   * that returns them: `setup` with the shared references, an episode's code with its storyboards.
   */
  extras?: Record<string, string[]>;
  /** How many episodes a sample drama works on at once, where not New drama's 3. */
  parallel?: number;
  /** How many minutes ago a sample drama was started, so the studio's recent work shows them over hours and days. */
  ago: number;
  cast: { id: string; name: Both<string>; short: Both<string>; looks?: string[] }[];
  /** Each place and prop with its bible description (drama-cli's Bible requires one), which Story's Scenes and Props show. */
  places: { id: string; name: Both<string>; description: Both<string>; times?: string[] }[];
  props: { id: string; name: Both<string>; description: Both<string> }[];
  /** An episode's sample cut, where it has one: each clip's segment and its in and out points in seconds, from the cut.json drama-cli wrote for it. */
  /**
   * Each segment's scene heading, in the screenplay's form (INT./EXT. place - DAY/NIGHT), its shots, and the episode's sample
   * cut. boardsAfterTakes: segments whose storyboard the run redrew after their takes were shot, once a takes review
   * accepted the segment's take: a recorded event of the run's history, which leaves that take out of date by drama-cli's
   * rule (replay-lineage.ts, outOfDate).
   */
  episodes: { title: Both<string>; segments: { id: string; heading: Both<string>; shots: Both<string[]>; uses?: string[] }[]; cut?: { segment: string; in: number; out: number }[]; boardsAfterTakes?: string[] }[];
  /** A red line in the screenplay: the episode whose bible range names it stops on drama-cli's refusal (RedLine) and asks the maker. */
  redLine?: { episode: string; line: Both<string> };
  /**
   * A sample with no source project (the pro prototype's drama) has no screenplay of its own: replay writes one from its
   * episodes, their scene headings and shots (screenplayOf). A sample from a real run brings its own (samples.json).
   */
  derivedScreenplay?: boolean;
}

/** A sample drama in one language. */
interface Story {
  title: string;
  logline: string;
  genres: string[];
  styles: string[];
  parallel?: number;
  versions: Record<string, string>;
  extras: Record<string, string[]>;
  ago: number;
  cast: { id: string; name: string; short: string; looks: string[] }[];
  places: { id: string; name: string; description: string; times: string[] }[];
  props: { id: string; name: string; description: string }[];
  episodes: { title: string; segments: { id: string; heading: string; shots: string[]; uses?: string[] }[]; cut?: { segment: string; in: number; out: number }[]; boardsAfterTakes?: string[] }[];
  redLine?: { episode: string; line: string };
  derivedScreenplay?: boolean;
}

const inLanguage = (d: DramaData, lang: Lang): Story => ({
  title: d.title[lang],
  logline: d.logline[lang],
  genres: d.genres[lang],
  styles: d.styles ?? ["line-art", "photoreal"],
  ...(d.parallel ? { parallel: d.parallel } : {}),
  versions: d.versions ?? {},
  extras: d.extras ?? {},
  ago: d.ago,
  cast: d.cast.map((c) => ({ id: c.id, name: c.name[lang], short: c.short[lang], looks: c.looks ?? [] })),
  places: d.places.map((p) => ({ id: p.id, name: p.name[lang], description: p.description[lang], times: p.times ?? [] })),
  props: d.props.map((p) => ({ id: p.id, name: p.name[lang], description: p.description[lang] })),
  episodes: d.episodes.map((e) => ({ title: e.title[lang], segments: e.segments.map((s) => ({ id: s.id, heading: s.heading[lang], shots: s.shots[lang], ...(s.uses ? { uses: s.uses } : {}) })), ...(e.cut ? { cut: e.cut } : {}), ...(e.boardsAfterTakes ? { boardsAfterTakes: e.boardsAfterTakes } : {}) })),
  ...(d.redLine ? { redLine: { episode: d.redLine.episode, line: d.redLine.line[lang] } } : {}),
  ...(d.derivedScreenplay ? { derivedScreenplay: true } : {}),
});

/** The number an item is first drawn at: its version in the project the sample comes from, else 1 (v1, t01). */
const firstOf = (s: Story, path: string) => Number((s.versions[path] ?? "v1").slice(1));

/** The sample's own files a stop returns beside what replay draws (DramaData.extras), each picture with what drama-cli keeps beside it. */
const extrasOf = (s: Story, set: string, stop: string): Out[] =>
  (s.extras[stop] ?? []).flatMap((rel) => {
    const dir = `drama/${rel.slice(0, rel.lastIndexOf("/"))}`;
    return [`drama/${rel}`, `${dir}/spec.json`, `${dir}/request.json`, `${dir}/asset/asset.json`].flatMap((p) => sample(set, p) ?? []);
  });

/** An episode's code by its place in the drama, as drama-cli numbers them. */
const codeOf = (i: number) => `EP${String(i + 1).padStart(3, "0")}`;

/**
 * The shared references the setup draws after the leads, by the key the maker names each by:
 * every other character's base look, every further look, every place and its other times, and
 * every prop, each with its asset path and its placeholder.
 */
interface Shared {
  key: string;
  path: string;
  draw: (version: string) => string;
}

function sharedOf(s: Story): Shared[] {
  return [
    ...s.cast.slice(2).map((c) => ({ key: c.id, path: `assets/characters/${c.id}`, draw: (v: string) => lookSheet(c.name, "base", v) })),
    ...s.cast.flatMap((c) => c.looks.map((look) => ({ key: `${c.id}/${look}`, path: `assets/characters/${c.id}/states/${look}`, draw: (v: string) => lookSheet(c.name, look, v) }))),
    ...s.places.flatMap((place) => [
      { key: place.id, path: `assets/scenes/${place.id}`, draw: (v: string) => plate(place.id, v) },
      ...place.times.map((time) => ({ key: `${place.id}/${time}`, path: `assets/scenes/${place.id}/times/${time}`, draw: (v: string) => plate(`${place.id} ${time}`, v) })),
    ]),
    ...s.props.map((item) => ({ key: item.id, path: `assets/props/${item.id}`, draw: (v: string) => prop(item.id, v) })),
  ];
}

/** An episode's segments and their scene headings, as drama-cli's status reports them (replay-status.ts, EpisodeMade). */
const madeOf = (s: Story, e: Story["episodes"][number], code: string) => ({ segments: e.segments.map((seg) => seg.id), ...(s.versions[`episodes/${code}/breakdown`] ? { breakdown: s.versions[`episodes/${code}/breakdown`] } : {}), headings: Object.fromEntries(e.segments.map((seg) => [seg.id, seg.heading])), styles: s.styles, ...(e.segments.some((seg) => seg.uses) ? { uses: Object.fromEntries(e.segments.filter((seg) => seg.uses).map((seg) => [seg.id, seg.uses!])) } : {}) });

/** "3 looks", "1 look": a count with its noun. */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

type Say = ReturnType<typeof words>["en"];

/** What the recording says, in the drama's language, with its story's names. */
const words = (s: Story) => {
  // The leads, and how many shared references of each kind the setup draws after them.
  const [a, b] = s.cast;
  const looks = s.cast.length - 2 + s.cast.reduce((n, c) => n + c.looks.length, 0);
  const plates = s.places.reduce((n, place) => n + 1 + place.times.length, 0);
  return {
  en: {
    cast: s.cast.map((c) => ({ id: c.id, name: c.name })),
    episodes: s.episodes.map((e) => e.title),
    rewriting: ["Reading the screenplay and the notes", "Rewriting the screenplay into Fountain", "Checking the rewrite with drama-cli"],
    askRewrite: "I rewrote your screenplay into Fountain, the form drama-cli reads, and drama-cli checked it: 2 episodes, 2 scenes, ready. Its words are unchanged, but two headings changed form: drama-cli takes DAY or NIGHT, so MORNING became DAY and DUSK became NIGHT, and the title line went. Please read screenplay/v1/review.md, then accept the rewrite in your own words, or tell me what to change. Do you accept the rewrite?",
    reading: ["Checking every character's age and gender"],
    askAge: `The screenplay doesn't give ${b.name}'s age. How old is he, and should he read older than ${a.name}?`,
    drawing: ["Writing the bible", `Drawing ${a.name}'s face and base look`, `Drawing ${b.name}'s face and base look`],
    redrawLook: (name: string) => `Redrawing ${name}'s look`,
    askLooks: `The leads' looks are ready for your approval: ${a.name} and ${b.name}. The observer noted that ${b.name}'s jacket reads darker than the bible describes.`,
    askRedrawn: (names: string[]) => `I redrew ${names.join(" and ")}. Please look again.`,
    finishing: ["Recording your approval of the leads' looks", "Finishing the shared references"],
    preparing: ["Writing every episode's breakdown", "Drawing the other characters and every further look", "Drawing the location plates", "Drawing the key props", "Checking the shared references"],
    askReferences: (n: number) =>
      `Every episode is prepared: ${n} breakdowns are accepted. These shared references are ready for your approval: ${count(looks, "look")}, ${count(plates, "location plate")} and ${count(s.props.length, "prop")}.`,
    redrawReference: (key: string) => `Redrawing ${key}`,
    askReferencesAgain: (keys: string[]) => `I redrew ${keys.join(", ")}. Please look again.`,
    packing: ["Packing the project for the episodes"],
    castDone: "The cast and the shared references are approved, and the project is packed for the episodes.\n\nEpisodes:",
    restoring: (code: string) => [`Restoring the drama's project for ${code}`, "Drawing the blocking references", "Drawing the multi-panel storyboards", "Observing the storyboards"],
    askBoards: (code: string, n: number) => `${code}'s storyboards are ready for your review: ${n} segments. The observer noted that seg01 panel 4 shows a third person in the background.`,
    redrawBoard: (seg: string) => `Redrawing ${seg}'s storyboard`,
    askBoardsAgain: (segs: string[]) => `I redrew ${segs.join(", ")}. Please review the storyboards again.`,
    shooting: (segs: string[]) => ["Compiling the video prompts", ...segs.map((seg) => `Shooting ${seg}`), "Checking the takes"],
    askTakes: "Takes are in for every segment. seg02 and seg03 have dialogue the observer couldn't hear; please check them.",
    reshoot: (seg: string) => `Shooting another take of ${seg}`,
    askTakesAgain: (segs: string[]) => `New takes for ${segs.join(", ")}. Please check them.`,
    askTakeCap: (segs: string[]) =>
      `drama-cli won't shoot another take of ${segs.join(" or ")}: each has had ${MAX_NEW_TAKES} new takes, the limit shoot.max_new_takes. Shall I raise the limit for ${segs.length > 1 ? "them" : "it"}, or will you choose from the takes you have?`,
    cutting: ["Planning the cut", "Building the cut", "Checking the cut"],
    askCut: (code: string) => `The cut of ${code} is ready. Please watch it.`,
    recutting: ["Revising the cut"],
    askCutAgain: (code: string) => `I revised the cut of ${code}. Please watch it again.`,
    accepting: ["Recording your acceptance of the cut"],
    finished: (code: string) => `${code} is finished: the cut is accepted.`,
    readingMessage: ["Reading your message"],
    noted: (goal: string) => `Noted: ${goal.slice(0, 200)}`,
    title: s.title,
    logline: s.logline,
    places: Object.fromEntries(s.places.map((place) => [place.id, place.name])),
    props: Object.fromEntries(s.props.map((item) => [item.id, item.name])),
    locations: s.places.map(({ id, name, description }) => ({ id, name, description })),
    keyProps: s.props.map(({ id, name, description }) => ({ id, name, description })),
    bible: [
      `# ${s.title} — bible (placeholder)`,
      `\n${s.logline}`,
      "\n## Characters",
      ...s.cast.map((c, i) => `- **${c.name}**${i < 2 ? ", a lead" : ""}. Looks: S0 everyday${c.looks.map((look) => `, ${look}`).join("")}.`),
      "\n## Locations",
      ...s.places.map((place) => `- **${place.id}** — ${place.name}.`),
      "\n## Key props",
      ...s.props.map((item) => `- **${item.id}** — ${item.name}.`),
    ].join("\n") + "\n",
    askRedLine: (code: string, line: string) => `drama-cli won't accept ${code}'s bible range: the screenplay has a red line, ${line}. It's yours to decide: shall I write it without that, or stop here? Other episodes carry on.`,
    breakdownTitle: (code: string) => `# ${code} — breakdown (placeholder)`,
    shot: (n: number, text: string) => `- Shot ${n}: ${text}`,
  },
  zh: {
    cast: s.cast.map((c) => ({ id: c.id, name: c.name })),
    episodes: s.episodes.map((e) => e.title),
    rewriting: ["阅读剧本和备注", "把剧本改写成 Fountain", "用 drama-cli 检查改写"],
    askRewrite: "我把你的剧本改写成了 drama-cli 读的 Fountain 格式，drama-cli 检查通过：2 集、2 场，可以开始。台词和动作一字没改，但有两处场景标题改了格式：drama-cli 只认日或夜，所以“清晨”写成了日，“傍晚”写成了夜，标题行也去掉了。请看 screenplay/v1/review.md，然后用你自己的话确认改写，或者告诉我要改什么。你接受这个改写吗？",
    reading: ["核对每个角色的年龄和性别"],
    askAge: `剧本里没有写${b.name}的年龄。他多大？要不要显得比${a.name}年长？`,
    drawing: ["编写设定集", `绘制${a.name}的面部和基础造型`, `绘制${b.name}的面部和基础造型`],
    redrawLook: (name: string) => `重新绘制${name}的造型`,
    askLooks: `主角造型已完成，请审定：${a.name}和${b.name}。观察员注意到，${b.name}的外套比设定集里描述的颜色更深。`,
    askRedrawn: (names: string[]) => `我重新绘制了${names.join("和")}，请再看一下。`,
    finishing: ["记录你对主角造型的确认", "完成共用参考"],
    preparing: ["撰写每一集的拆分", "绘制其他角色和每一套造型", "绘制场景", "绘制关键道具", "检查共用参考"],
    askReferences: (n: number) => `每一集都已准备好：${n} 集拆分已确认。以下共用参考请你审定：${looks} 套造型、${plates} 个场景和 ${s.props.length} 个道具。`,
    redrawReference: (key: string) => `重画 ${key}`,
    askReferencesAgain: (keys: string[]) => `我重画了 ${keys.join("、")}，请再看一下。`,
    packing: ["打包项目，交给各集"],
    castDone: "角色与共用参考已审定，项目已打包，交给各集。\n\n分集：",
    restoring: (code: string) => [`为 ${code} 恢复剧目项目`, "绘制站位参考", "绘制多格分镜", "检查分镜"],
    askBoards: (code: string, n: number) => `${code} 的分镜已完成，请审阅：共 ${n} 段。观察员注意到，seg01 第 4 格的背景里多了一个人。`,
    redrawBoard: (seg: string) => `重画 ${seg} 的分镜`,
    askBoardsAgain: (segs: string[]) => `我重画了 ${segs.join("、")}，请再审阅一次分镜。`,
    shooting: (segs: string[]) => ["整理视频提示词", ...segs.map((seg) => `拍摄 ${seg}`), "检查镜头"],
    askTakes: "每一段的镜头都已拍好。seg02 和 seg03 有观察员听不清的台词，请你检查。",
    reshoot: (seg: string) => `重拍 ${seg}`,
    askTakesAgain: (segs: string[]) => `${segs.join("、")} 的新镜头已拍好，请检查。`,
    askTakeCap: (segs: string[]) => `drama-cli 不再给 ${segs.join("、")} 拍新镜头：每段已重拍 ${MAX_NEW_TAKES} 次，到了上限 shoot.max_new_takes。要我为它们调高上限，还是你从已有的镜头里选？`,
    cutting: ["规划剪辑", "剪辑成片", "检查成片"],
    askCut: (code: string) => `${code} 的成片已完成，请观看。`,
    recutting: ["修改成片"],
    askCutAgain: (code: string) => `我修改了 ${code} 的成片，请再看一遍。`,
    accepting: ["记录你对成片的确认"],
    finished: (code: string) => `${code} 已完成：成片已通过。`,
    readingMessage: ["阅读你的消息"],
    noted: (goal: string) => `收到：${goal.slice(0, 200)}`,
    title: s.title,
    logline: s.logline,
    places: Object.fromEntries(s.places.map((place) => [place.id, place.name])),
    props: Object.fromEntries(s.props.map((item) => [item.id, item.name])),
    locations: s.places.map(({ id, name, description }) => ({ id, name, description })),
    keyProps: s.props.map(({ id, name, description }) => ({ id, name, description })),
    bible: [
      `# ${s.title} · 设定集（示例）`,
      `\n${s.logline}`,
      "\n## 角色",
      ...s.cast.map((c, i) => `- **${c.name}**${i < 2 ? "，主角" : ""}。造型：S0 日常${c.looks.map((look) => `，${look}`).join("")}。`),
      "\n## 场景",
      ...s.places.map((place) => `- **${place.id}**：${place.name}。`),
      "\n## 关键道具",
      ...s.props.map((item) => `- **${item.id}**：${item.name}。`),
    ].join("\n") + "\n",
    askRedLine: (code: string, line: string) => `drama-cli 不接受 ${code} 这一段的设定集：剧本里有一条红线，${line}。这由你决定：我把它去掉后再写，还是就此停下？其他集照常进行。`,
    breakdownTitle: (code: string) => `# ${code} 拆分（示例）`,
    shot: (n: number, text: string) => `- 镜头 ${n}：${text}`,
  },
  };
};

/**
 * The sample dramas replay plays, by id (fixtures/replay/dramas.json); the first is the one New drama's sample starts.
 * A goal names its drama only by title (storyOf), so two samples with one title in a language would play as one: refused.
 */
export const STORIES: Record<string, Record<Lang, Story>> = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(path.join(FIXTURES, "dramas.json"), "utf8")) as Record<string, DramaData>).map(([id, d]) => [id, { en: inLanguage(d, "en"), zh: inLanguage(d, "zh") }]),
);
for (const lang of ["en", "zh"] as const) {
  const seen = new Map<string, string>();
  for (const [id, story] of Object.entries(STORIES)) {
    const other = seen.get(story[lang].title);
    if (other) throw new Error(`Replay's samples ${other} and ${id} share the ${lang} title "${story[lang].title}" (fixtures/replay/dramas.json); a goal names its drama by title, so give each its own.`);
    seen.set(story[lang].title, id);
  }
}

/** The story a goal's drama tells, by the title its brief gives (goals.ts brief: "Title: …."); the first sample's for any other. */
function storyOf(goal: string, lang: Lang): { id: string; story: Story } {
  const title = goal.match(/Title: (.+?)\.(?: |\n|$)/)?.[1];
  const found = Object.entries(STORIES).find(([, story]) => story[lang].title === title);
  const [id, story] = found ?? Object.entries(STORIES)[0];
  return { id, story: story[lang] };
}

/**
 * The bible.json a stop returns with the bible, for the names a screen reads (shared/names.ts):
 * replay keeps only those of drama-cli's Bible fields, as its bible.md is a placeholder too.
 */
const bibleJson = (say: Say, version: string): Out => ({
  path: `drama/bible/${version}/bible.json`,
  type: "application/json",
  bytes: text(
    JSON.stringify({
      title: say.title,
      logline: say.logline,
      characters: say.cast.map((c) => ({ id: c.id, name: c.name, aliases: [] })),
      locations: say.locations,
      props: say.keyProps,
      episodes: say.episodes.map((title, i) => ({ id: codeOf(i), title })),
    }),
  ),
});

/**
 * A sample's screenplay in Fountain (fountain.io/syntax), written from its own episodes: each episode a section with its title as
 * a synopsis, each run of segments under one heading a scene numbered as drama-cli numbers them (#episode-scene#), each shot an
 * action line. A heading that doesn't start with INT. or EXT. is forced with a leading period, as the zh sample's own screenplay
 * forces its Chinese headings. Only for a sample with no screenplay of its own (DramaData.derivedScreenplay): nothing is invented.
 */
export function screenplayOf(story: Story, lang: Lang): string {
  const lines: string[] = [];
  story.episodes.forEach((episode, i) => {
    lines.push(lang === "zh" ? `# 第${i + 1}集` : `# Episode ${i + 1}`, "", `= ${episode.title}`, "");
    let scene = 0;
    let heading = "";
    for (const segment of episode.segments) {
      if (segment.heading !== heading) {
        heading = segment.heading;
        scene += 1;
        lines.push(`${/^(INT|EXT)[.\s]/i.test(heading) ? "" : "."}${heading} #${i + 1}-${scene}#`, "");
      }
      for (const shot of segment.shots) lines.push(shot, "");
    }
  });
  return lines.join("\n");
}

/**
 * The sample's own screenplay as drama-cli's rewrite returns it, at version v1: the Fountain and its review where the sample has
 * them (samples.json), the one written from its episodes where it has no screenplay of its own, else none. Never another sample's.
 */
const rewriteFiles = (story: Story, set: string, lang: Lang): Out[] =>
  story.derivedScreenplay
    ? [{ path: "drama/screenplay/v1/screenplay.fountain", type: typeOf("screenplay.fountain"), bytes: text(screenplayOf(story, lang)) }]
    : ["screenplay.fountain", "review.md"].flatMap((name) => sample(set, `drama/screenplay/v1/${name}`) ?? []);

/**
 * The screenplay a sample drama starts from, as the maker would upload it: the sample's own original (samples.json,
 * inputs/screenplay), or for a sample with no screenplay of its own the one written from its episodes.
 */
export function sampleScreenplay(id: string, lang: Lang): { name: string; bytes: Uint8Array } {
  const story = STORIES[id][lang];
  if (story.derivedScreenplay) return { name: "screenplay.md", bytes: text(screenplayOf(story, lang)) };
  const own = sample(pictures(id, lang), "inputs/screenplay.md");
  if (!own) throw new Error(`Replay's sample ${id} has no screenplay of its own (fixtures/replay/samples/samples.json, inputs/screenplay).`);
  return { name: path.basename(own.path), bytes: own.bytes };
}

/**
 * The lineage a stop hands back: a sample drama's own, drama-cli's export of the project it comes from
 * (`drama-cli export comfyui`, fixtures/replay/samples/full/<id>/lineage.json) cut to what the drama has made by this
 * stop (lineageAt), else the one replay writes for its recording.
 */
const lineageOf = (set: string, progress: ReplayProgress, returned: string[]): Out => {
  const own = sample(set, "handoff/lineage.json");
  return own ? { ...own, bytes: lineageAt(progress, own.bytes) } : replayLineage(progress, returned);
};
// A sample's infinite-canvas project, as drama-cli exported it from the sample's source project (goals.ts RETURN_LINEAGE);
// none for a sample with no source project, whose lineage replay draws itself.
const canvasOf = (set: string): Out[] => {
  const zip = sample(set, "handoff/infinite-canvas.zip");
  return zip ? [zip] : [];
};

/** A part of a packed project, as the agent returns it (here a stand-in: replay has no drama-cli project). Packed again at each stop, under the same name. */
const archive = (name: string, stop = 1): Out => ({ path: `handoff/${name}.tar.part-aa`, type: "application/octet-stream", bytes: text(`replay stand-in for ${name}.tar, packed at stop ${stop}`) });

function breakdownOf(say: Say, story: Story, i: number): string {
  // A spoken line ("Wei: You're late.") is written as drama-cli writes dialogue, its words in braces
  // ("- Wei: {You're late.}"); any other shot as a numbered shot.
  const line = (shot: string, n: number) => {
    const spoken = /^([^:：{}]{1,40})[:：]\s*(.+)$/u.exec(shot);
    return spoken ? `- ${spoken[1]}: {${spoken[2]}}` : say.shot(n, shot);
  };
  return [say.breakdownTitle(codeOf(i)), ...story.episodes[i].segments.flatMap((seg) => [`\n## ${seg.id}`, ...seg.shots.map((shot, n) => line(shot, n + 1))])].join("\n");
}

/**
 * The setup and pre-production, in one session: the question, the bible and the leads (the
 * maker approves), every breakdown and the shared references (the maker approves), then the
 * project packed for the episodes.
 */
function setupScript(lang: Lang, preset: string, story: { id: string; story: Story }): Player {
  const say = words(story.story)[lang];
  const set = pictures(story.id, lang);
  let stage: "start" | "rewrite" | "asked" | "leads" | "references" | "handed" = "start";
  const versions = new Map<string, number>();
  const bible = story.story.versions.bible ?? "v1";
  const next = (key: string, path: string) => {
    const v = (versions.get(key) ?? firstOf(story.story, path) - 1) + 1;
    versions.set(key, v);
    return `v${v}`;
  };
  const leads = say.cast.slice(0, 2);
  const leadSheet = (c: { id: string; name: string }) => {
    const dir = `drama/assets/characters/${c.id}/${next(c.id, `assets/characters/${c.id}`)}`;
    return [art(set, `${dir}/image-1.svg`, lookSheet(c.name, "base", `v${versions.get(c.id)}`)), ...specs(set, dir, imageSpec(`Character reference sheet of ${c.name}: base look.`, "16:9"))];
  };
  const shared = new Map(sharedOf(story.story).map((reference) => [reference.key, reference]));
  const draw = (key: string) => {
    const reference = shared.get(key)!;
    const v = next(key, reference.path);
    const dir = `drama/${reference.path}/${v}`;
    return [art(set, `${dir}/image-1.svg`, reference.draw(v)), ...specs(set, dir, imageSpec(`Reference image of ${key}.`, reference.path.startsWith("assets/characters/") ? "16:9" : "9:16"))];
  };
  // What drama-cli's status would say at this stop: each item's version drawn, and the one the
  // maker accepted. A decision accepts every item of the review it doesn't send back.
  const accepted = new Map<string, number>();
  const decide = (keys: string[], redo: string[]) => {
    for (const key of keys) if (!redo.includes(key)) accepted.set(key, versions.get(key)!);
  };
  const made = (key: string): Made => ({ current: `v${versions.get(key)}`, accepted: accepted.has(key) ? `v${accepted.get(key)}` : null });
  const progress = (): ReplayProgress => ({
    preset,
    bible: stage === "rewrite" || stage === "asked" ? null : bible,
    looks: Object.fromEntries(leads.filter((c) => versions.has(c.id)).map((c) => [c.id, made(c.id)])),
    references: Object.fromEntries([...shared.values()].filter((reference) => versions.has(reference.key)).map((reference) => [reference.key, { ...made(reference.key), path: reference.path }])),
    episodes: stage === "references" || stage === "handed" ? Object.fromEntries(story.story.episodes.map((e, i) => [codeOf(i), madeOf(story.story, e, codeOf(i))])) : {},
  });
  const play = (answer: string): Step => {
    const redo = revisedKeys(answer);
    // The first stop: the screenplay rewritten into drama-cli's Fountain, with its review, for the maker to accept; any answer goes on.
    if (stage === "start") {
      stage = "rewrite";
      return { progress: say.rewriting, files: rewriteFiles(story.story, set, lang), ask: say.askRewrite };
    }
    if (stage === "rewrite") {
      stage = "asked";
      return { progress: say.reading, files: [], ask: say.askAge };
    }
    if (stage === "asked") {
      stage = "leads";
      return {
        progress: say.drawing,
        // The sample's own bible.json where it has one (its names, beats and episode summaries), else the one replay writes.
        files: [{ path: `drama/bible/${bible}/bible.md`, type: "text/markdown", bytes: text(say.bible) }, sample(set, `drama/bible/${bible}/bible.json`) ?? bibleJson(say, bible), ...leads.flatMap(leadSheet)],
        ask: say.askLooks,
      };
    }
    // The maker names a lead to redo by name or id; every lead not named is accepted as drawn.
    if (stage === "leads") decide(leads.filter((c) => !redo.includes(c.name)).map((c) => c.id), redo);
    if (stage === "leads" && redo.length) {
      const who = leads.filter((c) => redo.includes(c.name) || redo.includes(c.id));
      return { progress: who.map((c) => say.redrawLook(c.name)), files: who.flatMap(leadSheet), ask: say.askRedrawn(who.map((c) => c.name)) };
    }
    if (stage === "leads") {
      stage = "references";
      return {
        progress: say.preparing,
        files: [
          // Each breakdown at its version, the sample's own text where it has one (its breakdown.md), else replay's; and the
          // sample's own breakdown.json beside it, drama-cli's record the shots are read from, where its source run has one.
          ...say.episodes.flatMap((_, i) => {
            const at = `drama/episodes/${codeOf(i)}/breakdown/v${firstOf(story.story, `episodes/${codeOf(i)}/breakdown`)}/breakdown`;
            return [sample(set, `${at}.md`) ?? { path: `${at}.md`, type: "text/markdown", bytes: text(breakdownOf(say, story.story, i)) }, ...[sample(set, `${at}.json`)].filter((file) => file !== undefined)];
          }),
          ...[...shared.keys()].flatMap(draw),
          ...extrasOf(story.story, set, "setup"),
        ],
        ask: say.askReferences(say.episodes.length),
      };
    }
    decide([...shared.keys()], redo);
    if (redo.length) {
      const which = redo.filter((key) => shared.has(key));
      return { progress: which.map(say.redrawReference), files: which.flatMap(draw), ask: say.askReferencesAgain(which) };
    }
    stage = "handed";
    return {
      progress: [...say.finishing, ...say.packing],
      files: [archive("project")],
      summary: `${say.castDone}\n` + say.episodes.map((title, i) => `${codeOf(i)}: ${title}`).join("\n"),
    };
  };
  // Each stop also hands back the status and the lineage, which shows the pictures the session's stops returned.
  const returned: string[] = [];
  return (answer) => {
    const step = play(answer);
    returned.push(...step.files.map((file) => file.path));
    return { ...step, files: [...step.files, replayStatus(progress()), lineageOf(set, progress(), returned), ...canvasOf(set)] };
  };
}

export function episodeScript(code: string, lang: Lang, preset: string, story: { id: string; story: Story }): Player {
  const say = words(story.story)[lang];
  const set = pictures(story.id, lang);
  const episode = story.story.episodes[Number(code.slice(2)) - 1];
  if (!episode) throw new Error(`The sample drama ${story.story.title} has no ${code}.`);
  const segments = episode.segments;
  let stage: "boards" | "takes" | "cut" | "done" = "boards";
  // Each segment's own storyboard version and takes, and what the maker accepted of each: a
  // decision accepts every item of the review it doesn't send back.
  const at = (path: string) => firstOf(story.story, `episodes/${code}/${path}`);
  const boardVersion = new Map(segments.map((seg) => [seg.id, at(`multi_panel_storyboard/${seg.id}/${story.story.styles[0]}`)]));
  const boardAccepted = new Map<string, number>();
  const takes = new Map<string, number>();
  // The storyboard version each segment's newest take was shot from, which drama-cli's manifest pins.
  const shotFrom = new Map<string, number>();
  const takeAccepted = new Set<string>();
  const redrawn = new Set<string>();
  let cut = at("edit");
  // The cut's first version: the sample drama's own (a project's real v2), else v1.
  const firstCut = cut;
  let cutAccepted = false;
  const base = `drama/episodes/${code}`;
  const boards = (which: typeof segments) =>
    which.flatMap((seg) => {
      return story.story.styles.flatMap((style) => {
        // A style drawn at another version than the first style's keeps that difference (a photoreal redrawn on its own).
        const v = boardVersion.get(seg.id)! + at(`multi_panel_storyboard/${seg.id}/${style}`) - at(`multi_panel_storyboard/${seg.id}/${story.story.styles[0]}`);
        const dir = `${base}/multi_panel_storyboard/${seg.id}/${style}/v${v}`;
        return [
          art(set, `${dir}/image-1.svg`, storyboard(`${code} ${seg.id}`, seg.shots, style, `v${v}`, v === 1 && seg.id === "seg01" ? 3 : -1)),
          ...specs(set, dir, imageSpec(`A ${style} multi-panel storyboard of ${code} ${seg.id}: ${seg.shots.join("; ")}.`, "9:16")),
        ];
      });
    });
  // A cut as replay returns it, with its plan beside it: each segment's newest take. A recut plays the
  // episode's sample cut (its first version's) again, at its own version's path: replay has one cut of
  // each episode to show.
  const cutFiles = (version: number): Out[] => {
    const first = clip(set, `${base}/edit/v${firstCut}/cut.mp4`, "cut");
    const made = { ...first, path: first.path.replace(`/edit/v${firstCut}/`, `/edit/v${version}/`) };
    const newest = segments.map((seg) => {
      const take = `t${String(takes.get(seg.id)).padStart(2, "0")}`;
      return { segment: seg.id, take, bytes: clip(set, `${base}/segments/${seg.id}/${take}/video.mp4`, "take").bytes };
    });
    return [made, cutPlan(`${base}/edit/v${version}/cut.json`, code, made, newest, episode.cut)];
  };
  const shoot = (which: typeof segments) =>
    which.flatMap((seg) => {
      takes.set(seg.id, (takes.get(seg.id) ?? at(`segments/${seg.id}`) - 1) + 1);
      shotFrom.set(seg.id, boardVersion.get(seg.id)!);
      const dir = `${base}/segments/${seg.id}/t${String(takes.get(seg.id)).padStart(2, "0")}`;
      // The still drama-cli saves of the take's last frame, where the sample has one (classify.ts, last-frame).
      const still = sample(set, `${dir}/last_frame.jpg`);
      return [clip(set, `${dir}/video.mp4`, "take"), ...(still ? [still] : []), ...specs(set, dir, takeSpec(seg.shots.join(" ")))];
    });
  let started = false;
  // An episode whose bible range names the screenplay's red line stops first on drama-cli's refusal, and asks the maker; their answer is passed back.
  let redLineAsked = story.story.redLine?.episode !== code;
  // The recording's late redraw (DramaData, boardsAfterTakes): once a takes review accepts such a segment's take, its
  // storyboard is drawn again and accepted, after the take was shot from the earlier version.
  const play = (answer: string): Step => {
    const sentBack = revisedKeys(answer);
    const late = stage === "takes" ? segments.filter((seg) => episode.boardsAfterTakes?.includes(seg.id) && !redrawn.has(seg.id) && takes.has(seg.id) && !sentBack.includes(seg.id)) : [];
    for (const seg of late) {
      redrawn.add(seg.id);
      boardVersion.set(seg.id, boardVersion.get(seg.id)! + 1);
      boardAccepted.set(seg.id, boardVersion.get(seg.id)!);
    }
    const step = act(answer);
    return late.length ? { ...step, progress: [...late.map((seg) => say.redrawBoard(seg.id)), ...step.progress], files: [...boards(late), ...step.files] } : step;
  };
  const act = (answer: string): Step => {
    const redo = revisedKeys(answer);
    if (!redLineAsked) {
      redLineAsked = true;
      const { line } = story.story.redLine!;
      return { progress: say.drawing.slice(0, 1), files: [refusals([redLine(line, code)])], ask: say.askRedLine(code, line) };
    }
    if (!started) {
      started = true;
      return {
        progress: say.restoring(code),
        files: [
          ...segments.flatMap((seg) => {
            const v = `v${at(`blocking/${seg.id}`)}`;
            return [art(set, `${base}/blocking/${seg.id}/${v}/image-1.svg`, blocking(`${code} ${seg.id}`, v)), ...specs(set, `${base}/blocking/${seg.id}/${v}`, imageSpec(`A line-art blocking diagram of ${code} ${seg.id}.`, "9:16"))];
          }),
          ...boards(segments),
          ...extrasOf(story.story, set, code),
        ],
        ask: say.askBoards(code, segments.length),
      };
    }
    if (stage === "boards") for (const seg of segments) if (!redo.includes(seg.id)) boardAccepted.set(seg.id, boardVersion.get(seg.id)!);
    if (stage === "takes") for (const seg of segments) if (!redo.includes(seg.id)) takeAccepted.add(seg.id);
    if (stage === "boards" && redo.length) {
      const which = segments.filter((seg) => redo.includes(seg.id));
      for (const seg of which) boardVersion.set(seg.id, boardVersion.get(seg.id)! + 1);
      return { progress: which.map((seg) => say.redrawBoard(seg.id)), files: boards(which), ask: say.askBoardsAgain(which.map((seg) => seg.id)) };
    }
    if (stage === "boards") {
      stage = "takes";
      return { progress: say.shooting(segments.map((seg) => seg.id)), files: shoot(segments), ask: say.askTakes };
    }
    if (stage === "takes" && redo.length) {
      const which = segments.filter((seg) => redo.includes(seg.id));
      // As drama-cli's take cap does, past the limit nothing is shot: the agent asks the maker, returning the refusal.
      const capped = which.filter((seg) => takes.get(seg.id)! > MAX_NEW_TAKES);
      if (capped.length) return { progress: [], files: [refusals(capped.map((seg) => takeCap(seg.id)))], ask: say.askTakeCap(capped.map((seg) => seg.id)) };
      return { progress: redo.map(say.reshoot), files: shoot(which), ask: say.askTakesAgain(redo) };
    }
    if (stage === "takes") {
      stage = "cut";
      return { progress: say.cutting, files: cutFiles(cut), ask: say.askCut(code) };
    }
    if (stage === "cut" && redo.length) {
      cut += 1;
      return { progress: say.recutting, files: cutFiles(cut), ask: say.askCutAgain(code) };
    }
    stage = "done";
    cutAccepted = true;
    // As Pine's agent does, the finished episode hands back its accepted cut again, unchanged.
    return { progress: say.accepting, files: cutFiles(cut), summary: say.finished(code) };
  };
  // What drama-cli's status would say at this stop: the project as handed over, every shared
  // reference approved, and this episode's items as far as the maker has accepted each.
  const progress = (): ReplayProgress => {
    const ids = segments.map((seg) => seg.id);
    const own: EpisodeMade = {
      ...madeOf(story.story, episode, code),
      boards: Object.fromEntries(ids.map((id) => [id, { current: `v${boardVersion.get(id)}`, accepted: boardAccepted.has(id) ? `v${boardAccepted.get(id)}` : null }])),
    };
    if (takes.size) own.takes = Object.fromEntries([...takes].map(([id, count]) => [id, { count, accepted: takeAccepted.has(id), board: `v${shotFrom.get(id)}` }]));
    if (stage === "cut" || stage === "done") own.cut = { current: `v${cut}`, accepted: cutAccepted ? `v${cut}` : null };
    const accepted = (path: string): Made => ({ current: `v${firstOf(story.story, path)}`, accepted: `v${firstOf(story.story, path)}` });
    return {
      preset,
      bible: story.story.versions.bible ?? "v1",
      // Every reference approved at the version it was first drawn at (firstOf), as the setup left it.
      looks: Object.fromEntries(say.cast.slice(0, 2).map((c) => [c.id, accepted(`assets/characters/${c.id}`)])),
      references: Object.fromEntries(sharedOf(story.story).map((reference) => [reference.key, { ...accepted(reference.path), path: reference.path }])),
      episodes: Object.fromEntries(story.story.episodes.map((e, i) => [codeOf(i), codeOf(i) === code ? own : madeOf(story.story, e, codeOf(i))])),
    };
  };
  // Each stop and the finish also hand back the episode's own folder, packed, the status and the lineage.
  let stops = 0;
  const returned: string[] = [];
  return (answer) => {
    const step = play(answer);
    stops += 1;
    returned.push(...step.files.map((file) => file.path));
    return { ...step, files: [...step.files, archive(code, stops), replayStatus(progress()), lineageOf(set, progress(), returned), ...canvasOf(set)] };
  };
}

/**
 * A message to the setup's scope after the handover (goals.ts, setupMessageGoal; D71). Replay doesn't read what the maker
 * wrote: the session notes the message, packs the project as it was handed over and hands it back.
 */
function setupMessageScript(goal: string, lang: Lang, preset: string, story: { id: string; story: Story }): Player {
  const say = words(story.story)[lang];
  const set = pictures(story.id, lang);
  const at = (path: string): Made => ({ current: `v${firstOf(story.story, path)}`, accepted: `v${firstOf(story.story, path)}` });
  const progress = (): ReplayProgress => ({
    preset,
    bible: story.story.versions.bible ?? "v1",
    looks: Object.fromEntries(story.story.cast.slice(0, 2).map((c) => [c.id, at(`assets/characters/${c.id}`)])),
    references: Object.fromEntries(sharedOf(story.story).map((reference) => [reference.key, { ...at(reference.path), path: reference.path }])),
    episodes: Object.fromEntries(story.story.episodes.map((e, i) => [codeOf(i), madeOf(story.story, e, codeOf(i))])),
  });
  const message = goal.split("My message:\n")[1]?.split("\n")[0] ?? "";
  return () => {
    const files = [archive("project")];
    return { progress: [...say.readingMessage, ...say.packing], files: [...files, replayStatus(progress()), lineageOf(set, progress(), files.map((file) => file.path))], summary: say.noted(message) };
  };
}

/**
 * A message to an episode whose session ended (goals.ts, episodeMessageGoal; D71). Replay doesn't read what the maker
 * wrote: the session notes the message and hands the episode's folder back as it was, packed.
 */
function episodeMessageScript(goal: string, code: string, lang: Lang, preset: string, story: { id: string; story: Story }): Player {
  const say = words(story.story)[lang];
  const set = pictures(story.id, lang);
  const at = (path: string): Made => ({ current: `v${firstOf(story.story, path)}`, accepted: `v${firstOf(story.story, path)}` });
  const progress = (): ReplayProgress => ({
    preset,
    bible: story.story.versions.bible ?? "v1",
    looks: Object.fromEntries(story.story.cast.slice(0, 2).map((c) => [c.id, at(`assets/characters/${c.id}`)])),
    references: Object.fromEntries(sharedOf(story.story).map((reference) => [reference.key, { ...at(reference.path), path: reference.path }])),
    episodes: Object.fromEntries(story.story.episodes.map((e, i) => [codeOf(i), madeOf(story.story, e, codeOf(i))])),
  });
  const message = goal.split("My message:\n")[1]?.split("\n")[0] ?? "";
  return () => {
    const files = [archive(code)];
    return { progress: [...say.readingMessage, ...say.packing], files: [...files, replayStatus(progress()), lineageOf(set, progress(), files.map((file) => file.path))], summary: say.noted(message) };
  };
}

function chatScript(goal: string, lang: Lang): Player {
  const say = words(Object.values(STORIES)[0][lang])[lang];
  return () => ({ progress: say.readingMessage, files: [], summary: say.noted(goal) });
}

/** The recording a run's goal starts; a session keeps the language its first goal set. */
function scriptFor(goal: string, lang: Lang): Player {
  const episode = goal.match(/\b(EP\d{3})\b/);
  // The preset the goal's drama-cli init names, as the report says it.
  const preset = goal.match(/--preset (\S+)/)?.[1] ?? "";
  const story = storyOf(goal, lang);
  if (/I have a message about it\./.test(goal) && episode) return episodeMessageScript(goal, episode[1], lang, preset, story);
  if (/make episode|continue episode/i.test(goal) && episode) return episodeScript(episode[1], lang, preset, story);
  if (/vertical short drama from my screenplay/i.test(goal)) return setupScript(lang, preset, story);
  if (/I have a message about the drama's script, bible or shared references/.test(goal)) return setupMessageScript(goal, lang, preset, story);
  return chatScript(goal, lang);
}

/** A decision on a stop that ended its turn, sent as a run (goals.ts, decisionGoal): the recording goes on. */
const isDecision = (goal: string) => /from there as the goal says/.test(goal);

/** What a replayed take is billed as: four seconds at Pine's 480p video rate. */
const TAKE_SECONDS = 4;
const VIDEO_PER_MINUTE = 39;

export class ReplayFleet implements Fleet {
  readonly mode = "replay" as const;
  readonly project = "replay";
  /**
   * How the recorded agent stops for the maker: with a question that returns its files ("ask");
   * with one that only names them ("name"), or that doesn't mention them ("bare"); or by ending
   * its turn with the files and its question in the summary ("finish"). Pine's agent has been
   * seen doing each of the last three.
   */
  stops: "ask" | "name" | "bare" | "finish" = "ask";
  private readonly machines = new Map<string, Machine>();
  private counter = 0;

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms / SPEED));
  }

  private machine(ref: ComputerRef): Machine {
    const found = this.machines.get(ref.id);
    if (!found || found.state !== "running") throw Object.assign(new Error("This Computer isn't running."), { status: 404 });
    return found;
  }

  private session(ref: ComputerRef, session: SessionRef): Session {
    const found = this.machine(ref).sessions.get(session.name);
    if (!found || found.token !== session.token) throw Object.assign(new Error("No such session."), { status: 404 });
    return found;
  }

  async limits(): Promise<Limits> {
    return { maxComputers: null, maxIdleSeconds: null, idleAdjustable: true, maxRuntimeSeconds: null };
  }

  async newCredentials() {
    const id = `replay-${crypto.randomUUID().slice(0, 8)}`;
    return { id, credentials: JSON.stringify({ id }) };
  }

  async createComputer(credentials: string): Promise<Attached> {
    return this.startComputer(credentials);
  }

  async startComputer(credentials: string): Promise<Attached> {
    await this.delay(900);
    const { id } = JSON.parse(credentials) as { id: string };
    this.machines.set(id, { state: "running", sessions: new Map() });
    return { binding: JSON.stringify({ id, at: Date.now() }), revision: String(Date.now()) };
  }

  async status(ref: ComputerRef) {
    return this.machines.get(ref.id)?.state ?? "stopped";
  }

  async stopBy(): Promise<Date | undefined> {
    return undefined;
  }

  async skills() {
    return [DRAMA_SKILL];
  }

  async setIdleTimeout(_ref: ComputerRef, seconds: number) {
    return seconds;
  }

  async stop(ref: ComputerRef) {
    this.machines.delete(ref.id);
    return true;
  }

  async createSession(ref: ComputerRef) {
    const machine = this.machine(ref);
    const name = `session-${(this.counter += 1)}`;
    machine.sessions.set(name, { name, token: `ps_${crypto.randomUUID()}`, taskId: `task-${name}`, turns: new Map(), keys: new Map(), events: [], files: new Map() });
    const created = machine.sessions.get(name)!;
    return { name, token: created.token };
  }

  async closeSession(ref: ComputerRef, name: string) {
    this.machines.get(ref.id)?.sessions.delete(name);
  }

  async writeFile(ref: ComputerRef, session: SessionRef, name: string, content: Uint8Array) {
    this.session(ref, session).files.set(`attachments/${name}`, { path: `attachments/${name}`, type: "application/octet-stream", bytes: content });
  }

  private emit(session: Session, turnId: string, kind: FleetEvent["kind"], textValue: string, ref?: string, state?: string, cost?: Pick<TurnInfo, "cost" | "media">) {
    session.events.push({ id: String(session.events.length + 1), taskId: session.taskId, turnId, kind, text: textValue, ref, state, ...cost });
  }

  private begin(session: Session, answer: string): TurnInfo {
    const turnId = `turn-${crypto.randomUUID().slice(0, 12)}`;
    const info: TurnInfo = { turnId, state: "running", question: "", summary: "", nextTurnId: "", files: [], cost: null, media: null };
    session.turns.set(turnId, { info, waiters: [] });
    session.latest = turnId;
    void this.play(session, turnId, answer);
    return { ...info };
  }

  private async play(session: Session, turnId: string, answer: string) {
    const step = session.play!(answer);
    for (const [i, line] of step.progress.entries()) {
      await this.delay(700 + Math.random() * 600);
      this.emit(session, turnId, "progress", line);
      this.emit(session, turnId, "activity", line, `${turnId}-${i}`, "completed");
    }
    const files: TurnFile[] = step.files.map((file) => {
      session.files.set(file.path, file);
      return { path: file.path, size: file.bytes.length, sha256: "", type: file.type };
    });
    const turn = session.turns.get(turnId)!;
    const asks = step.ask !== undefined && this.stops !== "finish";
    // Asked without returning its files: the question names them instead, or doesn't even do that.
    const named = step.ask !== undefined && this.stops === "name";
    const bare = step.ask !== undefined && this.stops === "bare";
    const ask = named ? [step.ask, ...files.map((file) => `- [${file.path.split("/").pop()}](${file.path})`)].join("\n") : step.ask;
    turn.info = {
      ...turn.info,
      state: asks ? "needs_input" : "completed",
      question: asks ? ask! : "",
      summary: ask ?? step.summary ?? "",
      files: named || bare ? [] : files,
      cost: Math.round((0.15 + Math.random() * 0.4) * 100) / 100,
      media: 0,
    };
    this.emit(session, turnId, "result", turn.info.summary);
    for (const wake of turn.waiters.splice(0)) wake();
    // Each take is a few seconds of generated video, billed as it settles, after the turn's result.
    const takes = files.filter((file) => /\/segments\/seg\d+\/t\d+\/[^/]+\.mp4$/.test(file.path)).length;
    if (takes) {
      await this.delay(1_500);
      const media = Math.round(takes * TAKE_SECONDS * (VIDEO_PER_MINUTE / 60) * 100) / 100;
      turn.info = { ...turn.info, cost: Math.round((turn.info.cost! + media) * 100) / 100, media };
      this.emit(session, turnId, "usage", "", undefined, undefined, { cost: turn.info.cost, media });
    }
  }

  async run(ref: ComputerRef, session: SessionRef, goal: string, key: string) {
    const found = this.session(ref, session);
    const known = found.keys.get(key);
    if (known) return { ...found.turns.get(known)!.info };
    const latest = found.latest && found.turns.get(found.latest);
    if (latest && latest.info.state === "running") throw Object.assign(new Error("The session is busy."), { status: 409 });
    found.lang ??= languageOf(goal);
    const decision = isDecision(goal) && found.play !== undefined;
    if (!decision) found.play = scriptFor(goal, found.lang);
    const info = this.begin(found, decision ? goal : "");
    found.keys.set(key, info.turnId);
    this.emit(found, info.turnId, "input", goal);
    return info;
  }

  async wait(ref: ComputerRef, session: SessionRef, turnId: string, timeoutMs: number) {
    const found = this.session(ref, session);
    const turn = found.turns.get(turnId);
    if (!turn) throw Object.assign(new Error("No such turn."), { status: 404 });
    if (turn.info.state === "running") {
      await Promise.race([new Promise<void>((resolve) => turn.waiters.push(resolve)), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
    }
    return { ...turn.info };
  }

  async answer(ref: ComputerRef, session: SessionRef, turnId: string, textValue: string) {
    const found = this.session(ref, session);
    const turn = found.turns.get(turnId);
    if (!turn) throw Object.assign(new Error("No such turn."), { status: 404 });
    if (turn.info.state === "answered") return { ...found.turns.get(turn.info.nextTurnId)!.info };
    if (turn.info.state !== "needs_input" || found.latest !== turnId) throw Object.assign(new Error("This turn can't be answered."), { status: 409 });
    const next = this.begin(found, textValue);
    turn.info = { ...turn.info, state: "answered", nextTurnId: next.turnId };
    this.emit(found, next.turnId, "input", textValue);
    return next;
  }

  async steer(ref: ComputerRef, session: SessionRef, turnId: string, textValue: string) {
    this.emit(this.session(ref, session), turnId, "input", textValue);
  }

  async listFiles(ref: ComputerRef, session: SessionRef, folder: string) {
    const prefix = folder.replace(/\/$/, "") + "/";
    const level = new Map<string, { path: string; folder: boolean; size: number }>();
    for (const file of this.session(ref, session).files.values()) {
      if (!file.path.startsWith(prefix)) continue;
      const [name, ...rest] = file.path.slice(prefix.length).split("/");
      level.set(name, rest.length ? { path: prefix + name, folder: true, size: 0 } : { path: file.path, folder: false, size: file.bytes.length });
    }
    return [...level.values()];
  }

  async openFile(ref: ComputerRef, session: SessionRef, filePath: string) {
    const file = this.session(ref, session).files.get(filePath);
    if (!file) throw Object.assign(new Error("No such file."), { status: 404 });
    return new Blob([new Uint8Array(file.bytes)]).stream();
  }

  async *events(ref: ComputerRef, session: SessionRef, after: string | undefined, _taskId: string | undefined, signal: AbortSignal): AsyncIterable<FleetEvent> {
    let next = Number(after ?? 0);
    while (!signal.aborted) {
      const found = this.machines.get(ref.id)?.sessions.get(session.name);
      if (!found) return;
      while (next < found.events.length) yield found.events[next++];
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async desktop() {
    return null;
  }
}
