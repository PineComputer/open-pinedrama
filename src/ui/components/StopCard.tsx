// A stop the agent asks the maker about because drama-cli refused, ported from the design
// (design/screens.js, StopCard; studio.css .stopcard): which kind of stop it is, from the refusal's code
// (shared/refusal.ts stopKind), the code, the config key for a cap, and what drama-cli said, word
// for word. The facts are the refusal's own, so they don't change while the maker decides; the
// maker answers the agent in their own words below it.
import type { ReactNode } from "react";
import { type Refusal, stopKind } from "../../shared/refusal.ts";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";

/** A stop: the refusal, the episode it stopped (the header's right end) and what the maker can do about it (the design's acts). */
export function StopCard({ refusal, episode, children }: { refusal: Refusal; episode?: string; children?: ReactNode }) {
  const { t } = useT();
  const kind = stopKind(refusal);
  const title = kind.kind === "red-line" ? t("stopcard.redLine") : kind.kind === "cap" ? t("stopcard.cap", { key: kind.key }) : kind.kind === "env" ? t("stopcard.env") : t("stopcard.ask");
  // The design's StopCard (design/screens.js): a red line on the error's header; a cap, credentials or another refusal on a quiet one.
  const look = kind.kind === "red-line" ? "redline" : kind.kind === "cap" ? "cap" : "env";
  const icon = kind.kind === "red-line" ? "warning" : kind.kind === "cap" ? "stack" : kind.kind === "env" ? "lock-simple" : "info";
  return (
    <section className={`stopcard ${look}`} aria-label={title}>
      <header>
        <Icon name={icon} className="ic" />
        <span>{t(`stopcard.kind.${kind.kind}`)}</span>
        <span className="fill" />
        {episode && <span className="mono">{episode}</span>}
      </header>
      <div className="sbody">
        <h2>{title}</h2>
        <dl className="kv">
          <dt>{t("stopcard.code")}</dt>
          <dd className="mono">{refusal.code}</dd>
          {kind.kind === "cap" && (
            <>
              <dt>{t("stopcard.key")}</dt>
              <dd className="mono">{kind.key}</dd>
            </>
          )}
          <dt>{t("stopcard.said")}</dt>
          <dd className="said mono">{refusal.message}</dd>
        </dl>
        <div className="acts">
          {children}
          <span className="muted" style={{ fontSize: 11.5 }}>
            {t(`stopcard.note.${kind.kind}`)}
          </span>
        </div>
      </div>
    </section>
  );
}
