// The goals the studio gives Pine's agent, in plain language. The drama skill on the
// Computer knows how to do the work; these say what to do, what the maker has decided,
// and what to hand back. Nothing here is a protocol the Computer must implement.
import path from "node:path";

/** Pine's drama skill, as a Computer lists it among the skills it serves. */
export const DRAMA_SKILL = "drama-workflow";

export interface DramaBrief {
  title: string;
  /** zh | en: the maker's language (the studio's), which the agent writes its questions and summaries in. */
  language: string;
  /** "" for a drama made after New drama asked for a preset, which says what kind of drama it is. */
  look: string;
  format: string;
  notes: string;
  /** About this many seconds an episode (60, 90, 120), or "" for a drama made before New drama always asked. */
  length: string;
  /** The drama-cli preset the maker chose (shared/presets.ts), or "" while it isn't chosen. */
  preset: string;
  /** The language of the screenplay's structural marks (en | zh), as `drama-cli init --screenplay-language` takes it; "" for a drama made before New drama asked. */
  screenplay_language: string;
}

/** The episode lengths the maker chooses among, in words with a guide range. */
export const LENGTHS: Record<string, string> = {
  "60": "about a minute (50 to 70 seconds)",
  "90": "about a minute and a half (80 to 110 seconds)",
  "120": "about two minutes (100 to 140 seconds)",
};

function languageName(code: string): string {
  return code === "zh" ? "Chinese" : "English";
}

