// The sidebar beside the rail, ported from the design (design/app.js, Side; screens.js, SetupSteps)
// with its markup and classes: on the studio's pages its places; in a drama the drama, its steps
// Script · Story · Episodes · Cut with what waits for the maker under each, the episode tree under
// Episodes, or the setup's steps while it is set up; and at the foot what it has spent.
import type { ProjectView, SessionReport } from "../../shared/project.ts";
import type { DramaCard, DramaView, EpisodeRow, ReviewKind, ReviewSummary } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { Menu } from "../components/Menu.tsx";
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { isSettingUp, moneyText, nowText, scriptWaits, SETUP_STEPS } from "../labels.ts";
import { Mark } from "../Mark.tsx";
import { Link, navigate } from "../router.tsx";

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
  const settingUp = isSettingUp(drama);
  if (tab === "script" || tab === "analyzing") return "script";
  if (tab === "story" || (tab === "board" && settingUp)) return "story";
  if (tab === "cut") return "cut";
  return tab === "board" || tab === "episode" ? "episodes" : undefined;
}

/** The studio's pages, as the design's sidebar for Home has them (design/app.js, Side): the dramas and settings; Computers and Usage come in phase 2. */
export function HomeSidebar({ path, replay }: { path: string; replay: boolean }) {
  const { t } = useT();
  const item = (to: string | null, icon: IconName, label: string, current: boolean) =>
    to ? (
      <Link to={to} className="navi" aria-current={current ? "page" : "false"}>
        <Icon name={icon} className="ic" />
        {label}
        <span className="end"><Icon name="caret-right" className="ic" /></span>
      </Link>
    ) : (
      <button type="button" className="navi" disabled title={t("sidebar.phase2")}>
        <Icon name={icon} className="ic" />
        {label}
        <span className="end"><Icon name="caret-right" className="ic" /></span>
      </button>
    );
  return (
    <aside className="side" aria-label={t("sidebar.label")}>
      <div className="head">
        <div className="who" style={{ paddingLeft: 4 }}>
          <Mark size={30} />
          <b style={{ fontSize: 14 }}>{t("app.name")}</b>
        </div>
      </div>
      <nav className="scroll" aria-label={t("sidebar.places")}>
        <div className="sec">{t("sidebar.studio")}</div>
        {item("/", "film-strip", t("nav.dramas"), path === "/" || path === "/new")}
        {item(null, "cube", t("nav.computers"), false)}
        <div className="sec">{t("sidebar.account")}</div>
        {item(null, "coins", t("nav.usage"), false)}
        {item("/settings", "gear-six", t("nav.settings"), path === "/settings")}
      </nav>
      <div className="foot">
        <div className="who">
          <span className="av">Y</span>
          <span className="grow">{t("sidebar.yourStudio")}</span>
          <Icon name="caret-right" className="ic" />
        </div>
        {replay && <span className="muted">{t("mode.replay")}</span>}
      </div>
    </aside>
  );
}

/**
 * The sidebar's foot, as the design's (design/app.js, Side; BudgetMeter): what the drama has spent
 * against drama-cli's budget, solid, and what is in flight, dashed; how much is in flight and how
 * many episodes are at work, or the setup's step before there are any; and what Spent covers.
 */
