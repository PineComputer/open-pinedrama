// A few more actions behind one button (Radix DropdownMenu: arrow keys, typeahead, Escape).
import * as Radix from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

export interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
}

export function Menu({ label, items, trigger }: { label: string; items: MenuItem[]; trigger?: ReactNode }) {
  return (
    <Radix.Root>
      <Radix.Trigger asChild>
        <button type="button" className="ds-iconbtn" aria-label={label}>
          {trigger ?? "⋯"}
        </button>
      </Radix.Trigger>
      <Radix.Portal>
        <Radix.Content className="ds-menu" align="end" sideOffset={4}>
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
