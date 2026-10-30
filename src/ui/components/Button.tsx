// shadcn/ui's Button (components/ui/button.tsx) with what the studio adds: an icon from its set, a
// busy state that can't be pressed twice, and the reason a disabled button gives, so the maker
// isn't left guessing. A link that looks like a button takes buttonVariants instead.
import { type ComponentProps, useId } from "react";
import { cn } from "cn";
import { Button as UiButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "./Tooltip.tsx";
import { Icon, type IconName } from "../icons.tsx";

export interface ButtonProps extends ComponentProps<typeof UiButton> {
  icon?: IconName;
  /** Under way: shown, announced, and not pressed again. */
  busy?: boolean;
  /** Disables the button and tells the maker why. */
  disabledReason?: string;
}

export function Button({ icon, busy = false, disabledReason, children, disabled, ...rest }: ButtonProps) {
  const reason = useId();
  // The reason sits beside the button, not in it, so it describes the button without renaming it.
  return (
    <>
      <UiButton type="button" {...rest} disabled={disabled || busy || disabledReason !== undefined} aria-busy={busy || undefined} aria-describedby={disabledReason ? reason : rest["aria-describedby"]}>
        {busy ? <Spinner aria-hidden="true" role={undefined} aria-label={undefined} /> : icon && <Icon name={icon} />}
        {children}
      </UiButton>
      {disabledReason && (
        <span id={reason} className="sr-only">
          {disabledReason}
        </span>
      )}
    </>
  );
}

/** An icon alone, named by its label, which the tooltip shows; `on`: the place or mode it opens is the one in view. */
export function IconButton({ label, icon, on, className, ...rest }: ComponentProps<typeof UiButton> & { label: string; icon: IconName; on?: boolean }) {
  return (
    <Tooltip text={label}>
      <UiButton type="button" variant="ghost" size="icon" {...rest} className={cn("ds-iconbtn text-(--text-secondary)", on && "bg-selected text-foreground", className)} aria-label={label}>
        <Icon name={icon} />
      </UiButton>
    </Tooltip>
  );
}
