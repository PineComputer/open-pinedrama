// A short label for a control, on hover and on keyboard focus (Radix Tooltip: positioning and
// focus handling).
import * as Radix from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Radix.Provider delayDuration={300}>
      <Radix.Root>
        <Radix.Trigger asChild>{children}</Radix.Trigger>
        <Radix.Portal>
          <Radix.Content className="ds-tooltip" sideOffset={6}>
            {text}
          </Radix.Content>
        </Radix.Portal>
      </Radix.Root>
    </Radix.Provider>
  );
}
