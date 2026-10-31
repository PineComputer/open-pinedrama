// Words for states the engine reports as data, in the maker's language.
import type { EpisodeRow, FileKind, ReviewKind, Spend } from "../shared/types.ts";
import { TEMPLATES } from "../shared/presets.ts";
import { nameOf, type Names } from "../shared/names.ts";
import type { ProjectView } from "../shared/project.ts";
import { ApiError, useResource } from "./api.ts";
import type { useT } from "./i18n.ts";

type T = ReturnType<typeof useT>["t"];

/** What waits for the maker, as design/'s cards say it: "2 takes wait for you", "The cut waits for you", "A question waits for you". */
function waitsText(kind: ReviewKind, items: number, t: T): string {
  if (kind === "question" || !items) return t("slate.waitsQuestion");
  if (kind === "cut") return t("board.waitsCut");
  const one = items === 1;
  const noun = kind === "takes" ? (one ? "slate.take" : "slate.takes") : kind === "storyboards" ? (one ? "board.storyboard" : "board.storyboards") : one ? "slate.item" : "slate.items";
  return t(one ? "slate.waitsOne" : "slate.waitsMany", { what: t(noun, { n: items }) });
}

export function nowText(row: EpisodeRow, t: T): string {
  switch (row.state) {
    case "queued":
      return t("board.inLine", { n: row.position ?? 1 });
    case "working":
      return row.activity ? plainText(row.activity) : t(row.computer ? "board.atWork" : "board.starting");
    case "waiting":
      return row.waitingFor === "saving" ? t("board.saving") : waitsText(row.waitingFor ?? "question", row.waitingItems ?? 0, t);
    case "done":
      return t("board.done");
    case "stopped":
      return row.note ? plainText(row.note) : t("board.stopped");
    default:
      return row.note ? plainText(row.note) : t("board.failed");
  }
}

/** The drama's names from its bible (docs/REDESIGN_PLAN.md, P5.5), for every screen that would otherwise show an id; null before a bible. */
export function useNames(dramaId: string | undefined): Names | null {
  const { data } = useResource<ProjectView>(dramaId ? `/api/dramas/${dramaId}/project` : null, [`project:${dramaId}`]);
  return data?.names ?? null;
}

/**
 * A subject as the studio files it, named: a character ("lin"), with a look ("lin/S1"), a
 * location or a prop ("location:home", "prop:letter", or a cast card's subject with its kind).
 */
export function subjectLabel(names: Names | null, subject: string, kind?: "look" | "location" | "prop"): string {
  const tagged = subject.match(/^(location|prop):(.+)$/);
  const which = tagged ? (tagged[1] as "location" | "prop") : kind === "location" || kind === "prop" ? kind : "character";
  return nameOf(names, which, (tagged ? tagged[2] : subject).replace("/", " "));
}

/** Markdown said as plain words, for a one-line preview: link labels, no markup. */
/** A scene heading as a person reads it: without the scene number Fountain writes at its end between #s (fountain.io, "Scene Numbers"). */
export function headingText(heading: string): string {
  return heading.replace(/\s*#[^#\n]*#\s*$/, "");
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*(?:[-+]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const LOOKS: Record<string, Parameters<T>[0]> = { "live action": "look.live", anime: "look.anime", "3D animation": "look.3d" };

function lookLabel(value: string, t: T): string {
  const key = LOOKS[value];
  return key ? t(key) : value;
}

/** What a drama is: its preset template, or for one made before New drama asked for a preset, its look; "" for a rehearsal. */
export function kindLabel(drama: { preset: string; look: string }, t: T): string {
  const template = TEMPLATES.find((entry) => entry.preset !== undefined && entry.preset === drama.preset);
  return template ? t(`template.${template.key}` as Parameters<T>[0]) : lookLabel(drama.look, t);
}

/** What work has cost, in US dollars as Pine prices it; "at least" where some turns couldn't be priced. */
export function moneyText(spent: Spend | number, t: T, lang: string): string {
  const total = typeof spent === "number" ? spent : spent.total;
  const amount = new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US", { style: "currency", currency: "USD" }).format(total);
  return typeof spent !== "number" && spent.partial ? t("spent.atLeast", { amount }) : amount;
}

/** A failure, said in the maker's language: the engine's code where there is one, else its message. */
export function errorText(error: unknown, t: T): string {
  if (error instanceof ApiError) return t(`error.${error.code}`, { detail: error.detail ?? error.message });
  return error instanceof Error ? error.message : String(error);
}

const COMPUTER_STATES = new Set(["starting", "running", "stopping", "stopped", "failed"]);

export function computerState(state: string, t: T): string {
  return COMPUTER_STATES.has(state) ? t(`computer.${state}` as Parameters<T>[0]) : state;
}

export function fileKind(kind: FileKind, t: T): string {
  return t(`file.${kind}`);
}

/** The setup's steps, in the order setup.reached counts them (types.ts DramaView.setup). */
export const SETUP_STEPS = ["setup.reading", "setup.answers", "setup.cast", "setup.approval", "setup.preparing", "setup.references"] as const;
