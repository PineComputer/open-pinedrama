// A question the maker answers before anything happens: shadcn/ui's AlertDialog (focus kept inside,
// Escape closes, focus goes back to what opened it).
import { type ReactNode, useEffect, useRef } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancel ?? t("dialog.cancel")}</AlertDialogCancel>
          {confirm && (
            <AlertDialogAction variant={confirm.danger ? "destructive" : "default"} onClick={confirm.run}>
              {confirm.label}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
