// Tabs with their panel (WAI-ARIA tabs pattern): one tab in the Tab order, arrows move and select.
import { type ReactNode, useId, useRef } from "react";
import type { Option } from "./Segmented.tsx";

/** `end`: what stands at the end of the tabs' row, such as a search box; it is not a tab. */
export function Tabs<V extends string>({ label, value, tabs, onChange, end, children }: { label: string; value: V; tabs: Option<V>[]; onChange: (value: V) => void; end?: ReactNode; children: ReactNode }) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const move = (by: number) => {
    const at = tabs.findIndex((tab) => tab.value === value);
    const next = tabs[(at + by + tabs.length) % tabs.length];
    onChange(next.value);
    list.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div className="ds-tabs-wrap">
      <div className="ds-tabs-row">
      <div
        ref={list}
        className="ds-tabs"
        role="tablist"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") move(1);
          else if (event.key === "ArrowLeft") move(-1);
          else return;
          event.preventDefault();
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`${id}-${tab.value}`}
            data-value={tab.value}
            aria-selected={tab.value === value}
            aria-controls={`${id}-panel`}
            tabIndex={tab.value === value ? 0 : -1}
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
            {tab.count !== undefined && <span className="count">{tab.count}</span>}
          </button>
        ))}
      </div>
      {end}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`}>
        {children}
      </div>
    </div>
  );
}
