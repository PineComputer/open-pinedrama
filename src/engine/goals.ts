// The goals the studio gives Pine's agent, in plain language. The drama skill on the
// Computer knows how to do the work; these say what to do, what the maker has decided,
// and what to hand back. Nothing here is a protocol the Computer must implement.

export interface DramaBrief {
  title: string;
  language: string;
  look: string;
  format: string;
  budget: number | null;
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

export function setupGoal(drama: DramaBrief, attachments: string[]): string {
  return [
    `Use the drama-workflow skill to produce a vertical short drama from the attached screenplay (${attachments.join(", ")}).`,
    brief(drama),
    drama.budget ? `Budget for the whole drama: $${drama.budget}.` : "",
    drama.notes ? `The maker's notes: ${drama.notes}` : "",
    "Read the screenplay and ask me for anything that is missing.",
    "Write the bible, then make the cast, the locations and the key props.",
    "Stop and ask me to approve the leads' looks, returning their sheets with your question.",
    "When I approve, finish the shared references and end with the list of episodes, one per line, as \"EP001: <title>\".",
    "Do not make breakdowns, storyboards or video in this session.",
    "Return every file you want me to see with your question or result.",
    writeIn(drama),
  ]
    .filter(Boolean)
    .join("\n");
}

export function episodeGoal(drama: DramaBrief, code: string, budget: number | null, attachments: string[]): string {
  return [
    `Use the drama-workflow skill to make episode ${code} of "${drama.title}" from the attached screenplay.`,
    brief(drama),
    budget ? `Budget for this episode: $${budget}.` : "",
    `The attached bible and images are the approved references: ${attachments.join(", ")}. Use them as they are; do not redesign the cast, locations or props.`,
    "Stop and ask me to review the episode's storyboards, returning them with your question, with anything the observer found.",
    "After I approve, shoot the takes, check them, and ask me about any takes with dialogue that need my ears, returning those takes.",
    "Then build the cut and ask me to watch it, returning the cut. Finish when I accept the cut.",
    writeIn(drama),
  ]
    .filter(Boolean)
    .join("\n");
}

/** For an episode whose session ended: continue in a new session from what the studio kept. */
export function resumeGoal(drama: DramaBrief, code: string, budget: number | null, attachments: string[], decision?: string): string {
  return [
    `Use the drama-workflow skill to continue episode ${code} of "${drama.title}" in this new session; the earlier session ended.`,
    brief(drama),
    budget ? `Budget left for this episode: $${budget}.` : "",
    `Attached are the screenplay, the approved references and the episode's work so far: ${attachments.join(", ")}. Continue from them; redo only what is missing.`,
    decision ? `My last decision, made on the attached files:\n${decision}` : "",
    "Stop for my review of storyboards, takes with dialogue and the cut, as before, returning the files with each question. Finish when I accept the cut.",
    writeIn(drama),
  ]
    .filter(Boolean)
    .join("\n");
}

export function continueGoal(code: string | null): string {
  return code
    ? `Continue episode ${code} where you stopped. Stop for my review at the next point that needs me, returning the files with your question.`
    : "Continue where you stopped. Stop for my review at the next point that needs me, returning the files with your question.";
}
