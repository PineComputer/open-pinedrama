// Where an item stands, in one word, and what an observer found in it: shadcn/ui's Badge with a dot in
// the status's colour. The words and colours are the design's; "red line" is only ever a stop for a
// screenplay red line (a generated one is "sent back").
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { type TKey, useT } from "../i18n.ts";

export type Status = "work" | "line" | "you" | "accepted" | "back" | "stale" | "redline" | "failed";

const DOT: Record<Status | "error" | "warn", string> = {
  work: "bg-foreground animate-pulse",
  line: "bg-(--text-subtle)",
  you: "bg-warning",
  accepted: "bg-success",
  back: "bg-destructive",
  redline: "bg-destructive",
  failed: "bg-destructive",
  error: "bg-destructive",
  warn: "bg-warning",
  stale: "border border-dashed border-muted-foreground",
};

function Chip({ kind, over = false, children }: { kind: keyof typeof DOT; over?: boolean; children: string }) {
  return (
    <Badge variant="outline" data-status={kind} className={cn("h-5.5 gap-1.5 text-(--text-secondary)", over && "border-white/20 bg-(--canvas)/70 backdrop-blur-sm")}>
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[kind])} aria-hidden="true" />
      {children}
    </Badge>
  );
}

/** `over`: laid on a picture, so it stands on the blurred canvas. */
export function StatusChip({ status, label, over = false }: { status: Status; label?: string; over?: boolean }) {
  const { t } = useT();
  return (
    <Chip kind={status} over={over}>
      {label ?? t(`status.${status}` as TKey)}
    </Chip>
  );
}

/** How many findings of this severity the observer reported (understand's error and warn, named as understand names them); nothing for none. */
export function FindingCount({ severity, count }: { severity: "error" | "warn"; count: number }) {
  const { t } = useT();
  if (!count) return null;
  return <Chip kind={severity}>{t("finding.count", { n: count, severity })}</Chip>;
}
