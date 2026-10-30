// The names a person reads, from the drama's bible.json (drama-cli's Bible, drama_cli/schemas/
// bible.py, v0.7.4): its title, its people with their other names, its places and props as the
// screenplay writes them, in its own script (AGENTS.md design rule 12), and its episodes' titles.
// drama-cli's status report names things by id only; a screen shows these instead. A bible that
// doesn't read this way is refused, naming the field.

export interface Names {
  title: string;
  /** The one-line hook, as the bible writes it (Bible.logline); a bible may leave it out (bible.py, optional). */
  logline?: string;
  characters: Record<string, { name: string; aliases: string[] }>;
  locations: Record<string, string>;
  props: Record<string, string>;
  /** Each episode's title, by its id (EP001). */
  episodes: Record<string, string>;
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

export function parseBibleNames(bible: unknown): Names {
  const raw = object(bible, "");
  return {
    title: text(raw.title, "title"),
    ...(raw.logline === undefined ? {} : { logline: text(raw.logline, "logline") }),
    characters: byId(raw.characters, "characters", (entry, at) => ({
      name: text(entry.name, `${at}.name`),
      aliases: list(entry.aliases, `${at}.aliases`).map((alias, n) => text(alias, `${at}.aliases.${n}`)),
    })),
    locations: byId(raw.locations, "locations", (entry, at) => text(entry.name, `${at}.name`)),
    // A bible lists props only when the screenplay has any.
    props: raw.props === undefined ? {} : byId(raw.props, "props", (entry, at) => text(entry.name, `${at}.name`)),
    episodes: byId(raw.episodes, "episodes", (entry, at) => text(entry.title, `${at}.title`)),
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
