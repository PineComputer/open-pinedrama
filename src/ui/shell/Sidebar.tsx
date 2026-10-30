// The sidebar beside the rail, in the pro direction (its spec, "Sidebar"), collapsible from the
// rail. On the studio's pages: its places. In a drama: the drama, its steps Script · Story ·
// Episodes · Cut, each marked with what needs the maker, the episode tree under Episodes with
// where each stands, the drama's review queue, Computers and production line, and at the foot
// what it has spent and where it stands.
import { useState } from "react";
import type { DramaView, EpisodeRow } from "../../shared/types.ts";
import { api, useAction } from "../api.ts";
import { BudgetMeter } from "../components/BudgetMeter.tsx";
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, nowText, SETUP_STEPS } from "../labels.ts";
import { Mark } from "../Mark.tsx";
import { ReviewingChoice } from "../Reviewing.tsx";
import { Link } from "../router.tsx";

export type Step = "script" | "story" | "episodes" | "cut";

const STEPS: { step: Step; label: TKey; path: string; icon: IconName }[] = [
  { step: "script", label: "step.script", path: "script", icon: "file-text" },
  { step: "story", label: "step.story", path: "story", icon: "users" },
  { step: "episodes", label: "step.episodes", path: "", icon: "film-strip" },
  { step: "cut", label: "step.cut", path: "cut", icon: "scissors" },
];

type Mark = "you" | "work" | "done" | "line";

function markOf(row: EpisodeRow): Mark {
  if (row.state === "waiting" || row.state === "stopped" || row.state === "failed") return "you";
  if (row.state === "working") return "work";
  return row.state === "done" ? "done" : "line";
}

/** The step a drama's page is on: before there are episodes, its board is the story being made. */
export function stepOf(drama: DramaView, tab: string): Step | undefined {
  const settingUp = drama.status === "setup" || (drama.status === "stopped" && !drama.episodeRows.length);
  if (tab === "script") return "script";
  if (tab === "story" || (tab === "board" && settingUp)) return "story";
  if (tab === "cut") return "cut";
  return tab === "board" || tab === "episode" ? "episodes" : undefined;
}

function Item({ to, icon, label, current, count }: { to: string; icon: IconName; label: string; current: boolean; count?: number }) {
  return (
    <Link to={to} className="ds-navi" aria-current={current ? "page" : undefined}>
      <Icon name={icon} />
      <span>{label}</span>
      {count !== undefined && count > 0 && <> <span className="ds-navi-count">{count}</span></>}
    </Link>
  );
}

/** The studio's pages: the dramas, the review queue, settings. */
export function HomeSidebar({ path, waiting, replay }: { path: string; waiting: number; replay: boolean }) {
  const { t } = useT();
  return (
    <aside className="ds-sidebar" aria-label={t("sidebar.label")}>
      <div className="ds-sidebar-head">
        <span className="ds-brand">
          <Mark size={30} />
          <b>{t("app.name")}</b>
        </span>
      </div>
      <nav className="ds-sidebar-scroll" aria-label={t("sidebar.places")}>
        <span className="ds-sidebar-sec">{t("sidebar.studio")}</span>
        <Item to="/" icon="squares-four" label={t("nav.dramas")} current={path === "/" || path === "/new"} />
        <Item to="/inbox" icon="list-checks" label={t("nav.inbox")} current={path === "/inbox"} count={waiting} />
        <span className="ds-sidebar-sec">{t("sidebar.account")}</span>
        <Item to="/settings" icon="gear-six" label={t("nav.settings")} current={path === "/settings"} />
      </nav>
      {replay && <div className="ds-sidebar-foot">{t("mode.replay")}</div>}
    </aside>
  );
}

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


