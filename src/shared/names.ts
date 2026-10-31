// The names a person reads, from the drama's bible.json (drama-cli's Bible, drama_cli/schemas/
// bible.py, v0.7.4): its title, its people with their other names, its places and props as the
// screenplay writes them, in its own script (AGENTS.md design rule 12), its episodes' titles, and
// the story a person reads on the Story page: the logline, the beats' events and each episode's summary.
// drama-cli's status report names things by id only; a screen shows these instead. A bible that
// doesn't read this way is refused, naming the field.

export interface Names {
  title: string;
  characters: Record<string, { name: string; aliases: string[] }>;
  locations: Record<string, string>;
  props: Record<string, string>;
  /** Each episode's title, by its id (EP001). */
  episodes: Record<string, string>;
  /** The story in a sentence; none where the bible has no logline. */
  logline?: string;
  /** The overall style and explicitness, in English; none where the bible has none. */
  tone?: string;
  /** What happens, beat by beat: its event, its seconds on screen and its screenplay lines (bible.py's Beat). */
  beats: Beat[];
  /** Each episode's summary, by its id, where the bible gives one. */
  summaries: Record<string, string>;
  /** Each episode's end hook, by its id, where the bible gives one. */
  endHooks: Record<string, string>;
  /** Each episode's seconds, the sum of its beats (est_seconds), by its id, where the bible gives them. */
  seconds: Record<string, number>;
  /** Each episode's first and last screenplay line, by its id, where the bible gives them: its beats lie within them. */
  lines: Record<string, Lines>;
  /** Each place's and key prop's description, by its id, where the bible gives one (bible.py's Location and Prop). */
  descriptions: { locations: Record<string, string>; props: Record<string, string> };
}

/** [first, last] screenplay line numbers (bible.py's LineRange). */
export type Lines = [number, number];

export interface Beat {
  event: string;
  seconds: number;
  lines: Lines;
}

export class NamesError extends Error {
  constructor(readonly field: string, expected: string) {
    super(`The bible: ${field || "the bible"} should be ${expected}.`);
  }
}

type Raw = Record<string, unknown>;

function object(value: unknown, field: string): Raw {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new NamesError(field, "an object");
  return value as Raw;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new NamesError(field, "text");
  return value;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new NamesError(field, "a list");
  return value;
}

/** Each entry's id and name (or title), keyed by id. */
function byId<T>(value: unknown, field: string, read: (entry: Raw, at: string) => T): Record<string, T> {
  return Object.fromEntries(
    list(value, field).map((entry, n) => {
      const at = `${field}.${n}`;
      const raw = object(entry, at);
      return [text(raw.id, `${at}.id`), read(raw, at)];
    }),
  );
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new NamesError(field, "a number");
  return value;
}

function lineRange(value: unknown, field: string): Lines {
  const pair = list(value, field);
  if (pair.length !== 2) throw new NamesError(field, "[first, last] line numbers");
  return [number(pair[0], `${field}.0`), number(pair[1], `${field}.1`)];
}

/** The entries a field gives, without those it leaves out. */
const given = <T>(entries: Record<string, T | undefined>) => Object.fromEntries(Object.entries(entries).filter((pair): pair is [string, T] => pair[1] !== undefined));

/** An episode's beats: those whose lines lie within the episode's (drama-cli puts each beat within one episode). */
export function beatsOf(names: Names, episode: string): Beat[] {
  const range = names.lines[episode];
  return range ? names.beats.filter((beat) => beat.lines[0] >= range[0] && beat.lines[1] <= range[1]) : [];
}

export function parseBibleNames(bible: unknown): Names {
  const raw = object(bible, "");
  return {
    title: text(raw.title, "title"),
    characters: byId(raw.characters, "characters", (entry, at) => ({
      name: text(entry.name, `${at}.name`),
      aliases: list(entry.aliases, `${at}.aliases`).map((alias, n) => text(alias, `${at}.aliases.${n}`)),
    })),
    locations: byId(raw.locations, "locations", (entry, at) => text(entry.name, `${at}.name`)),
    // A bible lists props only when the screenplay has any.
    props: raw.props === undefined ? {} : byId(raw.props, "props", (entry, at) => text(entry.name, `${at}.name`)),
    episodes: byId(raw.episodes, "episodes", (entry, at) => text(entry.title, `${at}.title`)),
    logline: raw.logline === undefined ? undefined : text(raw.logline, "logline"),
    tone: raw.tone === undefined ? undefined : text(raw.tone, "tone"),
    beats:
      raw.beats === undefined
        ? []
        : list(raw.beats, "beats").map((entry, n) => {
            const beat = object(entry, `beats.${n}`);
            return { event: text(beat.event, `beats.${n}.event`), seconds: number(beat.seconds, `beats.${n}.seconds`), lines: lineRange(beat.lines, `beats.${n}.lines`) };
          }),
    summaries: given(byId(raw.episodes, "episodes", (entry, at) => (entry.summary === undefined ? undefined : text(entry.summary, `${at}.summary`)))),
    endHooks: given(byId(raw.episodes, "episodes", (entry, at) => (entry.end_hook === undefined ? undefined : text(entry.end_hook, `${at}.end_hook`)))),
    seconds: given(byId(raw.episodes, "episodes", (entry, at) => (entry.est_seconds === undefined ? undefined : number(entry.est_seconds, `${at}.est_seconds`)))),
    lines: given(byId(raw.episodes, "episodes", (entry, at) => (entry.lines === undefined ? undefined : lineRange(entry.lines, `${at}.lines`)))),
    descriptions: {
      locations: given(byId(raw.locations, "locations", (entry, at) => (entry.description === undefined ? undefined : text(entry.description, `${at}.description`)))),
      props: raw.props === undefined ? {} : given(byId(raw.props, "props", (entry, at) => (entry.description === undefined ? undefined : text(entry.description, `${at}.description`)))),
    },
  };
}

/**
 * A character, location or prop as a person reads it: its name in the bible, then what follows
 * its id in drama-cli's words (a look such as S1, a time such as Day). Before a bible names it,
 * the id as drama-cli gives it.
 */
export function nameOf(names: Names | null, kind: "character" | "location" | "prop", subject: string): string {
  const [id, ...rest] = subject.split(" ");
  const name = kind === "character" ? names?.characters[id]?.name : kind === "location" ? names?.locations[id] : names?.props[id];
  return [name ?? id, ...rest].join(" · ");
}
