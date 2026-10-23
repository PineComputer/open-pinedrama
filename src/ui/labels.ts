// Words for states the engine reports as data, in the maker's language.
import type { EpisodeRow, FileKind } from "../shared/types.ts";
import { ApiError } from "./api.ts";
import type { useT } from "./i18n.ts";

type T = ReturnType<typeof useT>["t"];

export function nowText(row: EpisodeRow, t: T): string {
  switch (row.state) {
    case "queued":
      return t("board.inLine", { n: row.position ?? 1 });
    case "working":
      return row.activity ?? t("board.starting");
    case "waiting":
      return row.waitingFor === "saving" ? t("board.saving") : t("board.waits", { kind: t(`kind.${row.waitingFor ?? "question"}`) });
    case "done":
      return t("board.done");
    case "stopped":
      return row.note ?? t("board.stopped");
    default:
      return row.note ?? t("board.failed");
  }
}

const LOOKS: Record<string, Parameters<T>[0]> = { "live action": "look.live", anime: "look.anime", "3D animation": "look.3d" };

export function lookLabel(value: string, t: T): string {
  const key = LOOKS[value];
  return key ? t(key) : value;
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
