// The bar over the work, ported from the pro prototype (studio-pro/app.js, TopBar, StopControl,
// SurfaceSwitch, ProjectChips) with its markup and classes (studio.css .top, .crumb, .btn, .bar2,
// .chip): back, where you are as a breadcrumb, Stop drama and the next review. In a drama, the bar
// under it holds the surface (Studio, Canvas, Graph) with the selection kept across them, and the
// drama's preset, format and spend.
import { useState } from "react";
import type { DramaView, ReviewSummary } from "../../shared/types.ts";
import { api, useAction } from "../api.ts";
import { Dialog } from "../components/Dialog.tsx";
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, moneyText } from "../labels.ts";
import { Link, match, navigate, usePath } from "../router.tsx";

type Surface = "studio" | "canvas" | "graph";

/** The surface a path shows, and the item selected on it: an episode in Studio, ?item= on Canvas and Graph. */
export function surfaceOf(path: string, query: URLSearchParams): { surface: Surface; item?: string } {
  const surface = match("/d/:id/:tab?", path)?.tab;
  if (surface === "canvas" || surface === "graph") return { surface, item: query.get("item") ?? undefined };
  return { surface: "studio", item: match("/d/:id/e/:code", path)?.code };
}

function SurfaceSwitch({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const { path, query } = usePath();
  const { surface, item } = surfaceOf(path, query);
  const go = (next: Surface) => {
    if (next === surface) return;
    if (next === "studio") navigate(item ? `/d/${drama.id}/e/${item}` : `/d/${drama.id}`);
    else navigate(`/d/${drama.id}/${next}${item ? `?item=${encodeURIComponent(item)}` : ""}`);
  };
  const options: [Surface, TKey, IconName][] = [
    ["studio", "surface.studio", "squares-four"],
    ["canvas", "surface.canvas", "flow-arrow"],
    ["graph", "surface.graph", "tree-structure"],
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
        {drama.mode === "replay" && <span className="muted">{t("budget.simulated")}</span>}
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
  const { path } = usePath();
  // On a review, "next" means the one after it.
  const current = match("/r/:id", path)?.id;
  const others = waiting.filter((item) => item.id !== current);
  return (
    <button
      type="button"
      className="btn primary sm"
      disabled={!others.length}
      aria-label={`${t("next.label")}, ${t("next.waiting", { n: others.length })}`}
      onClick={() => navigate(`/r/${others[0].id}`)}
    >
      {t("next.label")} <span className="n">{others.length}</span>
    </button>
  );
}

export interface Crumb {
  label: string;
  to?: string;
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
            <Link to={crumb.to}>{crumb.label}</Link>
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

export function TopBar({ crumbs, waiting, ready, children }: { crumbs: Crumb[]; waiting: ReviewSummary[]; ready: boolean; children?: React.ReactNode }) {
  const { t } = useT();
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2].to : undefined;
  return (
    <header className="top">
      {back && (
        <button type="button" className="ibtn" aria-label={t("crumb.back")} title={t("crumb.back")} onClick={() => navigate(back)}>
          <Icon name="caret-left" className="ic" />
        </button>
      )}
      <Breadcrumb crumbs={crumbs} />
      <span className="grow" />
      {children}
      {ready && <NextReview waiting={waiting} />}
    </header>
  );
}
