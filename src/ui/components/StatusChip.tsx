// Where an item stands, in one word: the design's .st chip
// (design/app.js, Status; studio.css .st), a dot in the state's colour before the words. "Red line" is
// only ever a stop for a screenplay red line (a generated one is "sent back").
import { type TKey, useT } from "../i18n.ts";

export type Status = "work" | "line" | "you" | "accepted" | "back" | "stale" | "redline" | "failed";

/** The design's class for each state: a failure reads as its err. */
const CLASS: Record<Status, string> = { work: "work", line: "line", you: "you", accepted: "accepted", back: "back", stale: "stale", redline: "redline", failed: "err" };

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
