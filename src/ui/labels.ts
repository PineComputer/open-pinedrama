// Words for states the engine reports as data, in the maker's language.
import type { DramaView, EpisodeRow, FileKind, ReviewKind, Spend } from "../shared/types.ts";
import { nameOf, type Names } from "../shared/names.ts";
import type { ProjectView } from "../shared/project.ts";
import { ApiError, useResource } from "./api.ts";
import type { useT } from "./i18n.ts";

type T = ReturnType<typeof useT>["t"];

/** How many items a review holds, in what they are, as design/ counts them: "2 takes", "6 storyboards", "1 item"; nothing for none. */
export function countText(kind: ReviewKind, items: number, t: T): string {
  if (!items) return "";
  const one = items === 1;
  const noun = kind === "takes" ? (one ? "slate.take" : "slate.takes") : kind === "storyboards" ? (one ? "board.storyboard" : "board.storyboards") : one ? "slate.item" : "slate.items";
  return t(noun, { n: items });
}

/** What waits for the maker, as design/'s cards say it: "2 takes wait for you", "The cut waits for you", "A question waits for you". */
function waitsText(kind: ReviewKind, items: number, t: T): string {
  if (kind === "question" || !items) return t("slate.waitsQuestion");
  if (kind === "cut") return t("board.waitsCut");
  return t(items === 1 ? "slate.waitsOne" : "slate.waitsMany", { what: countText(kind, items, t) });
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

/** The drama's names from its bible (docs/architecture.md, section 8.5), for every screen that would otherwise show an id; null before a bible. */
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
/** Whether a drama is still being set up: before its episodes, or stopped before it had any. */
export function isSettingUp(drama: Pick<DramaView, "status" | "episodeRows">): boolean {
  return drama.status === "setup" || (drama.status === "stopped" && !drama.episodeRows.length);
}

/**
 * Whether the setup waits on the maker's review of the screenplay: it waits at its first question
 * (drama.setup.reached 1, "asking"), which is the rewrite's (design/screens.js, SetupSteps: Script, Your review).
 */
export function scriptWaits(drama: Pick<DramaView, "status" | "episodeRows" | "setup">): boolean {
  return isSettingUp(drama) && drama.setup.state === "waiting" && drama.setup.reached <= 1;
}

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