function Standing({ drama, sessions }: { drama: DramaView; sessions: SessionReport[] }) {
  const { t, lang } = useT();
  const { episodes } = drama;
  // Every session's project carries the drama's one config, so its cap; what each has reserved for calls still out is its own.
  const cap = sessions[0]?.budget.budgetUsd ?? null;
  const inFlight = sessions.reduce((sum, session) => sum + session.budget.reservedUsd, 0);
  const share = (usd: number) => (cap ? `${Math.min(100, (usd / cap) * 100)}%` : "0%");
  return (
    <div className="foot" role="status" aria-label={t("statusbar.label")} title={t("spent.about")}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{t(drama.mode === "replay" ? "budget.simulated" : "budget.spent")}</span>
        <b className="mono" style={{ color: "var(--text-primary)" }}>
          {moneyText(drama.spent, t, lang)}
          {cap !== null && <span className="muted"> / {usd(cap)}</span>}
        </b>
      </div>
      {cap !== null && (
        <div className="meter" role="meter" aria-label={t("budget.spentOf")} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={drama.spent.total}>
          <i style={{ width: share(drama.spent.total) }} />
          <i className="fly" style={{ width: share(inFlight) }} />
        </div>
      )}
      <span>
        {episodes.total
          ? [inFlight > 0 ? t("budget.inFlight", { money: usd(inFlight) }) : "", t("statusbar.atWork", { n: episodes.working })].filter(Boolean).join(" · ")
          : t("statusbar.setup", { step: t(SETUP_STEPS[Math.min(drama.setup.reached, SETUP_STEPS.length - 1)]) })}
      </span>
      <span className="subtle" style={{ fontSize: 11 }}>
        {t("spent.about")}
      </span>
    </div>
  );
}

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, "")}`;

/** A drama's sidebar, as the design's (design/app.js, Side; screens.js, SetupSteps). */
export function DramaSidebar({ drama, tab, episode }: { drama: DramaView; tab: string; episode?: string }) {
  const { t } = useT();
  const others = useResource<DramaCard[]>("/api/dramas", ["dramas"]);
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  const step = stepOf(drama, tab);
  // What waits for the maker under each step: the drama's open reviews, by the step their kind belongs to.
  const reviews = useResource<ReviewSummary[]>(`/api/inbox?drama=${drama.id}`, ["inbox"]);
  const STEP_OF: Record<ReviewKind, Step> = { question: "story", looks: "story", references: "story", storyboards: "episodes", takes: "episodes", cut: "cut" };
  const needs: Record<Step, number> = { script: 0, story: 0, episodes: 0, cut: 0 };
  for (const review of reviews.data ?? []) if (review.state === "open") needs[STEP_OF[review.kind]]++;
  // The script is done once the maker has answered the setup's first question about it.
  const scriptDone = drama.setup.reached > 1 || drama.episodeRows.length > 0;
  // The tree folds the episodes that only wait in line at its end into one line ("EP009–EP024 · 16 in line"), as the design does.
  const lineStart = drama.episodeRows.findLastIndex((row) => row.state !== "queued") + 1;
  const folded = drama.episodeRows.length - lineStart > 1 ? drama.episodeRows.slice(lineStart) : [];
  const shownRows = drama.episodeRows.slice(0, drama.episodeRows.length - folded.length);
  const { episodes } = drama;
  const settingUp = isSettingUp(drama);
  const head = (
    <div className="head">
      <Menu
        label={t("sidebar.switch")}
        wide="proj"
        trigger={
          <>
            {drama.cast[0] ? <img src={drama.cast[0]} alt="" /> : <span className="newthumb"><Icon name="file-text" className="ic" /></span>}
            <span className="grow">
              <b>{drama.title}</b>
              <small>{settingUp ? t("sidebar.setupSession") : [episodes.total ? t("sidebar.episodes", { n: episodes.total }) : "", drama.format].filter(Boolean).join(" · ")}</small>
            </span>
            <Icon name="caret-down" className="ic subtle" />
          </>
        }
        items={[
          ...(others.data ?? []).filter((other) => other.id !== drama.id).map((other) => ({ label: other.title, run: () => navigate(`/d/${other.id}`) })),
          { label: t("sidebar.allDramas"), run: () => navigate("/") },
        ]}
      />
    </div>
  );
  if (settingUp) {
    // The setup's steps, as the design's SetupSteps: Script, Story, Episodes and Cut, each where it stands.
    const reached = drama.setup.reached;
    const rows: { key: Step; label: TKey; state: "done" | "you" | "work" | "line"; detail: TKey; to?: string }[] = [
      { key: "script", label: "step.script", state: scriptDone ? "done" : scriptWaits(drama) ? "you" : "work", detail: scriptDone ? "setupSteps.done" : scriptWaits(drama) ? "setupSteps.yourReview" : "setupSteps.checking", to: `/d/${drama.id}/script` },
      { key: "story", label: "step.story", state: !scriptDone ? "line" : drama.setup.state === "waiting" ? "you" : reached >= 4 ? "done" : "work", detail: !scriptDone ? "setupSteps.afterYourReview" : drama.setup.state === "waiting" ? "setupSteps.yourReview" : "setupSteps.making", to: `/d/${drama.id}/story` },
      { key: "episodes", label: "step.episodes", state: reached >= 4 ? "work" : "line", detail: reached >= 4 ? "setupSteps.making" : "setupSteps.afterLooks" },
      { key: "cut", label: "step.cut", state: "line", detail: "setupSteps.perEpisode" },
    ];
    return (
      <aside className="side" aria-label={t("sidebar.label")}>
        {head}
        <div className="scroll">
          <div className="sec">{t("sidebar.setup")}</div>
          <ol className="setup" aria-label={t("rail.steps")}>
            {rows.map((row, n) => (
              <li key={row.key} className={row.state}>
                <button type="button" disabled={!row.to} aria-current={row.key === step ? "true" : "false"} onClick={() => row.to && navigate(row.to)}>
                  <span className="n">{row.state === "done" ? <Icon name="check" className="ic" /> : n + 1}</span>
                  <span>
                    <b>{t(row.label)}</b>
                    <small>{t(row.detail)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <Standing drama={drama} sessions={project.data?.sessions ?? []} />
      </aside>
    );
  }
  return (
    <aside className="side" aria-label={t("sidebar.label")}>
      {head}
      <nav className="scroll" aria-label={t("rail.steps")}>
        {STEPS.map(({ step: key, label, path, icon }) => (
          <div key={key} className="contents">
            <Link to={`/d/${drama.id}${path ? `/${path}` : ""}`} className="navi" aria-current={key === step ? "page" : "false"}>
              <Icon name={icon} className="ic" />
              {t(label)}
              {needs[key] > 0 ? (
                <span className="cnt" aria-label={t("rail.needYou", { n: needs[key] })}>
                  {needs[key]}
                </span>
              ) : (
                key === "script" && scriptDone && <span className="end"><Icon name="check" className="ic" /></span>
              )}
            </Link>
            {key === "episodes" && drama.episodeRows.length > 0 && (
              <ul className="tree" aria-label={t("tree.label")}>
                {shownRows.map((row) => {
                  const mark = markOf(row);
                  return (
                    <li key={row.id}>
                      {/* The name is what the button shows, then where it stands, said rather than shown (WCAG 2.5.3). */}
                      <button type="button" aria-current={row.code === episode ? "true" : "false"} onClick={() => navigate(`/d/${drama.id}/e/${row.code}`)}>
                        <span className="code">{row.code}</span> <span className="now">{nowText(row, t)}</span>
                        <span className="sr-only">, {t(`tree.${mark}` as TKey)}</span>
                        <span className={`dot ${DOT[mark]}`} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
                {folded.length > 0 && (
                  <li style={{ padding: "6px 8px", color: "var(--text-muted)", fontSize: 11.5 }}>
                    {t("tree.folded", { first: folded[0].code, last: folded[folded.length - 1].code, n: folded.length })}
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
      </nav>
      <Standing drama={drama} sessions={project.data?.sessions ?? []} />
    </aside>
  );
}

const DOT: Record<Mark, string> = { you: "you", work: "work", done: "accepted", line: "line" };
