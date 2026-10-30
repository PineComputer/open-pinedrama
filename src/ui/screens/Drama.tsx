import { useState } from "react";
import type { AppInfo, DramaView } from "../../shared/types.ts";
import { api, useAction, useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { ReviewingChoice } from "../Reviewing.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Link, usePath } from "../router.tsx";
import { StatusBar } from "../shell/StatusBar.tsx";
import { type Step, StepRail } from "../shell/StepRail.tsx";
import { Board, SetupPanel } from "./Board.tsx";
import { Cast } from "./Cast.tsx";
import { Chat } from "./Chat.tsx";
import { Crew } from "./Crew.tsx";
import { Delivery } from "./Delivery.tsx";
import { Episode } from "./Episode.tsx";
import { Script } from "./Script.tsx";
import { InboxList } from "./Inbox.tsx";

/** How many episodes run at once, and how many share a Computer: changed in place. Or the line stops. */
function Tune({ drama, onDone }: { drama: DramaView; onDone: () => void }) {
  const { t } = useT();
  const [parallel, setParallel] = useState(drama.parallel);
  const [perComputer, setPerComputer] = useState(drama.perComputer);
  const [reviewing, setReviewing] = useState(drama.reviewing);
  const [stopping, setStopping] = useState(false);
  const stop = useAction(async () => {
    await api(`/api/dramas/${drama.id}/stop`, { method: "POST" });
    onDone();
  });
  const save = async () => {
    await api(`/api/dramas/${drama.id}`, { method: "PATCH", json: { parallel, perComputer, reviewing } });
    onDone();
  };
  return (
    <div className="tune">
      <div className="field">
        <label className="label" htmlFor="parallel">
          {t("new.parallel")}
        </label>
        <input id="parallel" className="line-input num" type="number" min={1} max={50} value={parallel} onChange={(event) => setParallel(Number(event.target.value))} />
      </div>
      <div className="field">
        <span className="label">{t("new.perComputer")}</span>
        <div className="options">
          {[1, 2, 3].map((n) => (
            <button key={n} aria-pressed={perComputer === n} className={perComputer === n ? "on" : ""} onClick={() => setPerComputer(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <ReviewingChoice value={reviewing} onChange={setReviewing} />
      <div className="tune-actions">
        <button className="btn ink small" onClick={save}>
          {t("tune.save")}
        </button>
        <button className="link" onClick={onDone}>
          {t("tune.cancel")}
        </button>
      </div>
      {(drama.status === "setup" || drama.status === "production") && (
        <div className="tune-stop">
          {stopping ? (
            <>
              <p className="small">{t("stop.confirm")}</p>
              <div className="tune-actions">
                <button className="btn small" disabled={stop.busy} onClick={() => void stop.run()}>
                  {t("stop.yes")}
                </button>
                <button className="link" onClick={() => setStopping(false)}>
                  {t("tune.cancel")}
                </button>
              </div>
              {stop.error !== undefined && <p className="error small">{errorText(stop.error, t)}</p>}
            </>
          ) : (
            <button className="link quiet" onClick={() => setStopping(true)}>
              {t("stop.drama")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** What holds the drama up that the maker should know: it belongs to the other mode, or its Computers won't start. */
function Notices({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const retry = useAction(() => api(`/api/dramas/${drama.id}/computers/retry`, { method: "POST" }));
  const again = useAction(() => api(`/api/dramas/${drama.id}/resume`, { method: "POST" }));
  const rehearse = useAction(() => api(`/api/dramas/${drama.id}/rehearse`, { method: "POST" }));
  // Held during production (the setup panel says so before there are episodes).
  const held = drama.status === "stopped" && drama.episodeRows.length > 0;
  const elsewhere = app.data !== undefined && app.data.mode !== "none" && app.data.mode !== drama.mode;
  return (
    <>
      {elsewhere && <p className="notice">{t(drama.mode === "replay" ? "otherMode.replayNote" : "otherMode.pineNote")}</p>}
      {drama.rehearsal && !elsewhere && <p className="notice quiet-notice">{t("rehearsal.note")}</p>}
      {drama.atLimit !== undefined && !drama.stalled && <p className="notice">{t("limit.note", { n: drama.atLimit })}</p>}
      {held && (
        <div className="notice trouble">
          <div>
            <strong>{drama.setup.reason ? t(`setup.held.${drama.setup.reason}`) : drama.setup.note ?? t("board.stopped")}</strong>
            {drama.setup.reason === "no-drama-skill" && <div className="why">{t("setup.rehearseHint")}</div>}
            {[again.error, rehearse.error].map((failed, n) => failed !== undefined && <div key={n} className="error small">{errorText(failed, t)}</div>)}
          </div>
          <span className="notice-actions">
            <button className="btn small" disabled={again.busy} onClick={() => void again.run()}>
              {t("setup.retry")}
            </button>
            {drama.setup.reason === "no-drama-skill" && (
              <button className="btn small" disabled={rehearse.busy} onClick={() => void rehearse.run()}>
                {t("setup.rehearse")}
              </button>
            )}
          </span>
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
          <button className="btn small" disabled={retry.busy} onClick={() => void retry.run()}>
            {t("stalled.retry")}
          </button>
        </div>
      )}
    </>
  );
}

export function Drama({ id, tab, episode }: { id: string; tab: string; episode?: string }) {
  const { t, lang } = useT();
  const { data: drama, error } = useResource<DramaView>(`/api/dramas/${id}`, [`drama:${id}`]);
  const [talking, setTalking] = useState(false);
  const [tuning, setTuning] = useState(false);

  if (error !== undefined && !drama) {
    return (
      <main className="page">
        <p className="error">{errorText(error, t)}</p>
      </main>
    );
  }
  if (!drama) return <main className="page quiet">{t("loading")}</main>;

  const { episodes } = drama;
  // Before there are episodes, the setup's progress is the story being made.
  const settingUp = drama.status === "setup" || (drama.status === "stopped" && !drama.episodeRows.length);
  const step: Step = tab === "script" ? "script" : tab === "story" || (tab === "board" && settingUp) ? "story" : tab === "cut" ? "cut" : "episodes";

  return (
    <div className="ds-shell">
      <StepRail drama={drama} step={step} episode={episode}>
        <Link to={`/d/${id}/inbox`} aria-current={tab === "inbox" ? "page" : undefined}>
          {t("section.inbox")}
          {drama.waiting > 0 && <span className="count">{drama.waiting}</span>}
        </Link>
        <Link to={`/d/${id}/crew`} aria-current={tab === "crew" ? "page" : undefined}>
          {t("section.crew")}
        </Link>
        {tuning ? (
          <Tune drama={drama} onDone={() => setTuning(false)} />
        ) : (
          <button className="link" onClick={() => setTuning(true)}>
            {t("rail.tune")}:{" "}
            {episodes.total > 0 && drama.parallel >= episodes.total
              ? t("rail.tuneAll", { n: episodes.total, c: drama.perComputer })
              : t("rail.tuneValue", { p: drama.parallel, c: drama.perComputer })}
          </button>
        )}
        <button className="ds-btn is-secondary is-s32" onClick={() => setTalking((open) => !open)}>
          {t("rail.talk")}
        </button>
      </StepRail>

      <div className="ds-work">
      <section className="ds-workin">
        <Notices drama={drama} />
        {tab === "board" && (settingUp ? <SetupPanel drama={drama} /> : <Board drama={drama} />)}
        {tab === "episode" && episode && <Episode key={`${id}/${episode}`} dramaId={id} code={episode} />}
        {tab === "script" && <Script dramaId={id} />}
        {tab === "story" && (settingUp ? <SetupPanel drama={drama} /> : <Cast dramaId={id} />)}
        {tab === "cut" && <Delivery dramaId={id} />}
        {(tab === "canvas" || tab === "graph") && <SurfaceToCome surface={tab} />}
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
      <StatusBar drama={drama} />
      </div>
      {talking && <Chat dramaId={id} onClose={() => setTalking(false)} />}
    </div>
  );
}

/** Canvas and Graph, not built yet: what they will show, and what is selected for them. */
function SurfaceToCome({ surface }: { surface: "canvas" | "graph" }) {
  const { t } = useT();
  const { query } = usePath();
  const item = query.get("item");
  return (
    <EmptyState title={t(surface === "canvas" ? "surface.canvas" : "surface.graph")}>
      {t(surface === "canvas" ? "surface.canvasSoon" : "surface.graphSoon")}
      {item && ` ${t("surface.selected", { item })}`}
    </EmptyState>
  );
}
