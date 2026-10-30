// A few more actions behind one button (Radix DropdownMenu: arrow keys, typeahead, Escape).
import * as Radix from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

export interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
}

/** `wide`: the trigger is its content, named by it (a picker such as the drama in view), not a ⋯ icon named by the label. */
export function Menu({ label, items, trigger, wide }: { label: string; items: MenuItem[]; trigger?: ReactNode; wide?: string }) {
  return (
    <Radix.Root>
      <Radix.Trigger asChild>
        <button type="button" className={wide ?? "ds-iconbtn"} aria-label={wide ? undefined : label} title={wide ? label : undefined}>
          {trigger ?? "⋯"}
        </button>
      </Radix.Trigger>
      <Radix.Portal>
        <Radix.Content className="ds-menu" align={wide ? "start" : "end"} sideOffset={4}>
          {items.map((item) => (
            <Radix.Item key={item.label} className="ds-menu-item" disabled={item.disabled} onSelect={item.run}>
              {item.label}
            </Radix.Item>
          ))}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
