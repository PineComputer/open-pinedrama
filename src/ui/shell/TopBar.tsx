// The bar over the work, ported from the pro prototype (studio-pro/app.js, TopBar, StopControl,
// SurfaceSwitch, ProjectChips) with its markup and classes (studio.css .top, .crumb, .btn, .bar2,
// .chip): back, where you are as a breadcrumb, Stop drama and the next review. In a drama, the bar
// under it holds the surface (Studio, Canvas, Graph) with the selection kept across them, and the
// drama's preset, format and spend.
import { Link, type LinkOptions, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { DramaView, ReviewSummary } from "../../shared/types.ts";
import { api, useAction, useResource } from "../api.ts";
import { Dialog } from "../components/Dialog.tsx";
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, moneyText } from "../labels.ts";
import { placeLink, type Surface, usePlace, useRoute } from "../place.ts";
import type { ProjectView } from "../../shared/project.ts";


function SurfaceSwitch({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const navigate = useNavigate();
  // The same episode and item on the other surface (place.ts, Place): an item is never read as an episode.
  const place = usePlace() ?? { dramaId: drama.id, surface: "list" as const };
  const surface = place.surface;
  const go = (next: Surface) => {
    if (next !== surface) void navigate(placeLink({ ...place, dramaId: drama.id, surface: next }));
  };
  const options: [Surface, TKey, IconName][] = [
    ["list", "surface.studio", "squares-four"],
    ["canvas", "surface.canvas", "flow-arrow"],
    ["lineage", "surface.graph", "tree-structure"],
  ];
  // The design's SurfaceSwitch (design/app.js): one pressed button among three.
  return (
    <div className="seg" role="group" aria-label={t("surface.label")}>
      {options.map(([value, label, icon]) => (
        <button key={value} type="button" aria-pressed={value === surface} onClick={() => go(value)}>
          <Icon name={icon} className="ic" />
          {t(label)}
        </button>
      ))}
    </div>
  );
}

/** The drama's surface switch and its chips: preset, format, and what it has spent. */
export function DramaBar({ drama }: { drama: DramaView }) {
  const { t, lang } = useT();
  // The budget is drama-cli's (every session's project carries the drama's one config), as the design's chip reads "$X of $1,000".
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  const cap = project.data?.sessions[0]?.budget.budgetUsd ?? null;
  return (
    <div className="bar2">
      <SurfaceSwitch drama={drama} />
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
 * Stop in plain sight (the spec's StopControl): Stop drama, after a confirm; Stopping… while its
 * Computers stop; then Stopped, with Resume.
 */
export function StopControl({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  const stop = useAction(() => api(`/api/dramas/${drama.id}/stop`, { method: "POST" }));
  const resume = useAction(() => api(`/api/dramas/${drama.id}/resume`, { method: "POST" }));
  const error = stop.error ?? resume.error;
  const failed = error !== undefined && <span className="error small">{errorText(error, t)}</span>;
  if (drama.status === "setup" || drama.status === "production") {
    return (
      <>
        {failed}
        <button type="button" className="btn sm danger" disabled={stop.busy} onClick={() => setAsking(true)}>
          <Icon name="stop" className="ic" />
          {t("stop.drama")}
        </button>
        <Dialog
          open={asking}
          onOpenChange={setAsking}
          title={t("stop.title", { title: drama.title })}
          description={t("stop.confirm")}
          cancel={t("stop.keep")}
          confirm={{ label: t("stop.yes"), danger: true, run: () => void stop.run() }}
        />
      </>
    );
  }
  if (stillStopping(drama)) {
    return (
      <button type="button" className="btn sm" disabled aria-busy="true">
        <Icon name="circle-notch" className="ic" />
        {t("stop.stopping")}
      </button>
    );
  }
  if (drama.status !== "stopped") return null;
  return (
    <>
      {failed}
      <span className="stopped-chip">
        <Icon name="stop" className="ic" />
        {t("drama.stopped")}
      </span>
      <button type="button" className="btn sm" disabled={resume.busy} onClick={() => void resume.run()}>
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
  label: string;
  to?: LinkOptions;
}

/** Where you are: each step back a link, the last the page itself. */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const { t } = useT();
  return (
    <nav className="crumb" aria-label={t("crumb.label")}>
      {crumbs.map((crumb, n) => (
        <span key={n} className="contents">
          {n > 0 && <Icon name="caret-right" className="ic" />}
          {crumb.to && n < crumbs.length - 1 ? (
            <Link {...crumb.to}>{crumb.label}</Link>
          ) : n === crumbs.length - 1 ? (
            <b aria-current="page">{crumb.label}</b>
          ) : (
            <span>{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function TopBar({ crumbs, waiting, ready, next, children }: { crumbs: Crumb[]; waiting: ReviewSummary[]; ready: boolean; next: boolean; children?: React.ReactNode }) {
  const { t } = useT();
  const navigate = useNavigate();
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2].to : undefined;
  return (
    <header className="top">
      {back && (
        <button type="button" className="ibtn" aria-label={t("crumb.back")} title={t("crumb.back")} onClick={() => void navigate(back)}>
          <Icon name="caret-left" className="ic" />
        </button>
      )}
      <Breadcrumb crumbs={crumbs} />
      <span className="grow" />
      {children}
      {next && ready && <NextReview waiting={waiting} />}
    </header>
  );
}
