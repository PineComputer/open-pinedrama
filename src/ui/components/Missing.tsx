// An episode or item the drama doesn't have (Codex's rebuttal, IA §14.1), with the way back to the drama: the drama
// page's check, and Script's for the screenplay version a link names.
import { Link } from "@tanstack/react-router";
import { useT } from "../i18n.ts";
import { EmptyState } from "./EmptyState.tsx";

export function Missing({ dramaId, what }: { dramaId: string; what: string }) {
  const { t } = useT();
  return (
    <EmptyState title={t("notFound.title")} action={<Link className="btn primary" to="/d/$dramaId/episodes" params={{ dramaId }}>{t("notFound.drama")}</Link>}>
      {t("notFound.object", { what })}
    </EmptyState>
  );
}
