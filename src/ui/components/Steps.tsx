// Named steps of a long piece of work (analyzing a screenplay, setting a drama up): which are done,
// the one under way, the one that waits for the maker, and those still to come. No percentage: the
// work doesn't know one.
export interface Step {
  title: string;
  detail?: string;
  state: "done" | "now" | "you" | "later";
  /** Time spent on it, as m:ss. */
  time?: string;
}

export function Steps({ label, steps }: { label: string; steps: Step[] }) {
  return (
    <ol className="ds-steps" aria-label={label}>
      {steps.map((step) => (
        <li key={step.title} className={`is-${step.state}`} aria-current={step.state === "now" ? "step" : undefined}>
          <span className="mk" aria-hidden="true">
            {step.state === "done" ? "✓" : step.state === "you" ? "!" : ""}
          </span>
          <div>
            <div className="t">{step.title}</div>
            {step.detail && <div className="d">{step.detail}</div>}
          </div>
          <span className="time">{step.time ?? ""}</span>
        </li>
      ))}
    </ol>
  );
}
