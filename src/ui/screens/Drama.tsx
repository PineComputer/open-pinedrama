import type { AppInfo, DramaView, ReviewSummary, ReviewView } from "../../shared/types.ts";
import { StopCard } from "../components/StopCard.tsx";
import { Link } from "../router.tsx";
import { api, useAction, useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { Icon } from "../icons.tsx";
import { DramaBar, stillStopping } from "../shell/TopBar.tsx";
import { Analyzing } from "./Analyzing.tsx";
import { Board, SetupPanel } from "./Board.tsx";
import { Canvas } from "./Canvas.tsx";
import { Cast } from "./Cast.tsx";
import { Crew } from "./Crew.tsx";
import { CutTab } from "./CutTab.tsx";
import { Graph } from "../graph/Graph.tsx";
import { Episode } from "./Episode.tsx";
import { Script } from "./Script.tsx";
import { InboxList } from "./Inbox.tsx";
import { buttonVariants } from "@/components/ui/button";

/** What holds the drama up that the maker should know: it belongs to the other mode, or its Computers won't start. */
/** A stop waiting on the maker (a red line, a limit, another refusal), as the design's StopBanner shows it on every page of the drama. */
export function WaitingStop({ stop }: { stop: ReviewSummary }) {
  const { t } = useT();
  const { data } = useResource<ReviewView>(`/api/reviews/${stop.id}`, ["inbox"]);
  return (data?.refusals ?? []).map((refusal, n) => (
    <StopCard key={n} refusal={refusal} episode={stop.episode}>
      <Link className="btn sm primary" to={`/r/${stop.id}`}>
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
  const inbox = useResource<ReviewSummary[]>("/api/inbox", ["inbox"]);
  const stops = (inbox.data ?? []).filter((review) => review.dramaId === drama.id && review.stop);
  const elsewhere = app.data !== undefined && app.data.mode !== "none" && app.data.mode !== drama.mode;
  return (
    <>
      {elsewhere && <p className="notice">{t(drama.mode === "replay" ? "otherMode.replayNote" : "otherMode.pineNote")}</p>}
      {drama.rehearsal && !elsewhere && <p className="notice quiet-notice">{t("rehearsal.note")}</p>}
      {drama.atLimit !== undefined && !drama.stalled && <p className="notice">{t("limit.note", { n: drama.atLimit })}</p>}
      {stops.map((stop) => (
        <WaitingStop key={stop.id} stop={stop} />
      ))}
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
          <button className={buttonVariants({ variant: "outline", size: "sm" })} disabled={retry.busy} onClick={() => void retry.run()}>
            {t("stalled.retry")}
          </button>
        </div>
      )}
    </>
  );
}

/** A drama's page: what holds it up, its surface and chips, and the step or surface in view. The shell (App) loads the drama and gives its sidebar. */
export function Drama({ drama, tab, episode }: { drama: DramaView; tab: string; episode?: string }) {
  const { t } = useT();
  const id = drama.id;
  // Before there are episodes, the setup's progress is the story being made.
  const settingUp = drama.status === "setup" || (drama.status === "stopped" && !drama.episodeRows.length);
  return (
    <section className="ds-workin">
      {/* The cut's room is the design's Cut screen, with no surface bar above it. */}
      {tab !== "cut" && <DramaBar drama={drama} />}
      {tab !== "cut" && <Notices drama={drama} />}
      {tab === "board" && (settingUp ? <SetupPanel drama={drama} /> : <Board drama={drama} />)}
      {tab === "episode" && episode && <Episode key={`${id}/${episode}`} dramaId={id} code={episode} />}
      {tab === "script" && <Script dramaId={id} />}
      {tab === "analyzing" && <Analyzing dramaId={id} />}
      {tab === "story" && (settingUp ? <SetupPanel drama={drama} /> : <Cast dramaId={id} />)}
      {tab === "cut" && <CutTab dramaId={id} />}
      {tab === "canvas" && <Canvas drama={drama} />}
      {tab === "graph" && <Graph dramaId={id} />}
      {tab === "crew" && <Crew drama={drama} />}
      {tab === "inbox" && (
        <>
          <div className="work-head">
            <h2>{t("inbox.title")}</h2>
          </div>
          <InboxList dramaId={id} />
        </>
      )}
    </section>
  );
}
