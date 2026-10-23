// The goals the studio gives Pine's agent, in plain language. The drama skill on the
// Computer knows how to do the work; these say what to do, what the maker has decided,
// and what to hand back. Nothing here is a protocol the Computer must implement.

/** Pine's drama skill, as a Computer lists it among the skills it serves. */
export const DRAMA_SKILL = "drama-workflow";

export interface DramaBrief {
  title: string;
  language: string;
  look: string;
  format: string;
  notes: string;
}

function languageName(code: string): string {
  return code === "zh" ? "Chinese" : "English";
}

function brief(drama: DramaBrief): string {
  return [
    `Title: ${drama.title}.`,
    `Language: ${languageName(drama.language)}.`,
    `Look: ${drama.look}.`,
    `Format: ${drama.format}.`,
  ].join(" ");
}

function writeIn(drama: DramaBrief): string {
  return `Write your questions and summaries in ${languageName(drama.language)}.`;
}

/**
 * The drama's setup and pre-production, in one session and one drama-cli project: the bible
 * and the leads, then everything every episode shares, approved by the maker, so episodes can
 * then run in parallel on copies of the same accepted project.
 */
export function setupGoal(drama: DramaBrief, attachments: string[]): string {
  return [
    `Use the ${DRAMA_SKILL} skill to produce a vertical short drama from the attached screenplay (${attachments.join(", ")}).`,
    brief(drama),
    drama.notes ? `The maker's notes: ${drama.notes}` : "",
    "Make the drama-cli project in the work directory's drama/ folder.",
    "Read the screenplay and ask me for anything that is missing.",
    "Write the bible, then make each lead's face and base look. Stop and ask me to approve the leads' looks, returning their sheets with your question.",
    "After I approve, prepare every episode so that each can then be made in parallel in a session of its own: write and accept every episode's breakdown, then make every look, location and key prop that any breakdown uses. Stop and ask me to approve these shared references, returning their images with your question.",
    `After I approve, pack the whole drama/ folder, records included, into parts of at most 60 MB (\`mkdir -p handoff && tar -cf - -C drama . | split -b 60m - handoff/project.tar.part-\`) and return the parts. ${LIST_EPISODES}`,
    "Do not make blocking references, storyboards or video in this session.",
    "Return every file you want me to see with your question or result.",
    writeIn(drama),
  ]
    .filter(Boolean)
    .join("\n");
}

const LIST_EPISODES = 'End with the list of episodes, one per line, as "EP001: <title>".';

/** How an episode session takes up the drama's project, and the bounds it keeps to. */
function handedOver(code: string): string[] {
  return [
    "The attached project.tar.part-* files are the drama's drama-cli project, with its bible, every breakdown and every look, location and key prop accepted.",
    "Restore it into the work directory's drama/ folder (`mkdir -p drama && cat attachments/project.tar.part-* | tar -xf - -C drama`), point its config at that folder with `drama-cli init`, keeping its settings, budget and preset, and check it with `drama-cli status`.",
    `Work only on ${code}, inside drama/episodes/${code}. Use the accepted references as they are: never make a new version of the bible, a look, a location, a key prop or another episode's breakdown. If ${code} needs one that is not accepted, stop and ask me.`,
  ];
}

/** At each stop, the episode's own folder is packed and returned, so another session can carry on from it. */
function packEpisode(code: string): string {
  return `Each time you stop for me or finish, also pack drama/episodes/${code}, records included, into parts of at most 60 MB (\`mkdir -p handoff && tar -cf - -C drama/episodes/${code} . | split -b 60m - handoff/${code}.tar.part-\`) and return those parts too.`;
}

const EPISODE_STOPS = [
  "Stop and ask me to review the episode's storyboards, returning them with your question, with anything the observer found.",
  "After I approve, shoot the takes, check them, and ask me about any takes with dialogue that need my ears, returning those takes.",
  "Then build the cut and ask me to watch it, returning the cut. Finish when I accept the cut.",
];

/**
 * An episode in a session of its own. With the project pre-production handed over (handoff),
 * it restores that project and works only in its own folder; without one (a drama set up
 * before pre-production existed), it gets the approved references as loose files.
 */
export function episodeGoal(drama: DramaBrief, code: string, attachments: string[], handoff: boolean): string {
  return [
    `Use the ${DRAMA_SKILL} skill to make episode ${code} of "${drama.title}".`,
    brief(drama),
    ...(handoff
      ? handedOver(code)
      : [`The attached bible and images are the approved references: ${attachments.join(", ")}. Use them as they are; do not redesign the cast, locations or props.`]),
    ...EPISODE_STOPS,
    handoff ? packEpisode(code) : "",
    writeIn(drama),
  ]
    .filter(Boolean)
    .join("\n");
}

/** For an episode whose session ended: continue in a new session from what the studio kept. */
export function resumeGoal(drama: DramaBrief, code: string, attachments: string[], handoff: boolean, decision?: string): string {
  const ownFolder = attachments.some((name) => name.startsWith(`${code}.tar.part-`));
  return [
    `Use the ${DRAMA_SKILL} skill to continue episode ${code} of "${drama.title}" in this new session; the earlier session ended.`,
    brief(drama),
    ...(handoff
      ? [
          ...handedOver(code),
          ownFolder
            ? `The attached ${code}.tar.part-* files are ${code}'s folder as the earlier session left it: restore them into drama/episodes/${code} (\`mkdir -p drama/episodes/${code} && cat attachments/${code}.tar.part-* | tar -xf - -C drama/episodes/${code}\`) and carry on from there; redo only what is missing.`
            : `Nothing of ${code} was kept: start it from its accepted breakdown.`,
        ]
      : [`Attached are the screenplay, the approved references and the episode's work so far: ${attachments.join(", ")}. Continue from them; redo only what is missing.`]),
    decision ? `My last decision, made on the attached files:\n${decision}` : "",
    "Stop for my review of storyboards, takes with dialogue and the cut, as before, returning the files with each question. Finish when I accept the cut.",
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
    `For an episode, draw each segment's blocking and storyboards, then shoot one take per segment (give a segment with dialogue its line with --line), then build the cut, stopping for me where the goal says. Skip \`drama-cli init\` and \`drama-cli status\`; check a restored project with \`${kit} status\`.`,
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
