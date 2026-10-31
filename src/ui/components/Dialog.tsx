// A question the maker answers before anything happens: Radix's AlertDialog (focus kept inside, Escape
// closes, focus goes back to what opened it). A danger is filled, as the design's is (studio.css .dialog .btn.danger).
import { type ReactNode, useEffect, useRef } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useT } from "../i18n.ts";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  cancel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirm?: { label: string; run: () => void; danger?: boolean };
  cancel?: string;
  children?: ReactNode;
}) {
  // A dialog opened by the screen rather than a trigger of its own gives focus back to whatever
  // had it when it opened.
  const { t } = useT();
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null;
  }, [open]);
  // The design's dialog (design/app.js, Dialog; studio.css .scrim, .dialog), drawn by Radix's AlertDialog
  // primitive with its content inside the overlay, as Radix's scrollable-overlay example nests them.
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="scrim">
          <AlertDialogPrimitive.Content
            className="dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
          >
            <AlertDialogPrimitive.Title asChild>
              <h2>{title}</h2>
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description asChild>
              <p>{description}</p>
            </AlertDialogPrimitive.Description>
            {children}
            <div className="acts">
              <AlertDialogPrimitive.Cancel className="btn">{cancel ?? t("dialog.cancel")}</AlertDialogPrimitive.Cancel>
              {confirm && (
                <AlertDialogPrimitive.Action
                  className={`btn ${confirm.danger ? "danger" : "primary"}`}
                  onClick={confirm.run}
                >
                  {confirm.label}
                </AlertDialogPrimitive.Action>
              )}
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Overlay>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
