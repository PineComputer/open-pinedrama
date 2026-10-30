// One choice among a few, all in view: Studio · Canvas · Graph, Wall · Sheet.
import { Icon, type IconName } from "../icons.tsx";

export interface Option<V extends string> {
  value: V;
  label: string;
  icon?: IconName;
  count?: number;
}

export function Segmented<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Option<V>[]; onChange: (value: V) => void }) {
  return (
    <div className="ds-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.icon && <Icon name={option.icon} />}
          {option.label}
          {option.count !== undefined && <span className="count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
