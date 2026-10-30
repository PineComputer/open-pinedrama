// The sidebar beside the rail, in the pro direction (its spec, "Sidebar"), collapsible from the
// rail. On the studio's pages: its places. In a drama: the drama, its steps Script · Story ·
// Episodes · Cut, each marked with what needs the maker, the episode tree under Episodes with
// where each stands, the drama's review queue, Computers and production line (the agent panel
// beside the work talks to the agents), and at the foot
// what it has spent and where it stands.
import { useState } from "react";
import type { ProjectView, SessionReport } from "../../shared/project.ts";
import type { DramaCard, DramaView, EpisodeRow, RecentConversation, ReviewKind, ReviewSummary } from "../../shared/types.ts";
import { ago, api, useResource } from "../api.ts";
import { Menu } from "../components/Menu.tsx";
import { BudgetMeter } from "../components/BudgetMeter.tsx";
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { nowText, SETUP_STEPS } from "../labels.ts";
import { Mark } from "../Mark.tsx";
import { ReviewingChoice } from "../Reviewing.tsx";
import { Link, navigate } from "../router.tsx";
import { buttonVariants } from "@/components/ui/button";
import { Segmented } from "../components/Segmented.tsx";

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
  if (tab === "script" || tab === "analyzing") return "script";
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
export function HomeSidebar({ path, waiting, replay, recent = [] }: { path: string; waiting: number; replay: boolean; recent?: RecentConversation[] }) {
  const { t, lang } = useT();
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
        {recent.length > 0 && (
          <>
            <span className="ds-sidebar-sec">{t("sidebar.recent")}</span>
            {recent.map((item) => (
              <Link key={item.sessionId} to={`/d/${item.dramaId}`} className="ds-navi ds-recent" title={item.line}>
                <Icon name="chat-centered" />
                <span className="txt">
                  <span>{[item.dramaTitle, item.label || t("sidebar.setup")].join(" · ")}</span>
                  <small>{ago(item.at, lang)}</small>
                </span>
              </Link>
            ))}
          </>
        )}
        <span className="ds-sidebar-sec">{t("sidebar.account")}</span>
        <Item to="/settings" icon="gear-six" label={t("nav.settings")} current={path === "/settings"} />
      </nav>
      {replay && <div className="ds-sidebar-foot">{t("mode.replay")}</div>}
    </aside>
  );
}

/** How many episodes run at once, and how many share a Computer, and what the maker reviews: changed in place. */
function Tune({ drama, onDone }: { drama: DramaView; onDone: () => void }) {
  const { t } = useT();
  const [parallel, setParallel] = useState(drama.parallel);
  const [perComputer, setPerComputer] = useState(drama.perComputer);
  const [reviewing, setReviewing] = useState(drama.reviewing);
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
        <Segmented label={t("new.perComputer")} value={String(perComputer)} onChange={(n) => setPerComputer(Number(n))} options={["1", "2", "3"].map((n) => ({ value: n, label: n }))} />
      </div>
      <ReviewingChoice value={reviewing} onChange={setReviewing} />
      <div className="tune-actions">
        <button className={buttonVariants({ variant: "default", size: "sm" })} onClick={save}>
          {t("tune.save")}
        </button>
        <button className="link" onClick={onDone}>
          {t("tune.cancel")}
        </button>
      </div>
    </div>
  );
}


/**
 * The sidebar's foot, as the pro direction's (its spec, "BudgetMeter"): what the drama has spent
 * against drama-cli's budget, what is in flight and how many episodes are at work, or the setup's
 * step before there are any; and what Spent covers.
 */
function Standing({ drama, sessions }: { drama: DramaView; sessions: SessionReport[] }) {
  const { t } = useT();
  const { episodes } = drama;
  // Every session's project carries the drama's one config, so its cap; what each has reserved for calls still out is its own.
  const cap = sessions[0]?.budget.budgetUsd ?? null;
  const inFlight = sessions.reduce((sum, session) => sum + session.budget.reservedUsd, 0);
  return (
    <div className="ds-sidebar-foot" role="status" aria-label={t("statusbar.label")}>
      <BudgetMeter spentUsd={drama.spent.total} budgetUsd={cap} inFlightUsd={inFlight} simulated={drama.mode === "replay"} />
      <span>{episodes.total ? t("statusbar.atWork", { n: episodes.working }) : t("statusbar.setup", { step: t(SETUP_STEPS[Math.min(drama.setup.reached, SETUP_STEPS.length - 1)]) })}</span>
      {/* What Spent covers (docs/REDESIGN_PLAN.md, M3 notes): drama-cli's text and image calls are included at no charge, and the turn under way is priced when it ends. */}
      <small className="ds-caption">{t("spent.about")}</small>
    </div>
  );
}

/** A drama's sidebar. */
export function DramaSidebar({ drama, tab, episode }: { drama: DramaView; tab: string; episode?: string }) {
  const { t } = useT();
  const others = useResource<DramaCard[]>("/api/dramas", ["dramas"]);
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  const [tuning, setTuning] = useState(false);
  const step = stepOf(drama, tab);
  // What waits for the maker under each step: the drama's open reviews, by the step their kind belongs to.
  const reviews = useResource<ReviewSummary[]>(`/api/inbox?drama=${drama.id}`, ["inbox"]);
  const STEP_OF: Record<ReviewKind, Step> = { question: "story", looks: "story", references: "story", storyboards: "episodes", takes: "episodes", cut: "cut" };
  const needs: Record<Step, number> = { script: 0, story: 0, episodes: 0, cut: 0 };
  for (const review of reviews.data ?? []) if (review.state === "open") needs[STEP_OF[review.kind]]++;
  // The script is done once the setup has read it.
  const scriptDone = drama.setup.reached > 0 || drama.episodeRows.length > 0;
  const { episodes } = drama;
  return (
    <aside className="ds-sidebar" aria-label={t("sidebar.label")}>
      <div className="ds-sidebar-head">
        <Menu
          label={t("sidebar.switch")}
          wide="ds-project"
          trigger={
            <>
              {drama.cast[0] ? <img src={drama.cast[0]} alt="" /> : <span className="ds-project-blank" aria-hidden="true" />}
              <span>
                <b>{drama.title}</b>
                <small>{[episodes.total ? t("sidebar.episodes", { n: episodes.total }) : "", drama.format].filter(Boolean).join(" · ")}</small>
              </span>
              <Icon name="caret-down" />
            </>
          }
          items={[
            ...(others.data ?? []).filter((other) => other.id !== drama.id).map((other) => ({ label: other.title, run: () => navigate(`/d/${other.id}`) })),
            { label: t("sidebar.allDramas"), run: () => navigate("/") },
          ]}
        />
      </div>
      <div className="ds-sidebar-scroll">
        <nav aria-label={t("rail.steps")}>
          {STEPS.map(({ step: key, label, path, icon }) => (
            <div key={key}>
              <Link to={`/d/${drama.id}${path ? `/${path}` : ""}`} className="ds-navi" aria-current={key === step ? "page" : undefined}>
                <Icon name={icon} />
                <span>{t(label)}</span>
                {needs[key] > 0 && (
                  <span className="ds-navi-count" aria-label={t("rail.needYou", { n: needs[key] })}>
                    {needs[key]}
                  </span>
                )}
                {key === "script" && scriptDone && <Icon name="check" className="ds-navi-end" />}
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
                          <span className="sr-only">, {t(`tree.${mark}` as TKey)}</span>
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
      </div>
      <Standing drama={drama} sessions={project.data?.sessions ?? []} />
    </aside>
  );
}
