// Where the drama stands, in one line at the foot of the work area.
import type { DramaView } from "../../shared/types.ts";
import { useT } from "../i18n.ts";

export function StatusBar({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const { episodes } = drama;
  return (
    <div className="ds-statusbar" role="status" aria-label={t("statusbar.label")}>
      <span>{t("statusbar.finished", { done: episodes.done, total: episodes.total })}</span>
      <span>{t("statusbar.atWork", { n: episodes.working })}</span>
      <span>{t("statusbar.waiting", { n: episodes.waiting })}</span>
    </div>
  );
}
