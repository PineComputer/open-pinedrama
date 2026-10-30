// Buttons: pills in the pro direction's variants and sizes (docs/REDESIGN_PLAN.md, P2.2; its spec,
// "Button"). A disabled button says why, so the maker isn't left guessing; a busy one says so and
// can't be pressed twice.
import { type ButtonHTMLAttributes, useId } from "react";
import { Icon, type IconName } from "../icons.tsx";
import { Tooltip } from "./Tooltip.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 26, 32 and 40 pixels high. */
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  /** Under way: shown, announced, and not pressed again. */
  busy?: boolean;
  /** Disables the button and tells the maker why. */
  disabledReason?: string;
}

export function Button({ variant = "secondary", size = "md", icon, busy = false, disabledReason, className, children, disabled, ...rest }: ButtonProps) {
  const reason = useId();
  // The reason sits beside the button, not in it, so it describes the button without renaming it.
  return (
    <>
      <button
        type="button"
        {...rest}
        className={["ds-btn", `is-${variant}`, `is-${size}`, className].filter(Boolean).join(" ")}
        disabled={disabled || busy || disabledReason !== undefined}
        aria-busy={busy || undefined}
        aria-describedby={disabledReason ? reason : rest["aria-describedby"]}
      >
        {busy ? <span className="spin" aria-hidden="true" /> : icon && <Icon name={icon} />}
        {children}
      </button>
      {disabledReason && (
        <span id={reason} className="sr">
          {disabledReason}
        </span>
      )}
    </>
  );
}

export function IconButton({ label, icon, on, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: IconName; on?: boolean }) {
  return (
    <Tooltip text={label}>
      <button type="button" {...rest} className={["ds-iconbtn", on && "is-on", rest.className].filter(Boolean).join(" ")} aria-label={label}>
        <Icon name={icon} />
      </button>
    </Tooltip>
  );
}
