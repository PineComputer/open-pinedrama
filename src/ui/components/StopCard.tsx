// A stop the agent asks the maker about because drama-cli refused (docs/REDESIGN_PLAN.md, P5.8;
// the pro direction's spec, "StopCard"): which kind of stop it is, from the refusal's code
// (shared/refusal.ts stopKind), the code, the config key for a cap, and what drama-cli said, word
// for word. The facts are the refusal's own, so they don't change while the maker decides; the
// maker answers the agent in their own words below it.
import { type Refusal, stopKind } from "../../shared/refusal.ts";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";

export function StopCard({ refusal }: { refusal: Refusal }) {
  const { t } = useT();
  const kind = stopKind(refusal);
  const title = kind.kind === "red-line" ? t("stopcard.redLine") : kind.kind === "cap" ? t("stopcard.cap", { key: kind.key }) : t("stopcard.ask");
  return (
    <section className={`ds-stopcard is-${kind.kind}`} aria-label={title}>
      <header>
        <Icon name={kind.kind === "red-line" ? "warning" : kind.kind === "cap" ? "lock-simple" : "info"} />
        {t(`stopcard.kind.${kind.kind}`)}
      </header>
      <div className="body">
        <h3>{title}</h3>
        <dl>
          <dt>{t("stopcard.code")}</dt>
          <dd className="mono">{refusal.code}</dd>
          {kind.kind === "cap" && (
            <>
              <dt>{t("stopcard.key")}</dt>
              <dd className="mono">{kind.key}</dd>
            </>
          )}
        </dl>
        <span className="said-label">{t("stopcard.said")}</span>
        <p className="said">{refusal.message}</p>
        <p className="note">{t(`stopcard.note.${kind.kind}`)}</p>
      </div>
    </section>
  );
}
