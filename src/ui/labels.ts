// Words for states the engine reports as data, in the maker's language.
import type { EpisodeRow } from "../shared/types.ts";
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
