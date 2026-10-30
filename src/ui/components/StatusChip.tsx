// Where an item stands, in one word, and what an observer found in it: the design's .st chip
// (design/app.js, Status; studio.css .st), a dot in the state's colour before the words. "Red line" is
// only ever a stop for a screenplay red line (a generated one is "sent back").
import { type TKey, useT } from "../i18n.ts";

export type Status = "work" | "line" | "you" | "accepted" | "back" | "stale" | "redline" | "failed";

/** The design's class for each state: a failure and an observer's error read as its err, a warn as its you. */
const CLASS: Record<Status | "error" | "warn", string> = { work: "work", line: "line", you: "you", accepted: "accepted", back: "back", stale: "stale", redline: "redline", failed: "err", error: "err", warn: "you" };

function Chip({ kind, children }: { kind: keyof typeof CLASS; children: string }) {
  return (
    <span className={`st ${CLASS[kind]}`} data-status={kind}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  const { t } = useT();
  return <Chip kind={status}>{label ?? t(`status.${status}` as TKey)}</Chip>;
}

/** How many findings of this severity the observer reported (understand's error and warn, named as understand names them); nothing for none. */
export function FindingCount({ severity, count }: { severity: "error" | "warn"; count: number }) {
  const { t } = useT();
  if (!count) return null;
  return <Chip kind={severity}>{t("finding.count", { n: count, severity })}</Chip>;
}
