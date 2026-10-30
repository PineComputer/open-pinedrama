// Where an item stands, in one word, and what an observer found in it. The words and colours are
// the design's; "red line" is only ever a stop for a screenplay red line (a generated one is "sent
// back").
export type Status = "work" | "line" | "you" | "accepted" | "back" | "stale" | "redline" | "failed";

const WORDS: Record<Status, string> = {
  work: "At work",
  line: "In line",
  you: "Waiting for you",
  accepted: "Accepted",
  back: "Sent back",
  stale: "Stale",
  redline: "Red line",
  failed: "Failed",
};

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  return (
    <span className={`ds-chip is-${status}`}>
      {(status === "work" || status === "redline") && <span className="dot" aria-hidden="true" />}
      {label ?? WORDS[status]}
    </span>
  );
}

/** How many findings of this severity the observer reported (understand's error and warn); nothing for none. */
export function FindingCount({ severity, count }: { severity: "error" | "warn"; count: number }) {
  if (!count) return null;
  return <span className={`ds-chip is-${severity}`}>{`${count} ${severity}`}</span>;
}
