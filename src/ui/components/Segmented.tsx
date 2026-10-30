// One choice among a few, all in view (Studio · Canvas · Graph, Wall · Sheet): shadcn/ui's ToggleGroup,
// single choice, which can't be left with none.
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon, type IconName } from "../icons.tsx";

export interface Option<V extends string> {
  value: V;
  label: string;
  icon?: IconName;
  count?: number;
}

export function Segmented<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Option<V>[]; onChange: (value: V) => void }) {
  return (
    <ToggleGroup type="single" aria-label={label} value={value} onValueChange={(next) => next && onChange(next as V)} spacing={0} variant="outline" size="sm" className="ds-seg">
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.icon && <Icon name={option.icon} />}
          {option.label}
          {option.count !== undefined && <span className="text-muted-foreground tabular-nums">{option.count}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
