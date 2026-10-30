// What was spent, against the budget when there is one: amber from 80%, seal red when spent. With
// no cap there is nothing to fill, so it shows what was spent and no bar. In replay the figures are
// the recording's, so they are marked simulated and never read as a charge.
import { useT } from "../i18n.ts";

const money = (usd: number) => `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (usd: number) => money(usd).replace(/\.00$/, "");

export function BudgetMeter({ spentUsd, budgetUsd, simulated = false }: { spentUsd: number; budgetUsd: number | null; simulated?: boolean }) {
  const { t } = useT();
  if (budgetUsd === null) {
    return (
      <div className="ds-budget">
        <div className="row">
          <span>{t(simulated ? "budget.simulated" : "budget.spent")}</span>
          <b>{money(spentUsd)}</b>
        </div>
      </div>
    );
  }
  const out = spentUsd >= budgetUsd;
  const warn = !out && spentUsd >= budgetUsd * 0.8;
  return (
    <div className={`ds-budget ${out ? "is-out" : warn ? "is-warn" : ""}`}>
      <div className="row">
        <span>{t(simulated ? "budget.simulated" : out ? "budget.out" : "budget.spentOf")}</span>
        <b>{t("budget.of", { spent: money(spentUsd), budget: whole(budgetUsd) })}</b>
      </div>
      <div className="bar" role="meter" aria-label={t("budget.spentOf")} aria-valuemin={0} aria-valuemax={budgetUsd} aria-valuenow={spentUsd}>
        <i style={{ width: `${Math.min(100, (spentUsd / budgetUsd) * 100)}%` }} />
      </div>
    </div>
  );
}
