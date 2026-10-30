// The bar over the work, in the pro direction (its spec, "TopBar"): back, where you are as a
// breadcrumb, and the next review. In a drama, the bar under it holds the surface (Studio, Canvas,
// Graph) with the selection kept across them, and the drama's preset, format and spend.
import { useState } from "react";
import type { DramaView, ReviewSummary } from "../../shared/types.ts";
import { api, useAction } from "../api.ts";
import { Button, IconButton } from "../components/Button.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { StatusChip } from "../components/StatusChip.tsx";
import { Segmented } from "../components/Segmented.tsx";
import { Tooltip } from "../components/Tooltip.tsx";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { errorText, moneyText } from "../labels.ts";
import { Link, match, navigate, usePath } from "../router.tsx";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

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
  return (
    <Segmented
      label={t("surface.label")}
      value={surface}
      onChange={go}
      options={[
        { value: "studio", label: t("surface.studio"), icon: "squares-four" },
        { value: "canvas", label: t("surface.canvas"), icon: "flow-arrow" },
        { value: "graph", label: t("surface.graph"), icon: "tree-structure" },
      ]}
    />
  );
}

/** The drama's surface switch and its chips: preset, format, and what it has spent. */
export function DramaBar({ drama }: { drama: DramaView }) {
  const { t, lang } = useT();
  return (
    <div className="ds-dramabar">
      <SurfaceSwitch drama={drama} />
      <span className="ds-dramabar-gap" />
      {drama.preset && (
        <span className="ds-projectchip">
          <Icon name="sparkle" />
          {drama.preset}
        </span>
      )}
      <span className="ds-projectchip">
        <Icon name="frame-corners" />
        {drama.format}
      </span>
      <Tooltip text={t("spent.about")}>
        <span className="ds-projectchip" tabIndex={0}>
          <Icon name="coins" />
          <span className="num">{moneyText(drama.spent, t, lang)}</span>
          {drama.mode === "replay" && <span className="quiet">{t("budget.simulated")}</span>}
        </span>
      </Tooltip>
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
        <Button variant="destructive" size="sm" icon="stop" busy={stop.busy} onClick={() => setAsking(true)}>
          {t("stop.drama")}
        </Button>
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
      <Button variant="destructive" size="sm" busy>
        {t("stop.stopping")}
      </Button>
    );
  }
  if (drama.status !== "stopped") return null;
  return (
    <>
      {failed}
      <StatusChip status="back" label={t("drama.stopped")} />
      <Button variant="default" size="sm" icon="play" busy={resume.busy} onClick={() => void resume.run()}>
        {t("setup.retry")}
      </Button>
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
      className={cn(buttonVariants({ variant: "default", size: "sm" }), "ds-nextreview")}
      disabled={!others.length}
      aria-label={`${t("next.label")}, ${t("next.waiting", { n: others.length })}`}
      onClick={() => navigate(`/r/${others[0].id}`)}
    >
      {t("next.label")} <span className="ds-count">{others.length}</span>
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
    <nav className="ds-crumb" aria-label={t("crumb.label")}>
      {crumbs.map((crumb, n) => (
        <span key={n} className={n === crumbs.length - 1 ? "is-here" : undefined}>
          {n > 0 && <Icon name="caret-right" />}
          {crumb.to && n < crumbs.length - 1 ? <Link to={crumb.to}>{crumb.label}</Link> : <b aria-current="page">{crumb.label}</b>}
        </span>
      ))}
    </nav>
  );
}

export function TopBar({ crumbs, waiting, ready, children }: { crumbs: Crumb[]; waiting: ReviewSummary[]; ready: boolean; children?: React.ReactNode }) {
  const { t } = useT();
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2].to : undefined;
  return (
    <header className="ds-topbar">
      {back && <IconButton label={t("crumb.back")} icon="caret-left" onClick={() => navigate(back)} />}
      <Breadcrumb crumbs={crumbs} />
      <span className="ds-topbar-gap" />
      {children}
      {ready && <NextReview waiting={waiting} />}
    </header>
  );
}
