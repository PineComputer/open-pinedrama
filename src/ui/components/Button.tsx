// design/'s buttons (studio.css .btn and .ibtn; design/SPEC.md, Button and IconButton) with what the
// studio adds: an icon from its set, a busy state that can't be pressed twice, and the reason a disabled
// button gives, so the maker isn't left guessing. A link that looks like a button takes buttonClass.
import { type ComponentProps, useId } from "react";
import { cn } from "cn";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "./Tooltip.tsx";
import { Icon, type IconName } from "../icons.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/** design/'s classes for a button of this variant and size; secondary and md are the plain .btn. */
export function buttonClass({ variant = "secondary", size = "md" }: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  return cn("btn", variant !== "secondary" && variant, size !== "md" && size);
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Under way: shown, announced, and not pressed again. */
  busy?: boolean;
  /** Disables the button and tells the maker why. */
  disabledReason?: string;
}

export function Button({ variant, size, icon, busy = false, disabledReason, children, disabled, className, ...rest }: ButtonProps) {
  const reason = useId();
  // The reason sits beside the button, not in it, so it describes the button without renaming it.
  return (
    <>
      <button
        type="button"
        {...rest}
        className={cn(buttonClass({ variant, size }), className)}
        disabled={disabled || busy || disabledReason !== undefined}
        aria-busy={busy || undefined}
        aria-describedby={disabledReason ? reason : rest["aria-describedby"]}
      >
        {busy ? <Spinner aria-hidden="true" role={undefined} aria-label={undefined} className="ic" /> : icon && <Icon name={icon} className="ic" />}
        {children}
      </button>
      {disabledReason && (
        <span id={reason} className="sr-only">
          {disabledReason}
        </span>
      )}
    </>
  );
}

/** An icon alone, named by its label, which the tooltip shows; `on`: the place or mode it opens is the one in view. */
export function IconButton({ label, icon, on, className, ...rest }: ComponentProps<"button"> & { label: string; icon: IconName; on?: boolean }) {
  return (
    <Tooltip text={label}>
      <button type="button" {...rest} className={cn("ibtn", on && "on", className)} aria-label={label}>
        <Icon name={icon} className="ic" />
      </button>
    </Tooltip>
  );
}