/** Where the drama stands, at the sidebar's foot: what it has spent, then its episodes, or the setup's step before there are any. */
function Standing({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const { episodes } = drama;
  return (
    <div className="ds-sidebar-foot">
      <BudgetMeter spentUsd={drama.spent.total} budgetUsd={null} simulated={drama.mode === "replay"} />
      <div role="status" aria-label={t("statusbar.label")} className="ds-standing">
        {episodes.total ? (
          <>
            <span>{t("statusbar.finished", { done: episodes.done, total: episodes.total })}</span>
            <span>{t("statusbar.atWork", { n: episodes.working })}</span>
            <span>{t("statusbar.waiting", { n: episodes.waiting })}</span>
          </>
        ) : (
          <span>{t("statusbar.setup", { step: t(SETUP_STEPS[Math.min(drama.setup.reached, SETUP_STEPS.length - 1)]) })}</span>
        )}
      </div>
    </div>
  );
}

/** A drama's sidebar. */
export function DramaSidebar({ drama, tab, episode, onTalk }: { drama: DramaView; tab: string; episode?: string; onTalk: () => void }) {
  const { t } = useT();
  const [tuning, setTuning] = useState(false);
  const step = stepOf(drama, tab);
  const needs: Record<Step, number> = {
    script: 0,
    story: drama.setup.state === "waiting" ? 1 : 0,
    episodes: drama.episodeRows.filter((row) => markOf(row) === "you").length,
    cut: 0,
  };
  const { episodes } = drama;
  return (
    <aside className="ds-sidebar" aria-label={t("sidebar.label")}>
      <div className="ds-sidebar-head">
        <Link to={`/d/${drama.id}`} className="ds-project">
          {drama.cast[0] ? <img src={drama.cast[0]} alt="" /> : <span className="ds-project-blank" aria-hidden="true" />}
          <span>
            <b>{drama.title}</b>
            <small>{[episodes.total ? t("sidebar.episodes", { n: episodes.total }) : "", drama.format].filter(Boolean).join(" · ")}</small>
          </span>
        </Link>
      </div>
      <div className="ds-sidebar-scroll">
        <nav aria-label={t("rail.steps")}>
          {STEPS.map(({ step: key, label, path, icon }) => (
            <div key={key}>
              <Link to={`/d/${drama.id}${path ? `/${path}` : ""}`} className="ds-navi" aria-current={key === step ? "page" : undefined}>
                <Icon name={icon} />
                <span>{t(label)}</span>
                {needs[key] > 0 && <> <span className="ds-navi-count">{t("rail.needYou", { n: needs[key] })}</span></>}
              </Link>
              {key === "episodes" && drama.episodeRows.length > 0 && (
                <ul className="ds-tree" aria-label={t("tree.label")}>
                  {drama.episodeRows.map((row) => {
                    const mark = markOf(row);
                    return (
                      <li key={row.id}>
                        {/* The name is what the link shows, then where it stands, said rather than shown (WCAG 2.5.3). */}
                        <Link to={`/d/${drama.id}/e/${row.code}`} aria-current={row.code === episode ? "true" : undefined}>
                          <span className="ds-tree-code">{row.code}</span> <span className="ds-tree-now">{nowText(row, t)}</span>
                          <span className="sr">, {t(`tree.${mark}` as TKey)}</span>
                          <span className={`ds-tree-mark is-${mark}`} aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </nav>
        <span className="ds-sidebar-sec">{t("sidebar.production")}</span>
        <Item to={`/d/${drama.id}/inbox`} icon="list-checks" label={t("section.inbox")} current={tab === "inbox"} count={drama.waiting} />
        <Item to={`/d/${drama.id}/crew`} icon="cube" label={t("section.crew")} current={tab === "crew"} />
        {tuning ? (
          <Tune drama={drama} onDone={() => setTuning(false)} />
        ) : (
          <button type="button" className="ds-navi" onClick={() => setTuning(true)}>
            <Icon name="sliders-horizontal" />
            <span>
              {t("rail.tune")}
              <small>
                {episodes.total > 0 && drama.parallel >= episodes.total
                  ? t("rail.tuneAll", { n: episodes.total, c: drama.perComputer })
                  : t("rail.tuneValue", { p: drama.parallel, c: drama.perComputer })}
              </small>
            </span>
          </button>
        )}
        <button type="button" className="ds-navi" onClick={onTalk}>
          <Icon name="chats" />
          <span>{t("rail.talk")}</span>
        </button>
      </div>
      <Standing drama={drama} />
    </aside>
  );
}
