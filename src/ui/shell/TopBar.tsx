// The bar over the work, ported from the design (design/app.js, TopBar, StopControl, EpisodeViews,
// ProjectChips) with its markup and classes (studio.css .top, .crumb, .btn, .bar2, .chip): back, where
// it belongs as a breadcrumb, "Back to …", Stop drama and the next review. In a drama, the bar under it
// holds an episode's views (List, Canvas, Cut) inside one, and the drama's preset, format and spend.
import { Link, linkOptions, type LinkOptions, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, Fragment } from "react";
import type { DramaView, ReviewSummary } from "../../shared/types.ts";
import { api, useAction, useResource } from "../api.ts";
import { Dialog } from "../components/Dialog.tsx";
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, moneyText } from "../labels.ts";
import { type Page, usePage, usePlace, useRoute } from "../place.ts";
import type { ProjectView } from "../../shared/project.ts";


// "Back to …" (IA §16, rule 2): a link that lands on an object's home says where it came from in the history entry's
// state, never in the URL, so there is nothing to check as internal and a reload keeps it. Back is the browser's.
declare module "@tanstack/react-router" {
  interface HistoryState {
    backTo?: string;
  }
}

export function BackTo() {
  const { t } = useT();
  const router = useRouter();
  const from = useLocation({ select: (location) => location.state.backTo });
  if (!from) return null;
  return (
    <button type="button" className="btn sm ghost backto" onClick={() => router.history.back()}>
      <Icon name="arrow-left" className="ic" />
      {t("back.to", { place: from })}
    </button>
  );
}


/** The drama's bar (design/app.js, bar2): Back to where a link came from, an episode's views inside one, and the chips: preset, format, spend. */
export function DramaBar({ drama }: { drama: DramaView }) {
  const place = usePlace();
  const page = usePage();
  const { t, lang } = useT();
  // The budget is drama-cli's (every session's project carries the drama's one config), as the design's chip reads "$X of $1,000".
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  const cap = project.data?.sessions[0]?.budget.budgetUsd ?? null;
  return (
    <div className="bar2">
      <span className="grow" />
      {drama.preset && (
        <span className="chip plain" title={t("chip.preset")}>
          <Icon name="sparkle" className="ic" />
          {drama.preset}
        </span>
      )}
      <span className="chip plain">
        <Icon name="frame-corners" className="ic" />
        {drama.format}
      </span>
      <span className="chip plain" title={t("spent.about")}>
        <Icon name="coins" className="ic" />
        <span className="mono">{moneyText(drama.spent, t, lang)}</span>
        {cap !== null && <span className="muted">{t("chip.of", { cap: `$${cap.toLocaleString("en-US")}` })}</span>}
      </span>
    </div>
  );
}

/** Whether the drama's Computers are still being stopped after the maker stopped it. */
export function stillStopping(drama: DramaView): boolean {
  return drama.status === "stopped" && drama.crew.some((computer) => computer.state === "stopping");
}

/**
 * Pause production (the spec's StopControl). What the engine's stop does (dramas.ts, stopDrama): the project's status
 * becomes stopped, nothing new starts, every running Computer stops now, nothing more is billed, everything made stays,
 * and Resume carries on from there. A reversible pause, not an end and not a delete, so it is a secondary button, not a
 * red one (HIG keeps red for destructive actions), and it says so: what is working now, then the facts before it pauses.
 * Pausing… while its Computers stop; then one state, Paused, with Resume. A done project has none.
 */
