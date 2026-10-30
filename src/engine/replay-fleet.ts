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
import { replayLineage } from "./replay-lineage.ts";
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
 * newest take, in order, as replay returned it, each trimmed to an equal share of the cut replay returns.
 */
export function cutPlan(p: string, code: string, cut: Out, takes: { segment: string; take: string; bytes: Uint8Array }[]): Out {
  const share = mp4Seconds(cut.bytes) / takes.length;
  const clips = takes.map(({ segment, take, bytes }) => ({
    path: `episodes/${code}/segments/${segment}/${take}/video.mp4`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    in: 0,
    out: share,
    audio: "source",
  }));
  // Replay's clips, the placeholders and the samples alike, are 24 frames a second; the size is the samples' (the studio reads only the rate).
  const output = { width: 480, height: 854, fps: 24 };
  return { path: p, type: typeOf("cut.json"), bytes: text(JSON.stringify({ schema_version: 1, episode: code, output, clips })) };
}

/** The refusals a stop asks about, one JSON line each, as drama-cli prints them (goals.ts RETURN_REFUSALS). */
const refusals = (list: Refusal[]): Out => ({ path: "handoff/refusals.jsonl", type: typeOf("refusals.jsonl"), bytes: text(list.map((error) => `${JSON.stringify({ error })}\n`).join("")) });

