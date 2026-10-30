// What was spent, against the budget when there is one (shadcn/ui's Progress): amber from 80%, red
// when spent. With no cap there is nothing to fill, so it shows what was spent and no bar. In
// replay the figures are the recording's, so they are marked simulated and never read as a charge.
import { cn } from "cn";
import { Progress } from "@/components/ui/progress";
import { useT } from "../i18n.ts";

const money = (usd: number) => `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (usd: number) => money(usd).replace(/\.00$/, "");

/** `inFlightUsd`: what drama-cli has reserved for calls still out (status.json's budget.reserved_usd). */
export function BudgetMeter({ spentUsd, budgetUsd, inFlightUsd, simulated = false }: { spentUsd: number; budgetUsd: number | null; inFlightUsd?: number; simulated?: boolean }) {
  const { t } = useT();
  const out = budgetUsd !== null && spentUsd >= budgetUsd;
  const warn = budgetUsd !== null && !out && spentUsd >= budgetUsd * 0.8;
  return (
    <div className="grid min-w-37.5 gap-1.5">
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{t(simulated ? "budget.simulated" : out ? "budget.out" : "budget.spent")}</span>
        <b className="font-mono font-semibold text-foreground">
          {money(spentUsd)}
          {budgetUsd !== null && <span className="font-medium text-muted-foreground"> / {whole(budgetUsd)}</span>}
        </b>
      </div>
      {budgetUsd !== null && (
        <Progress
          aria-label={t("budget.spentOf")}
          value={Math.min(100, (spentUsd / budgetUsd) * 100)}
          className={cn("bg-border", out ? "*:bg-destructive" : warn ? "*:bg-warning" : "*:bg-foreground")}
        />
      )}
      {inFlightUsd !== undefined && inFlightUsd > 0 && <span className="text-xs text-muted-foreground">{t("budget.inFlight", { money: money(inFlightUsd) })}</span>}
    </div>
  );
}
