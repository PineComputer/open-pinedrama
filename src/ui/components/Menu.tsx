// A few more actions behind one button: shadcn/ui's DropdownMenu.
import type { ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
}

/** `wide`: the trigger is its content, named by it (a picker such as the drama in view), not a ⋯ icon named by the label. */
export function Menu({ label, items, trigger, wide }: { label: string; items: MenuItem[]; trigger?: ReactNode; wide?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {wide ? (
          <button type="button" className={wide} title={label}>
            {trigger}
          </button>
        ) : (
          <button type="button" className="ibtn" aria-label={label}>
            {trigger ?? "⋯"}
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={wide ? "start" : "end"} className="min-w-50">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} disabled={item.disabled} onSelect={item.run}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
