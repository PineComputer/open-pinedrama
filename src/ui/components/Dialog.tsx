// A question the maker answers before anything happens (Radix Dialog: focus kept inside, Escape
// closes, focus goes back to what opened it).
import * as Radix from "@radix-ui/react-dialog";
import { type ReactNode, useEffect, useRef } from "react";
import { useT } from "../i18n.ts";
import { Button } from "./Button.tsx";

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
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Portal>
        <Radix.Overlay className="ds-scrim" />
        <Radix.Content
          className="ds-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <Radix.Title>{title}</Radix.Title>
          <Radix.Description>{description}</Radix.Description>
          {children}
          <div className="acts">
            <Radix.Close asChild>
              <Button>{cancel ?? t("dialog.cancel")}</Button>
            </Radix.Close>
            {confirm && (
              <Button
                variant={confirm.danger ? "seal" : "primary"}
                onClick={() => {
                  onOpenChange(false);
                  confirm.run();
                }}
              >
                {confirm.label}
              </Button>
            )}
          </div>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