/** What the maker set in New drama: final, whatever their files say. */
function brief(drama: DramaBrief): string {
  return [
    `Title: ${drama.title}.`,
    // A drama made before New drama asked for drama-cli init's inputs gave its language and look here instead.
    drama.screenplay_language ? "" : `Language: ${languageName(drama.language)}.`,
    drama.look ? `Look: ${drama.look}.` : "",
    `Format: ${drama.format}.`,
    LENGTHS[drama.length] ? `Episode length: ${LENGTHS[drama.length]}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * brief.md, the brief `drama-cli init --inputs.brief` takes: free text that opens with the two
 * lines `drama-cli init -h` names, "Title:" and "Episode length:", then the maker's notes, what
 * the screenplay doesn't say. The preset gives the drama's kind and style (a Chinese or an English
 * vertical drama, its casting and wardrobe), the config the format, and the dialogue's language is
 * detected where subtitles are timed (short_drama D116).
 */
export function briefFile(drama: Pick<DramaBrief, "title" | "length" | "notes">): string {
  return [
    `Title: ${drama.title}`,
    `Episode length: ${LENGTHS[drama.length]}.`,
    drama.notes ? `\nNotes: ${drama.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n") + "\n";
}

/**
 * Where the project keeps its inputs, inside drama/ so they travel with it in every handoff:
 * the screenplay as the maker gave it and the studio's brief.md.
 */
const INPUTS = "drama/inputs";

/** The screenplay's name in the project: fixed, so every session names it alike; it keeps the maker's extension. */
export function projectScreenplay(name: string): string {
  return `screenplay${path.posix.extname(name)}`;
}

/**
 * The one `drama-cli init` every session runs: in setup it writes the config; on a restored
 * project it points the config at this session's folder and keeps every other setting.
 */
function init(drama: DramaBrief, screenplay: string): string {
  return `drama-cli init drama --preset ${drama.preset} --inputs.screenplay ${INPUTS}/${screenplay} --inputs.brief ${INPUTS}/brief.md --screenplay-language ${drama.screenplay_language}`;
}

/** The resolution drama-cli renders at, from the format the maker chose ("9:16, 480p"). */
function resolution(format: string): string {
  return /(\d+p)$/.exec(format)?.[1] ?? "";
}

function writeIn(drama: DramaBrief): string {
  return `Write your questions and summaries in ${languageName(drama.language)}.`;
}

/**
 * The drama's setup and pre-production, in one session and one drama-cli project: the bible
 * and the leads, then everything every episode shares, approved by the maker, so episodes can
 * then run in parallel on copies of the same accepted project. The maker chose the inputs in
 * New drama (the screenplay, its language, the preset) and the studio wrote brief.md, so the
 * agent runs init as given; the maker's other files are sources, and what the maker set is final.
 * A rehearsal has no drama-cli and may have no preset: it copies the inputs and skips init.
 */
export function setupGoal(drama: DramaBrief, attachments: string[], inputs: { screenplay: string; brief: string }): string {
  const others = attachments.filter((name) => name !== inputs.screenplay && name !== inputs.brief);
  return [
    `Use the ${DRAMA_SKILL} skill to produce a vertical short drama from my screenplay, attached as ${inputs.screenplay}${others.length ? `, with my other sources (${others.join(", ")})` : ""}.`,
    `My settings, which are final: ${brief(drama)}`,
    drama.notes ? `My notes: ${drama.notes}` : "",
    `Make the drama-cli project in the work directory's drama/ folder, with these inputs, which I chose: \`${[`mkdir -p ${INPUTS}`, `cp attachments/${inputs.screenplay} ${INPUTS}/${projectScreenplay(inputs.screenplay)}`, `cp attachments/${inputs.brief} ${INPUTS}/brief.md`, drama.preset ? init(drama, projectScreenplay(inputs.screenplay)) : ""].filter(Boolean).join(" && ")}\`. Where a source disagrees with my settings, follow my settings.`,
    resolution(drama.format) ? `Then set defaults.resolution to ${resolution(drama.format)} in drama/drama-cli.cfg.yaml.` : "",
    NO_CAP,
    RETURN_STATUS,
    "Read the screenplay and ask me for anything that is missing.",
    "Write the bible, then make each lead's face and base look. Stop and ask me to approve the leads' looks, returning their sheets with your question.",
    "After I approve, prepare every episode so that each can then be made in parallel in a session of its own: write and accept every episode's breakdown, then make every reference `drama-cli status --config drama/drama-cli.cfg.yaml` lists as needed by the accepted breakdowns. Stop and ask me to approve these shared references, returning their images with your question.",
    `After I approve, pack the whole drama/ folder, records included, into parts of at most 60 MB (\`mkdir -p handoff && tar -cf - -C drama . | split -b 60m - handoff/project.tar.part-\`) and return the parts. ${LIST_EPISODES}`,
    "Do not make blocking references, first-frame references, storyboards or video in this session.",
    "Return every file you want me to see with your question or result.",
    writeIn(drama),
  ]
    .filter(Boolean)
    .join("\n");
}

const LIST_EPISODES = 'End with the list of episodes, one per line, as "EP001: <title>".';

/**
 * drama-cli caps a project at its config's budget_usd, which init writes as 1000, and null
 * means no cap; the skill asks the maker whenever spending isn't authorized (it once asked for
 * a budget, then to confirm a paid take). The maker sets no cap and authorizes the spend: Pine
 * bills, and the studio shows it.
 */
export const NO_CAP =
  "Spending is authorized and has no cap: budget_usd in drama/drama-cli.cfg.yaml is null (set it so after init; a restored project keeps it), make every paid request the work needs without asking me first, and never ask me about cost.";

/**
 * drama-cli's status of the project at each stop, which the skill calls the source of truth for
 * versions, takes, verdicts and budget (short_drama skills/drama-workflow/SKILL.md, "Start or
 * resume", v0.7.4): the studio reads where the work stands from it rather than from the files'
 * names. It is saved beside the packs, outside the project, so no pack carries it.
 */
export const RETURN_STATUS =
  "Each time you stop for me or finish, also save drama-cli's status of the project (`mkdir -p handoff && drama-cli status --config drama/drama-cli.cfg.yaml > handoff/status.json`) and return handoff/status.json with your other files. It is for the studio; don't ask me about it.";

/** How an episode session takes up the drama's project, and the bounds it keeps to. */
function handedOver(drama: DramaBrief, code: string, screenplay: string | undefined): string[] {
  // screenplay: its name in the project (projectScreenplay); undefined for a drama made before the studio chose the inputs.
  return [
    "The attached project.tar.part-* files are the drama's drama-cli project, with its bible, every breakdown and every look, location and key prop accepted.",
    screenplay
      ? `Restore it into the work directory's drama/ folder and point its config at that folder, keeping its settings: \`mkdir -p drama && cat attachments/project.tar.part-* | tar -xf - -C drama && ${init(drama, screenplay)}\`. Check it with \`drama-cli status --config drama/drama-cli.cfg.yaml\`.`
      : "Restore it into the work directory's drama/ folder (`mkdir -p drama && cat attachments/project.tar.part-* | tar -xf - -C drama`), point its config at that folder and its screenplay.md and brief.md with `drama-cli init`, keeping its settings and preset, and check it with `drama-cli status`.",
    NO_CAP,
    RETURN_STATUS,
    "Its asset-library registrations were made in another session and can't be used from this one: before you compile video prompts, set them aside and register every reference the episode uses again from its local file in this session.",
    `Work only on ${code}, inside drama/episodes/${code}. Use the accepted references as they are: never make a new version of the bible, a look, a location, a key prop or another episode's breakdown. Stop and ask me only when a drama-cli command refuses because a reference it reads is not accepted, quoting its refusal; until then, go on with every step that doesn't read it.`,
    `${code}'s own breakdown is yours to change when the video model won't take it as it is, such as a segment longer than the model accepts: make a new version that splits it, keeping every line, accept it, redo what depends on it, and tell me at your next stop.`,
  ];
}

/** At each stop, the episode's own folder is packed and returned, so another session can carry on from it. */
function packEpisode(code: string): string {
  return `Each time you stop for me or finish, also pack drama/episodes/${code}, records included, into parts of at most 60 MB (\`mkdir -p handoff && tar -cf - -C drama/episodes/${code} . | split -b 60m - handoff/${code}.tar.part-\`) and return those parts too.`;
}

const EPISODE_STOPS = [
  "Stop and ask me to review the episode's storyboards, returning them with your question, with anything the observer found; if you made a new version of the episode's breakdown, return it too.",
  "After I approve, shoot the takes. I watch every take: each time takes are downloaded, stop and ask me to watch them, returning them with your question, and ask about the takes that are ready together rather than one at a time.",
  "Then build the cut and ask me to watch it, returning the cut. Finish when I accept the cut.",
];

/**
 * An episode in a session of its own. With the project pre-production handed over (handoff),
 * it restores that project and works only in its own folder; without one (a drama set up
 * before pre-production existed), it gets the approved references as loose files.
 */
export function episodeGoal(drama: DramaBrief, code: string, attachments: string[], handoff: boolean, screenplay?: string): string {
  return [
    `Use the ${DRAMA_SKILL} skill to make episode ${code} of "${drama.title}".`,
    brief(drama),
    ...(handoff
      ? handedOver(drama, code, screenplay)
      : [`The attached bible and images are the approved references: ${attachments.join(", ")}. Use them as they are; do not redesign the cast, locations or props.`]),
    ...EPISODE_STOPS,
    handoff ? packEpisode(code) : "",
    writeIn(drama),
  ]
    .filter(Boolean)
    .join("\n");
}

/** For an episode whose session ended: continue in a new session from what the studio kept. */
export function resumeGoal(drama: DramaBrief, code: string, attachments: string[], handoff: boolean, decision?: string, screenplay?: string): string {
  const ownFolder = attachments.some((name) => name.startsWith(`${code}.tar.part-`));
  return [
    `Use the ${DRAMA_SKILL} skill to continue episode ${code} of "${drama.title}" in this new session; the earlier session ended.`,
    brief(drama),
    ...(handoff
      ? [
          ...handedOver(drama, code, screenplay),
          ownFolder
            ? `The attached ${code}.tar.part-* files are ${code}'s folder as the earlier session left it: restore them into drama/episodes/${code} (\`mkdir -p drama/episodes/${code} && cat attachments/${code}.tar.part-* | tar -xf - -C drama/episodes/${code}\`) and carry on from there; redo only what is missing.`
            : `Nothing of ${code} was kept: start it from its accepted breakdown.`,
        ]
      : [`Attached are the screenplay, the approved references and the episode's work so far: ${attachments.join(", ")}. Continue from them; redo only what is missing.`]),
    decision ? `My last decision, made on the attached files:\n${decision}` : "",
    "Stop for my review of storyboards, takes and the cut, as before, returning the files with each question, those the earlier session made included. Finish when I accept the cut.",
    handoff ? packEpisode(code) : "",
    writeIn(drama),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The maker's decision on a stop where the agent ended its turn rather than asked: it goes as
 * the session's next run, saying to carry on as before.
 */
export function decisionGoal(answer: string, code: string | null): string {
  return [answer, `${code ? `Carry on with episode ${code}` : "Carry on"} from there as the goal says, stopping for my review at the next point that needs me, returning the files with your question.`].join("\n\n");
}

/** The kit a rehearsal's sessions are given (fixtures/rehearsal), under this name. */
export const STANDIN_KIT = "standin.py";

/**
 * The same goal, rehearsed: Pine's agent stands in for the drama skill with a kit that draws
 * placeholder pictures and clips where the skill would, so the studio's whole flow (stops,
 * reviews, handoffs, many Computers) runs on a real project before it has the skill.
 */
export function rehearsed(goal: string): string {
  const kit = `python3 attachments/${STANDIN_KIT}`;
  return [
    "This is a rehearsal of the studio's flow. Pine's drama skill (drama-workflow) and drama-cli are not on this Computer, and that is expected.",
    `Wherever the goal below says to use them, stand in with the attached kit, \`${kit}\` (\`${kit} --help\` lists its commands). It writes placeholder looks, locations, props, blocking references, storyboards, takes and cuts where the skill would, and prints each path it wrote.`,
    'Write the bible and the breakdowns yourself, short, in Markdown: drama/bible/v1/bible.md, and drama/episodes/EP001/breakdown/v1/breakdown.md for EP001 and so on, two or three segments each, with a "## seg01" heading for each segment followed by its shots as a list, one of them a line of dialogue.',
    `For an episode, draw each segment's blocking and storyboards, then shoot one take per segment (give a segment with dialogue its line with --line), then build the cut, stopping for me where the goal says. Skip \`drama-cli init\` and \`drama-cli status\`, and return no handoff/status.json; check a restored project with \`${kit} status\`.`,
    "When I ask for changes, make a new version only of what I named. Everything else exactly as the goal says: the questions, the stops, packing and returning files, the list of episodes.",
    "",
    goal,
  ].join("\n");
}

/** Another run in the same session, after a turn that stopped short or broke off (`brokeOff`) before the next review. */
export function continueGoal(code: string | null, brokeOff = false): string {
  return [
    brokeOff ? "Your last turn broke off before it finished; what it made is still in your working directory." : "",
    code ? `Continue episode ${code} where you stopped.` : "Continue where you stopped.",
    "Stop for my review at the next point that needs me, returning the files with your question.",
  ]
    .filter(Boolean)
    .join(" ");
}