/** The bible's red line, as drama-cli refuses a bible for one (stages.py, RedLine; drama-cli v0.7.4). */
const redLine = (line: string): Refusal => ({
  code: "RedLine",
  message: `Bible v1 is not usable: red line: ${line}; report it to the person and pass their decision back with drama-cli bible --config drama/drama-cli.cfg.yaml --episodes EP001-EP006 --feedback "<their decision>"`,
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

/** Everything the recorded agent says, in both languages. */
/**
 * A replayed drama's own names: its title, its two leads (a has the wedding look), its two places
 * and its prop, and its episodes' titles. Every replayed drama plays the same recording; only
 * these and its pictures differ (STORIES; fixtures/replay/samples/samples.json).
 */
interface Story {
  title: string;
  a: { name: string; short: string };
  b: { name: string; short: string };
  places: { home: string; office: string };
  prop: string;
  episodes: string[];
  /** The bible's red line, when the setup stops on one: drama-cli refuses the bible for it (RedLine). */
  redLine?: string;
}

type Say = ReturnType<typeof words>["en"];

/** What the recording says, in the drama's language, with its story's names. */
const words = (s: Story) => ({
  en: {
    cast: [
      { id: "lin", name: s.a.name },
      { id: "wei", name: s.b.name },
    ],
    shots: [
      [`${s.a.short} enters the yard`, `${s.b.short}: You're late.`, `${s.a.short} hides the ${s.prop.toLowerCase()}`, `Close on the ${s.prop.toLowerCase()}`, `${s.b.short} turns away`, `${s.a.short} alone`],
      ["The family at dinner", "Mother: Eat.", `${s.a.short} watches ${s.b.short}`, `${s.b.short} pushes the bowl away`],
      ["Night, the yard", `${s.a.short} reads the ${s.prop.toLowerCase()}`, `${s.b.short} at the window`, "Their eyes meet", `${s.a.short} burns the ${s.prop.toLowerCase()}`],
    ],
    episodes: s.episodes,
    reading: ["Reading the screenplay and the notes", "Checking every character's age and gender"],
    askAge: `The screenplay doesn't give ${s.b.name}'s age. How old is he, and should he read older than ${s.a.name}?`,
    drawing: ["Writing the bible", `Drawing ${s.a.name}'s face and base look`, `Drawing ${s.b.name}'s face and base look`],
    redrawLook: (name: string) => `Redrawing ${name}'s look`,
    askLooks: `The leads' looks are ready for your approval: ${s.a.name} and ${s.b.name}. The observer noted that ${s.b.name}'s jacket reads darker than the bible describes.`,
    askRedrawn: (names: string[]) => `I redrew ${names.join(" and ")}. Please look again.`,
    finishing: ["Recording your approval of the leads' looks", "Finishing the shared references"],
    preparing: ["Writing every episode's breakdown", `Drawing ${s.a.name}'s wedding look`, "Drawing the location plates", "Drawing the key prop", "Checking the shared references"],
    askReferences: (n: number) =>
      `Every episode is prepared: ${n} breakdowns are accepted. These shared references are ready for your approval: ${s.a.name}'s wedding look, two locations and the ${s.prop.toLowerCase()}.`,
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
    places: s.places,
    props: { letter: s.prop },
    bible: `# ${s.title} — bible (placeholder)

## Characters
- **${s.a.name}**, 26, female — the lead. Looks: S0 everyday, S1 wedding.
- **${s.b.name}**, 32, male — the second lead. Looks: S0 everyday.

## Locations
- **home** — ${s.places.home}.
- **office** — ${s.places.office}.

## Key props
- **letter** — ${s.prop}.
`,
    askRedLine: (line: string) => `drama-cli won't accept the bible: the screenplay has a red line, ${line}. It's yours to decide: shall I write the bible without it, or stop here?`,
    breakdownTitle: (code: string) => `# ${code} — breakdown (placeholder)`,
    shot: (n: number, text: string) => `- Shot ${n}: ${text}`,
  },
  zh: {
    cast: [
      { id: "lin", name: s.a.name },
      { id: "wei", name: s.b.name },
    ],
    shots: [
      [`${s.a.name}走进院子`, `${s.b.name}：你来晚了。`, `${s.a.name}藏起${s.prop}`, `特写：${s.prop}`, `${s.b.name}转身离开`, `${s.a.name}独自站着`],
      ["一家人吃晚饭", "母亲：吃饭。", `${s.a.name}看着${s.b.name}`, `${s.b.name}推开饭碗`],
      ["夜，院子里", `${s.a.name}看着${s.prop}`, `${s.b.name}站在窗边`, "两人对视", `${s.a.name}烧掉${s.prop}`],
    ],
    episodes: s.episodes,
    reading: ["阅读剧本和备注", "核对每个角色的年龄和性别"],
    askAge: `剧本里没有写${s.b.name}的年龄。他多大？要不要显得比${s.a.name}年长？`,
    drawing: ["编写设定集", `绘制${s.a.name}的面部和基础造型`, `绘制${s.b.name}的面部和基础造型`],
    redrawLook: (name: string) => `重新绘制${name}的造型`,
    askLooks: `主角造型已完成，请审定：${s.a.name}和${s.b.name}。观察员注意到，${s.b.name}的外套比设定集里描述的颜色更深。`,
    askRedrawn: (names: string[]) => `我重新绘制了${names.join("和")}，请再看一下。`,
    finishing: ["记录你对主角造型的确认", "完成共用参考"],
    preparing: ["撰写每一集的拆分", `绘制${s.a.name}的婚礼造型`, "绘制场景", "绘制关键道具", "检查共用参考"],
    askReferences: (n: number) => `每一集都已准备好：${n} 集拆分已确认。以下共用参考请你审定：${s.a.name}的婚礼造型、两个场景和${s.prop}。`,
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
    places: s.places,
    props: { letter: s.prop },
    bible: `# ${s.title} · 设定集（示例）

## 角色
- **${s.a.name}**，26 岁，女，主角。造型：S0 日常，S1 婚礼。
- **${s.b.name}**，32 岁，男，第二主角。造型：S0 日常。

## 场景
- **home**：${s.places.home}。
- **office**：${s.places.office}。

## 关键道具
- **letter**：${s.prop}。
`,
    askRedLine: (line: string) => `drama-cli 不接受这版设定集：剧本里有一条红线，${line}。这由你决定：我把它去掉后再写设定集，还是就此停下？`,
    breakdownTitle: (code: string) => `# ${code} 拆分（示例）`,
    shot: (n: number, text: string) => `- 镜头 ${n}：${text}`,
  },
});

/** The sample dramas replay plays, by id; the first is the one New drama's sample starts. Names are invented. */
export const STORIES: Record<string, Record<Lang, Story>> = {
  stepmother: {
    en: { title: "The Stepmother", a: { name: "Lin Xiaoyu", short: "Lin" }, b: { name: "Wei Zhen", short: "Wei" }, places: { home: "Courtyard house", office: "Factory office" }, prop: "Torn letter", episodes: ["The stepmother arrives", "The letter", "Dinner", "The wedding dress", "Night market", "The truth"] },
    zh: { title: "后妈来了", a: { name: "林晓雨", short: "林晓雨" }, b: { name: "魏振", short: "魏振" }, places: { home: "四合院", office: "工厂办公室" }, prop: "撕破的信", episodes: ["后妈进门", "一封信", "晚饭", "嫁衣", "夜市", "真相"] },
  },
  "night-class": {
    en: { title: "Night Class", a: { name: "Tang Wen", short: "Tang" }, b: { name: "Bao Jun", short: "Bao" }, places: { home: "Teachers' office", office: "Evening classroom" }, prop: "Exam paper", episodes: ["First night", "The roll call", "Chalk dust", "The exam", "After class", "Graduation"] },
    zh: { title: "夜校", a: { name: "唐雯", short: "唐雯" }, b: { name: "鲍军", short: "鲍军" }, places: { home: "教师办公室", office: "夜间教室" }, prop: "试卷", episodes: ["第一夜", "点名", "粉笔灰", "考试", "下课后", "毕业"] },
  },
  "corner-office": {
    en: { title: "Corner Office", a: { name: "Vivian Shen", short: "Vivian" }, b: { name: "Leo Lu", short: "Leo" }, places: { home: "The corner office", office: "Board room" }, prop: "Signed contract", episodes: ["Day one", "The pitch", "Overtime", "The board", "The leak", "Promotion"] },
    zh: { title: "顶层办公室", a: { name: "沈薇", short: "沈薇" }, b: { name: "陆屿", short: "陆屿" }, places: { home: "顶层办公室", office: "会议室" }, prop: "签好的合同", episodes: ["第一天", "提案", "加班", "董事会", "泄密", "升职"] },
  },
  "bride-on-bail": {
    en: { title: "Bride on Bail", a: { name: "Ivy Bell", short: "Ivy" }, b: { name: "Luca Moreno", short: "Luca" }, places: { home: "Garden wedding", office: "Holding cell" }, prop: "Bail papers", episodes: ["The arrest", "The ring", "Bail", "The rehearsal", "The vows", "The verdict"], redLine: "instructions someone could follow to make a weapon (EP003, scene 2)" },
    zh: { title: "保释新娘", a: { name: "艾薇", short: "艾薇" }, b: { name: "卢卡", short: "卢卡" }, places: { home: "花园婚礼", office: "拘留室" }, prop: "保释文件", episodes: ["被捕", "戒指", "保释", "彩排", "誓言", "判决"], redLine: "可以照着做出武器的步骤（第 3 集第 2 场）" },
  },
};

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
const bibleJson = (say: Say): Out => ({
  path: "drama/bible/v1/bible.json",
  type: "application/json",
  bytes: text(
    JSON.stringify({
      title: say.title,
      characters: say.cast.map((c) => ({ id: c.id, name: c.name, aliases: [] })),
      locations: Object.entries(say.places).map(([id, name]) => ({ id, name })),
      props: Object.entries(say.props).map(([id, name]) => ({ id, name })),
      episodes: say.episodes.map((title, i) => ({ id: `EP00${i + 1}`, title })),
    }),
  ),
});

/** A part of a packed project, as the agent returns it (here a stand-in: replay has no drama-cli project). Packed again at each stop, under the same name. */
const archive = (name: string, stop = 1): Out => ({ path: `handoff/${name}.tar.part-aa`, type: "application/octet-stream", bytes: text(`replay stand-in for ${name}.tar, packed at stop ${stop}`) });

const segmentsOf = (say: Say) => say.shots.map((shots, i) => ({ id: `seg0${i + 1}`, shots }));

function breakdownOf(say: Say, code: string): string {
  return [say.breakdownTitle(code), ...segmentsOf(say).flatMap((seg) => [`\n## ${seg.id}`, ...seg.shots.map((shot, i) => say.shot(i + 1, shot))])].join("\n");
}

/**
 * The setup and pre-production, in one session: the question, the bible and the leads (the
 * maker approves), every breakdown and the shared references (the maker approves), then the
 * project packed for the episodes.
 */
function setupScript(lang: Lang, preset: string, story: { id: string; story: Story }): Player {
  const say = words(story.story)[lang];
  const set = pictures(story.id, lang);
  let stage: "start" | "asked" | "red-line" | "leads" | "references" | "handed" = "start";
  const versions = new Map<string, number>();
  const next = (key: string) => {
    const v = (versions.get(key) ?? 0) + 1;
    versions.set(key, v);
    return `v${v}`;
  };
  const leadSheet = (c: { id: string; name: string }) => art(set, `drama/assets/characters/${c.id}/${next(c.id)}/image-1.svg`, lookSheet(c.name, "base", `v${versions.get(c.id)}`));
  const shared = {
    "lin/S1": () => art(set, `drama/assets/characters/lin/states/S1/${next("lin/S1")}/image-1.svg`, lookSheet(say.cast[0].name, "S1", `v${versions.get("lin/S1")}`)),
    home: () => art(set, `drama/assets/scenes/home/${next("home")}/image-1.svg`, plate("home", `v${versions.get("home")}`)),
    office: () => art(set, `drama/assets/scenes/office/${next("office")}/image-1.svg`, plate("office", `v${versions.get("office")}`)),
    letter: () => art(set, `drama/assets/props/letter/${next("letter")}/image-1.svg`, prop("letter", `v${versions.get("letter")}`)),
  } as Record<string, () => Out>;
  // What drama-cli's status would say at this stop: each item's version drawn, and the one the
  // maker accepted. A decision accepts every item of the review it doesn't send back.
  const accepted = new Map<string, number>();
  const decide = (keys: string[], redo: string[]) => {
    for (const key of keys) if (!redo.includes(key)) accepted.set(key, versions.get(key)!);
  };
  const made = (key: string): Made => ({ current: `v${versions.get(key)}`, accepted: accepted.has(key) ? `v${accepted.get(key)}` : null });
  const progress = (): ReplayProgress => ({
    preset,
    bible: stage === "asked" || stage === "red-line" ? null : "v1",
    looks: Object.fromEntries(say.cast.filter((c) => versions.has(c.id)).map((c) => [c.id, made(c.id)])),
    references: Object.fromEntries(Object.keys(shared).filter((key) => versions.has(key)).map((key) => [key, made(key)])),
    episodes: stage === "references" || stage === "handed" ? Object.fromEntries(say.episodes.map((_, i) => [`EP00${i + 1}`, { segments: segmentsOf(say).map((seg) => seg.id) }])) : {},
  });
  const play = (answer: string): Step => {
    const redo = revisedKeys(answer);
    if (stage === "start") {
      stage = "asked";
      return { progress: say.reading, files: [], ask: say.askAge };
    }
    // A story with a red line stops here, as drama-cli refuses the bible for it, and asks the maker; their answer is passed back.
    if (stage === "asked" && story.story.redLine) {
      stage = "red-line";
      return { progress: say.drawing.slice(0, 1), files: [refusals([redLine(story.story.redLine)])], ask: say.askRedLine(story.story.redLine) };
    }
    if (stage === "asked" || stage === "red-line") {
      stage = "leads";
      return {
        progress: say.drawing,
        files: [{ path: "drama/bible/v1/bible.md", type: "text/markdown", bytes: text(say.bible) }, bibleJson(say), ...say.cast.map(leadSheet)],
        ask: say.askLooks,
      };
    }
    // The maker names a lead to redo by name or id; every lead not named is accepted as drawn.
    if (stage === "leads") decide(say.cast.filter((c) => !redo.includes(c.name)).map((c) => c.id), redo);
    if (stage === "leads" && redo.length) {
      const who = say.cast.filter((c) => redo.includes(c.name) || redo.includes(c.id));
      return { progress: who.map((c) => say.redrawLook(c.name)), files: who.map(leadSheet), ask: say.askRedrawn(who.map((c) => c.name)) };
    }
    if (stage === "leads") {
      stage = "references";
      return {
        progress: say.preparing,
        files: [
          ...say.episodes.map((_, i) => ({ path: `drama/episodes/EP00${i + 1}/breakdown/v1/breakdown.md`, type: "text/markdown", bytes: text(breakdownOf(say, `EP00${i + 1}`)) })),
          ...Object.values(shared).map((draw) => draw()),
        ],
        ask: say.askReferences(say.episodes.length),
      };
    }
    decide(Object.keys(shared), redo);
    if (redo.length) {
      const which = redo.filter((key) => shared[key]);
      return { progress: which.map(say.redrawReference), files: which.map((key) => shared[key]()), ask: say.askReferencesAgain(which) };
    }
    stage = "handed";
    return {
      progress: [...say.finishing, ...say.packing],
      files: [archive("project")],
      summary: `${say.castDone}\n` + say.episodes.map((title, i) => `EP00${i + 1}: ${title}`).join("\n"),
    };
  };
  // Each stop also hands back the status and the lineage, which shows the pictures the session's stops returned.
  const returned: string[] = [];
  return (answer) => {
    const step = play(answer);
    returned.push(...step.files.map((file) => file.path));
    return { ...step, files: [...step.files, replayStatus(progress()), replayLineage(progress(), returned)] };
  };
}

function episodeScript(code: string, lang: Lang, preset: string, story: { id: string; story: Story }): Player {
  const say = words(story.story)[lang];
  const set = pictures(story.id, lang);
  const segments = say.shots.map((shots, i) => ({ id: `seg0${i + 1}`, shots }));
  let stage: "boards" | "takes" | "cut" | "done" = "boards";
  // Each segment's own storyboard version and takes, and what the maker accepted of each: a
  // decision accepts every item of the review it doesn't send back.
  const boardVersion = new Map(segments.map((seg) => [seg.id, 1]));
  const boardAccepted = new Map<string, number>();
  const takes = new Map<string, number>();
  const takeAccepted = new Set<string>();
  let cut = 1;
  let cutAccepted = false;
  const base = `drama/episodes/${code}`;
  const boards = (which: typeof segments) =>
    which.flatMap((seg) => {
      const v = boardVersion.get(seg.id)!;
      return [
        art(set, `${base}/multi_panel_storyboard/${seg.id}/line-art/v${v}/image-1.svg`, storyboard(`${code} ${seg.id}`, seg.shots, "line-art", `v${v}`, v === 1 && seg.id === "seg01" ? 3 : -1)),
        art(set, `${base}/multi_panel_storyboard/${seg.id}/photoreal/v${v}/image-1.svg`, storyboard(`${code} ${seg.id}`, seg.shots, "photoreal", `v${v}`, v === 1 && seg.id === "seg01" ? 3 : -1)),
      ];
    });
  // A cut as replay returns it, with its plan beside it: each segment's newest take.
  const cutFiles = (version: number): Out[] => {
    const made = clip(set, `${base}/edit/v${version}/cut.mp4`, "cut");
    const newest = segments.map((seg) => {
      const take = `t${String(takes.get(seg.id)).padStart(2, "0")}`;
      return { segment: seg.id, take, bytes: clip(set, `${base}/segments/${seg.id}/${take}/video.mp4`, "take").bytes };
    });
    return [made, cutPlan(`${base}/edit/v${version}/cut.json`, code, made, newest)];
  };
  const shoot = (which: typeof segments) =>
    which.map((seg) => {
      takes.set(seg.id, (takes.get(seg.id) ?? 0) + 1);
      return clip(set, `${base}/segments/${seg.id}/t${String(takes.get(seg.id)).padStart(2, "0")}/video.mp4`, "take");
    });
  let started = false;
  const play = (answer: string): Step => {
    const redo = revisedKeys(answer);
    if (!started) {
      started = true;
      return {
        progress: say.restoring(code),
        files: [...segments.map((seg) => art(set, `${base}/blocking/${seg.id}/v1/image-1.svg`, blocking(`${code} ${seg.id}`, "v1"))), ...boards(segments)],
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
      return { progress: say.cutting, files: cutFiles(1), ask: say.askCut(code) };
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
      segments: ids,
      boards: Object.fromEntries(ids.map((id) => [id, { current: `v${boardVersion.get(id)}`, accepted: boardAccepted.has(id) ? `v${boardAccepted.get(id)}` : null }])),
    };
    if (takes.size) own.takes = Object.fromEntries([...takes].map(([id, count]) => [id, { count, accepted: takeAccepted.has(id) }]));
    if (stage === "cut" || stage === "done") own.cut = { current: `v${cut}`, accepted: cutAccepted ? `v${cut}` : null };
    const approved: Made = { current: "v1", accepted: "v1" };
    return {
      preset,
      bible: "v1",
      looks: Object.fromEntries(say.cast.map((c) => [c.id, approved])),
      references: Object.fromEntries(["lin/S1", "home", "office", "letter"].map((key) => [key, approved])),
      episodes: Object.fromEntries(say.episodes.map((_, i) => `EP00${i + 1}`).map((other) => [other, other === code ? own : { segments: ids }])),
    };
  };
  // Each stop and the finish also hand back the episode's own folder, packed, the status and the lineage.
  let stops = 0;
  const returned: string[] = [];
  return (answer) => {
    const step = play(answer);
    stops += 1;
    returned.push(...step.files.map((file) => file.path));
    return { ...step, files: [...step.files, archive(code, stops), replayStatus(progress()), replayLineage(progress(), returned)] };
  };
}

function chatScript(goal: string, lang: Lang): Player {
  const say = words(STORIES.stepmother[lang])[lang];
  return () => ({ progress: say.readingMessage, files: [], summary: say.noted(goal) });
}

/** The recording a run's goal starts; a session keeps the language its first goal set. */
function scriptFor(goal: string, lang: Lang): Player {
  const episode = goal.match(/\b(EP\d{3})\b/);
  // The preset the goal's drama-cli init names, as the report says it.
  const preset = goal.match(/--preset (\S+)/)?.[1] ?? "";
  const story = storyOf(goal, lang);
  if (/make episode|continue episode/i.test(goal) && episode) return episodeScript(episode[1], lang, preset, story);
  if (/vertical short drama from my screenplay/i.test(goal)) return setupScript(lang, preset, story);
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
