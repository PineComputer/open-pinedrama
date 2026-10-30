// Where an item stands, in one word, and what an observer found in it. The words and colours are
// the design's; "red line" is only ever a stop for a screenplay red line (a generated one is "sent
// back").
import { type TKey, useT } from "../i18n.ts";

export type Status = "work" | "line" | "you" | "accepted" | "back" | "stale" | "redline" | "failed";

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  const { t } = useT();
  return (
    <span className={`ds-chip is-${status}`}>
      {(status === "work" || status === "redline") && <span className="dot" aria-hidden="true" />}
      {label ?? t(`status.${status}` as TKey)}
    </span>
  );
}

/** How many findings of this severity the observer reported (understand's error and warn, named as understand names them); nothing for none. */
export function FindingCount({ severity, count }: { severity: "error" | "warn"; count: number }) {
  const { t } = useT();
  if (!count) return null;
  return <span className={`ds-chip is-${severity}`}>{t("finding.count", { n: count, severity })}</span>;
}
