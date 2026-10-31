// One choice among a few, all in view: design/'s .seg (studio.css; design/SPEC.md, Segmented), drawn by
// Radix's ToggleGroup primitive, single choice, which can't be left with none and moves by arrow keys.
import { ToggleGroup } from "radix-ui";
import { Icon, type IconName } from "../icons.tsx";

export interface Option<V extends string> {
  value: V;
  label: string;
  icon?: IconName;
  count?: number;
}

export function Segmented<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Option<V>[]; onChange: (value: V) => void }) {
  return (
    <ToggleGroup.Root type="single" aria-label={label} value={value} onValueChange={(next) => next && onChange(next as V)} className="seg">
      {options.map((option) => (
        <ToggleGroup.Item key={option.value} value={option.value}>
          {option.icon && <Icon name={option.icon} className="ic" />}
          {option.label}
          {option.count !== undefined && <small className="muted">{option.count}</small>}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