export function StopControl({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  const stop = useAction(() => api(`/api/dramas/${drama.id}/stop`, { method: "POST" }));
  const resume = useAction(() => api(`/api/dramas/${drama.id}/resume`, { method: "POST" }));
  const error = stop.error ?? resume.error;
  const failed = error !== undefined && <span className="error small">{errorText(error, t)}</span>;
  // The Computers working now: running, with a session at work on them (not one waiting on the maker).
  const working = drama.crew.filter((computer) => computer.state === "running" && computer.sessions.some((session) => session.state === "open" && !session.waiting)).length;
  if (drama.status === "setup" || drama.status === "production") {
    const now = working === 0 ? t("pause.idle") : working === 1 ? t("pause.workingOne") : t("pause.working", { n: working });
    return (
      <>
        {failed}
        <button type="button" className="btn sm" title={now} disabled={stop.busy} onClick={() => setAsking(true)}>
          <Icon name="pause" className="ic" />
          {t("pause.label")}
        </button>
        <Dialog
          open={asking}
          onOpenChange={setAsking}
          title={t("pause.title", { title: drama.title })}
          description={[working === 0 ? t("pause.noneStop") : working === 1 ? t("pause.oneStops") : t("pause.theyStop", { n: working }), t("pause.facts")].join(" ")}
          cancel={t("pause.keep")}
          confirm={{ label: t("pause.label"), run: () => void stop.run() }}
        />
      </>
    );
  }
  if (stillStopping(drama)) {
    return (
      <button type="button" className="btn sm" disabled aria-busy="true" title={t("pause.pausingWhy")}>
        <Icon name="circle-notch" className="ic" />
        {t("pause.pausing")}
      </button>
    );
  }
  if (drama.status !== "stopped") return null;
  return (
    <>
      {failed}
      <span className="stopped-chip">
        <Icon name="pause" className="ic" />
        {t("pause.paused")}
      </span>
      <button type="button" className="btn sm primary" disabled={resume.busy} onClick={() => void resume.run()}>
        {t("setup.retry")}
      </button>
    </>
  );
}

function NextReview({ waiting }: { waiting: ReviewSummary[] }) {
  const { t } = useT();
  const navigate = useNavigate();
  // On a review, "next" means the one after it.
  const current = useRoute().params.reviewId;
  const others = waiting.filter((item) => item.id !== current);
  return (
    <button
      type="button"
      className="btn primary sm"
      disabled={!others.length}
      aria-label={`${t("next.label")}, ${t("next.waiting", { n: others.length })}`}
      onClick={() => void navigate({ to: "/r/$reviewId", params: { reviewId: others[0].id } })}
    >
      {t("next.label")} <span className="n">{others.length}</span>
    </button>
  );
}

export interface Crumb {
  /** Text, or the drama's cover and name (design/'s crumbimg). */
  label: React.ReactNode;
  to?: LinkOptions;
}

/** Where this belongs: each ancestor a link to its home, the last the page itself. */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const { t } = useT();
  return (
    // Flat, as design/'s: each crumb's words in .ctext, so a crumb can shrink to "…" while the actions keep their room
    // (design/studio.css, .top > .crumb; a string crumb keeps its whole name as its title).
    <nav className="crumb" aria-label={t("crumb.label")}>
      {crumbs.map((crumb, n) => {
        const words = typeof crumb.label === "string" ? <span className="ctext">{crumb.label}</span> : crumb.label;
        const title = typeof crumb.label === "string" ? crumb.label : undefined;
        return (
          <Fragment key={n}>
            {n > 0 && <Icon name="caret-right" className="ic" />}
            {crumb.to && n < crumbs.length - 1 ? (
              <Link {...crumb.to} className="crumblink" title={title}>
                {words}
              </Link>
            ) : n === crumbs.length - 1 ? (
              <b aria-current="page" title={title}>
                {words}
              </b>
            ) : (
              <span title={title}>{words}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export function TopBar({ crumbs, waiting, ready, next, children }: { crumbs: Crumb[]; waiting: ReviewSummary[]; ready: boolean; next: boolean; children?: React.ReactNode }) {
  // design/'s TopBar (2f2a07b): where this belongs, then where you came from as its own control in the same place on
  // every page, the one Back (work-03's dry run, J2); no chevron.
  return (
    <header className="top">
      <Breadcrumb crumbs={crumbs} />
      <BackTo />
      <span className="grow" />
      {children}
      {next && ready && <NextReview waiting={waiting} />}
    </header>
  );
}
