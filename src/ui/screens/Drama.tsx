import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { AppInfo, DramaView, ReviewSummary, ReviewView } from "../../shared/types.ts";
import { StopCard } from "../components/StopCard.tsx";
import { type Page, usePlace } from "../place.ts";
import { api, useAction, useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { Icon } from "../icons.tsx";
import { DramaBar, stillStopping } from "../shell/TopBar.tsx";
import { buttonClass } from "../components/Button.tsx";

/** What holds the drama up that the maker should know: it belongs to the other mode, or its Computers won't start. */
/** A stop waiting on the maker (a red line, a limit, another refusal), as the design's StopBanner shows it on every page of the drama. */
export function WaitingStop({ stop }: { stop: ReviewSummary }) {
  const { t } = useT();
  const { data } = useResource<ReviewView>(`/api/reviews/${stop.id}`, ["reviews"]);
  return (data?.refusals ?? []).map((refusal, n) => (
    <StopCard key={n} refusal={refusal} episode={stop.episode}>
      <Link className="btn sm primary" to="/r/$reviewId" params={{ reviewId: stop.id }}>
        {t("stopcard.decide")}
      </Link>
    </StopCard>
  ));
}

function Notices({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const retry = useAction(() => api(`/api/dramas/${drama.id}/computers/retry`, { method: "POST" }));
  const again = useAction(() => api(`/api/dramas/${drama.id}/resume`, { method: "POST" }));
  const rehearse = useAction(() => api(`/api/dramas/${drama.id}/rehearse`, { method: "POST" }));
  // Held during production (the setup panel says so before there are episodes).
  const held = drama.status === "stopped" && drama.episodeRows.length > 0;
  const queue = useResource<ReviewSummary[]>("/api/reviews", ["reviews"]);
  const place = usePlace();
  const stops = (queue.data ?? []).filter((review) => review.dramaId === drama.id && review.stop);
  const elsewhere = app.data !== undefined && app.data.mode !== "none" && app.data.mode !== drama.mode;
  return (
    <>
      {elsewhere && <p className="notice">{t(drama.mode === "replay" ? "otherMode.replayNote" : "otherMode.pineNote")}</p>}
      {drama.rehearsal && !elsewhere && <p className="notice quiet-notice">{t("rehearsal.note")}</p>}
      {drama.atLimit !== undefined && !drama.stalled && <p className="notice">{t("limit.note", { n: drama.atLimit })}</p>}
      {/* IA §10: a stop in one episode is the full StopCard in that episode only; elsewhere a compact notice that opens it
          (design/app.js, StopBanner). A stop of the whole drama (no episode) is the full card on every page. */}
      {stops.map((stop) =>
        stop.episode && stop.episode !== place?.episode ? (
          <div key={stop.id} className="notice-red" role="status">
            <Icon name="warning" className="ic" />
            <span>
              <b>{t(stop.stop?.kind === "red-line" ? "stop.elsewhereRedLine" : "stop.elsewhere", { episode: stop.episode })}</b> {t("stop.othersCarryOn")}
            </span>
            <span className="grow" />
            <Link className="btn sm" to="/d/$dramaId/e/$episodeCode/canvas" params={{ dramaId: drama.id, episodeCode: stop.episode }}>
              {t("stop.openEpisode", { episode: stop.episode })}
            </Link>
          </div>
        ) : (
          <WaitingStop key={stop.id} stop={stop} />
        ),
      )}
      {/* The design's StopBanner (design/app.js): dashed while its Computers stop, solid once stopped, with Resume. */}
      {stillStopping(drama) && (
        <div className="banner" role="status">
          <Icon name="circle-notch" className="ic" />
          <b>{t("stop.banner")}</b>
        </div>
      )}
      {held && !stillStopping(drama) && (
        <div className="banner done">
          <b>{t("stop.isStopped", { title: drama.title })}</b>
          <span className="grow">
            {drama.setup.reason ? t(`setup.held.${drama.setup.reason}`) : drama.setup.note ?? t("board.stopped")}
            {drama.setup.reason === "no-drama-skill" && ` ${t("setup.rehearseHint")}`}
          </span>
          {[again.error, rehearse.error].map((failed, n) => failed !== undefined && <span key={n} className="error small">{errorText(failed, t)}</span>)}
          {drama.setup.reason === "no-drama-skill" && (
            <button type="button" className="btn sm" disabled={rehearse.busy} onClick={() => void rehearse.run()}>
              {t("setup.rehearse")}
            </button>
          )}
          <button type="button" className="btn sm primary" disabled={again.busy} onClick={() => void again.run()}>
            {t("setup.retry")}
          </button>
        </div>
      )}
      {drama.stalled && (
        <div className="notice trouble">
          <div>
            <strong>{t("stalled.title")}</strong>
            <div className="why">
              {drama.stalled.computer}: {drama.stalled.error}
            </div>
            {retry.error !== undefined && <div className="error small">{errorText(retry.error, t)}</div>}
          </div>
          <button className={buttonClass({ size: "sm" })} disabled={retry.busy} onClick={() => void retry.run()}>
            {t("stalled.retry")}
          </button>
        </div>
      )}
    </>
  );
}

/** A drama's page: what holds it up, its surface and chips, and the page in view (routes.tsx). The shell (App) loads the drama and gives its sidebar. */
export function Drama({ drama, page, children }: { drama: DramaView; page: Page | undefined; children: ReactNode }) {
  // The cut's room is the design's Cut screen: no surface bar above it.
  const room = page === "cut" || page === "delivery";
  return (
    <section className="ds-workin">
      {!room && <DramaBar drama={drama} />}
      {!room && <Notices drama={drama} />}
      {children}
    </section>
  );
}
