// Buttons: the variants and sizes of the design (docs/REDESIGN_PLAN.md, P2.2). A disabled button
// says why, so the maker isn't left guessing; a busy one says so and can't be pressed twice.
import { type ButtonHTMLAttributes, type ReactNode, useId } from "react";
import { Tooltip } from "./Tooltip.tsx";

export type ButtonVariant = "primary" | "secondary" | "text" | "danger" | "seal";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 32 | 36 | 40;
  /** Under way: shown, announced, and not pressed again. */
  busy?: boolean;
  /** Disables the button and tells the maker why. */
  disabledReason?: string;
}

export function Button({ variant = "secondary", size = 36, busy = false, disabledReason, className, children, disabled, ...rest }: ButtonProps) {
  const reason = useId();
  // The reason sits beside the button, not in it, so it describes the button without renaming it.
  return (
    <>
      <button
        type="button"
        {...rest}
        className={["ds-btn", `is-${variant}`, `is-s${size}`, className].filter(Boolean).join(" ")}
        disabled={disabled || busy || disabledReason !== undefined}
        aria-busy={busy || undefined}
        aria-describedby={disabledReason ? reason : rest["aria-describedby"]}
      >
        {busy && <span className="spin" aria-hidden="true" />}
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

export function IconButton({ label, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode }) {
  return (
    <Tooltip text={label}>
      <button type="button" {...rest} className={["ds-iconbtn", rest.className].filter(Boolean).join(" ")} aria-label={label}>
        {icon}
      </button>
    </Tooltip>
  );
}
