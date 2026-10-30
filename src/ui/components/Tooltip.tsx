// A short label for a control, on hover and on keyboard focus: shadcn/ui's Tooltip, with its own
// provider, so a screen rendered alone (in a test, in the gallery) needs none around it.
import type { ReactNode } from "react";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <UiTooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent sideOffset={6}>{text}</TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}
