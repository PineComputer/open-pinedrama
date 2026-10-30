// What was spent, against the budget when there is one: amber from 80%, seal red when spent. With
// no cap there is nothing to fill, so it shows what was spent and no bar.
const money = (usd: number) => `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (usd: number) => money(usd).replace(/\.00$/, "");

export function BudgetMeter({ spentUsd, budgetUsd }: { spentUsd: number; budgetUsd: number | null }) {
  if (budgetUsd === null) {
    return (
      <div className="ds-budget">
        <div className="row">
          <span>Spent</span>
          <b>{money(spentUsd)}</b>
        </div>
      </div>
    );
  }
  const out = spentUsd >= budgetUsd;
  const warn = !out && spentUsd >= budgetUsd * 0.8;
  return (
    <div className={`ds-budget ${out ? "out" : warn ? "warn" : ""}`}>
      <div className="row">
        <span>{out ? "Budget spent" : "Spent of budget"}</span>
        <b>{`${money(spentUsd)} of ${whole(budgetUsd)}`}</b>
      </div>
      <div className="bar" role="meter" aria-label="Spent of budget" aria-valuemin={0} aria-valuemax={budgetUsd} aria-valuenow={spentUsd}>
        <i style={{ width: `${Math.min(100, (spentUsd / budgetUsd) * 100)}%` }} />
      </div>
    </div>
  );
}
