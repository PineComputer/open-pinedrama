// The episode length a brief.md gives, read as the drama skill reads it: drama-cli takes it from
// one line, "Episode length: <words> (<N> seconds)" or "(<N> to <M> seconds)" (its cli.md, "The
// brief"), and refuses a brief without one. The brief New drama writes has that line; a maker's
// own brief is read here so the page can show the length before anything starts.

const EPISODE_LENGTH = /^\W*Episode length:.*\((\d+)(?: to (\d+))? seconds\)/m;

export interface BriefSeconds {
  min: number;
  max: number;
}

/** The seconds a brief gives each episode, or undefined where it has no line of that form. */
export function briefSeconds(text: string): BriefSeconds | undefined {
  const match = EPISODE_LENGTH.exec(text);
  return match ? { min: Number(match[1]), max: Number(match[2] ?? match[1]) } : undefined;
}

/** "25–35", or "90" for a single length. */
export function secondsText({ min, max }: BriefSeconds): string {
  return min === max ? `${min}` : `${min}–${max}`;
}
