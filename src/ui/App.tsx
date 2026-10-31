import { Link, linkOptions, type NotFoundRouteProps, Outlet, useLocation } from "@tanstack/react-router";
import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import type { LineageView } from "../shared/lineage.ts";
import type { AppInfo, DramaView, ReviewSummary } from "../shared/types.ts";
import { ApiError, useResource } from "./api.ts";
import { type TKey, useT } from "./i18n.ts";
import { errorText, isSetupScreen, scriptWaits } from "./labels.ts";
import { useReviewNotifications } from "./notify.ts";
import { type Page, usePlace, useRoute } from "./place.ts";
import { EmptyState } from "./components/EmptyState.tsx";
import { Graph } from "./graph/Graph.tsx";
import { Drama } from "./screens/Drama.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Welcome } from "./screens/Welcome.tsx";
import { AgentBall, type AgentMode, AgentPanel, useAgentMode } from "./shell/AgentPanel.tsx";
import { NavRail } from "./shell/NavRail.tsx";
import { DramaSidebar, HomeSidebar } from "./shell/Sidebar.tsx";
import { type Crumb, StopControl, TopBar } from "./shell/TopBar.tsx";
import { ExportMenu } from "./shell/ExportMenu.tsx";
import { AsideSlot } from "./shell/aside.ts";
import { buttonClass } from "./components/Button.tsx";

/** Before the studio can be used: this window isn't the studio's, or the engine isn't answering. */
function Gate({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useT();
  const signedOut = error instanceof ApiError && error.code === "signed-out";
  return (
    <main className="page gate">
      <h1>{t(signedOut ? "gate.signedOutTitle" : "gate.offlineTitle")}</h1>
      <p className="empty-note">{t(signedOut ? "gate.signedOut" : "gate.offline")}</p>
      {!signedOut && (
        <button className={buttonClass()} onClick={onRetry}>
          {t("gate.retry")}
        </button>
      )}
    </main>
  );
}

// The label each drama page's crumb shows.
const LABEL: Partial<Record<Page, TKey>> = {
  script: "step.script",
  analyzing: "step.script",
  story: "step.story",
  characters: "step.story",
  locations: "step.story",
  props: "step.story",
  delivery: "step.cut",
  canvasPick: "surface.canvas",
  outOfDate: "surface.graph",
  crew: "section.crew",
  episodes: "step.episodes",
};

// The pages that need the room: a docked agent shows as the ball there (Agent, below).
const ROOMS: Page[] = ["canvasPick", "canvas", "outOfDate", "cut", "delivery", "review"];

const SIDEBAR = "studio.sidebar";

/** Whether the sidebar is open: the maker's last choice, a convenience kept in this browser. */
function useSidebar(): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR) !== "closed";
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setOpen((was) => {
      try {
        localStorage.setItem(SIDEBAR, was ? "closed" : "open");
      } catch {
        // Storage may be blocked; the sidebar still opens and closes for this window.
      }
      return !was;
    });
  return [open, toggle];
}

/**
 * The agent panel for the drama in view, as the maker left it. On Canvas and Graph the board
 * needs the room, and the review room its stage, as the pro direction's Review room has it: a
 * docked panel shows as the ball there, and opens floating over the work.
 */
function Agent({ drama, episode, mode, onMode, canvas }: { drama: DramaView; episode?: string; mode: AgentMode; onMode: (mode: AgentMode) => void; canvas: boolean }) {
  const shown = canvas && mode === "docked" ? "collapsed" : mode;
  if (shown === "collapsed") {
    const busy = drama.crew.some((computer) => computer.sessions.some((session) => session.state === "open" && !session.waiting));
    return <AgentBall waiting={drama.waiting} busy={busy} onOpen={() => onMode(canvas ? "floating" : "docked")} />;
  }
  return <AgentPanel drama={drama} episode={episode} mode={shown} onMode={onMode} />;
}

/** A path the studio has no page for, with the way back to the dramas. */
export function NotFound() {
  const { t } = useT();
  const path = useLocation({ select: (location) => location.pathname });
  return (
    <EmptyState title={t("notFound.title")} action={<Link className="btn primary" to="/">{t("notFound.home")}</Link>}>
      {t("notFound.text", { path })}
    </EmptyState>
  );
}

/** An episode or item the drama doesn't have (Codex's rebuttal, IA §14.1), with the way back to the drama. */
function Missing({ dramaId, what }: { dramaId: string; what: string }) {
  const { t } = useT();
  return (
    <EmptyState title={t("notFound.title")} action={<Link className="btn primary" to="/d/$dramaId/episodes" params={{ dramaId }}>{t("notFound.drama")}</Link>}>
      {t("notFound.object", { what })}
    </EmptyState>
  );
}

/** A drama route's Not found: what the URL names that the drama can't have, else the path. */
export function MissingObject({ data }: NotFoundRouteProps) {
  const dramaId = useRoute().params.dramaId;
  const what = (data as { what?: string } | undefined)?.what;
  return dramaId && what !== undefined ? <Missing dramaId={dramaId} what={what} /> : <NotFound />;
}

/** What the frame loaded that the pages in it use: the studio's mode, and the drama in view as it lives. */
interface Shell {
  app: AppInfo;
  reloadApp: () => void;
  drama: { data: DramaView | undefined; error: unknown };
}

const ShellContext = createContext<Shell | null>(null);

function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("A studio page renders inside App.");
  return shell;
}

/** The drama a drama page shows; DramaPage renders its pages only once it has loaded. */
export function useDrama(): DramaView {
  const drama = useShell().drama.data;
  if (!drama) throw new Error("A drama page renders inside DramaPage.");
  return drama;
}

export function SettingsPage() {
  const { app, reloadApp } = useShell();
  return <Settings app={app} onChange={reloadApp} />;
}

/** The component gallery: in development and the end-to-end build only (screens/Gallery.tsx). */
export const Gallery = import.meta.env.DEV || import.meta.env.VITE_GALLERY === "1" ? lazy(() => import("./screens/Gallery.tsx")) : null;

export function GalleryPage() {
  return Gallery && (
    <Suspense>
      <Gallery />
    </Suspense>
  );
}

/**
 * A drama's page: the drama loaded, the episode and item the URL names checked against it (an episode against its
 * episodes, an item or asset against its lineage), then the page, or Lineage when the item is shown as its relations.
 */
export function DramaPage() {
  const { t } = useT();
  const { drama } = useShell();
  const { page, params, search } = useRoute();
  const place = usePlace()!;
  const { assetId } = params;
  const shelf = page === "characters" ? "look" : page === "locations" ? "plate" : page === "props" ? "prop" : undefined;
  const asked = search.item;
  const lineage = useResource<LineageView>(asked !== undefined || assetId !== undefined ? `/api/dramas/${place.dramaId}/lineage` : null, [`project:${place.dramaId}`]);
  if (!drama.data)
    return (
      <div className="page">
        <p className={drama.error !== undefined ? "error" : "quiet"}>{drama.error !== undefined ? errorText(drama.error, t) : t("loading")}</p>
      </div>
    );
  if (place.episode && !drama.data.episodeRows.some((row) => row.code === place.episode)) return <Missing dramaId={place.dramaId} what={place.episode} />;
  if (asked !== undefined || assetId !== undefined) {
    if (lineage.error !== undefined) return <p className="error">{errorText(lineage.error, t)}</p>;
    if (!lineage.data) return <p className="quiet">{t("loading")}</p>;
    const nodes = lineage.data.lineage?.nodes ?? [];
    if (asked !== undefined && !nodes.some((node) => node.id === asked)) return <Missing dramaId={place.dramaId} what={asked} />;
    if (assetId !== undefined && !nodes.some((node) => node.kind === shelf && node.where.subject === assetId)) return <Missing dramaId={place.dramaId} what={assetId} />;
  }
  return (
    <Drama drama={drama.data} page={page}>
      {place.surface === "lineage" && page !== "outOfDate" ? <Graph dramaId={drama.data.id} /> : <Outlet />}
    </Drama>
  );
}

export function App() {
  const { page, params, search } = useRoute();
  const view = search.view;
  const [asideSlot, setAsideSlot] = useState<HTMLElement | null>(null);
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const ready = app.data !== undefined && app.data.mode !== "none";
  const inbox = useResource<ReviewSummary[]>(ready ? "/api/inbox" : null, ["inbox"]);
  const waiting = (inbox.data ?? []).filter((item) => item.state === "open");
  const reviewed = params.reviewId ? inbox.data?.find((item) => item.id === params.reviewId) : undefined;
  // The drama in view: its page's, or the one the review in view belongs to.
  const dramaId = params.dramaId ?? reviewed?.dramaId;
  const drama = useResource<DramaView>(dramaId && ready ? `/api/dramas/${dramaId}` : null, [`drama:${dramaId}`]);
  const place = usePlace();
  const [sidebarOpen, toggleSidebar] = useSidebar();
  const [agentMode, setAgentMode] = useAgentMode();
  const { t } = useT();
  useReviewNotifications(inbox.data && waiting);

  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) ${t("app.name")}` : t("app.name");
  }, [waiting.length, t]);

  if (page === "gallery") return <Outlet />;
  if (!app.data) return app.error !== undefined ? <Gate error={app.error} onRetry={app.reload} /> : null;
  if (app.data.mode === "none") return <Welcome onReady={app.reload} />;

  const home: Crumb = { label: t("nav.dramas"), to: linkOptions({ to: "/" }) };
  const inDrama: Crumb | undefined = drama.data && { label: drama.data.title, to: linkOptions({ to: "/d/$dramaId/episodes", params: { dramaId: drama.data.id } }) };
  // The episode in view, wherever it shows (its List, Canvas or Cut, a review of it): the sidebar marks it and the agent follows it (B3).
  const followed = place?.episode ?? reviewed?.episode;
  let crumbs: Crumb[];
  if (page === "home") crumbs = [home];
  else if (page === "new") crumbs = [home, { label: t("new.title") }];
  else if (page === "reviews") crumbs = [{ label: t("inbox.title") }];
  else if (page === "settings") crumbs = [{ label: t("settings.title") }];
  else if (page === "review")
    crumbs = [
      home,
      ...(inDrama ? [inDrama] : []),
      ...(reviewed?.episode ? [{ label: reviewed.episode, to: linkOptions({ to: "/d/$dramaId/e/$episodeCode/list", params: { dramaId: reviewed.dramaId, episodeCode: reviewed.episode } }) }] : []),
      { label: reviewed ? t(`kind.${reviewed.kind}`) : t("inbox.title") },
    ];
  else if (!page) crumbs = [home, { label: t("notFound.title") }];
  else if (place?.episode) crumbs = [home, ...(inDrama ? [inDrama, { label: t("step.episodes"), to: inDrama.to }] : []), { label: place.episode }];
  // The setup's own screens, as design/'s crumbs read: Setup › Script, or Setup › Fountain review while the rewrite waits on the maker.
  else if (drama.data && isSetupScreen(drama.data, page)) crumbs = [home, ...(inDrama ? [inDrama] : []), { label: t("sidebar.setup") }, { label: t(page === "script" && scriptWaits(drama.data) ? "crumb.fountainReview" : "step.script") }];
  else crumbs = [home, ...(inDrama ? [inDrama] : []), { label: t(LABEL[page] ?? "step.episodes") }];

  const sidebar = drama.data && dramaId ? <DramaSidebar drama={drama.data} page={page} episode={followed} /> : <HomeSidebar page={page} replay={app.data.mode === "replay"} />;
  return (
    // The design's frame (design/app.js, App and each screen): the rail, the sidebar, then the main column, its
    // top bar over a body that holds the work beside the agent's panel.
    <div className="app">
      <NavRail page={page} dramaId={dramaId} sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
      {sidebarOpen && sidebar}
      <div className="main">
        {/* design/'s Home has no top bar: the page starts at the greeting; its Upload's has no Next review. */}
        {page !== "home" && (
          <TopBar crumbs={crumbs} waiting={waiting} ready={ready} next={page !== "new"}>
            {drama.data && <ExportMenu drama={drama.data} />}
            {drama.data && <StopControl drama={drama.data} />}
          </TopBar>
        )}
        <div className="body" style={{ position: "relative" }}>
          <ShellContext.Provider value={{ app: app.data, reloadApp: app.reload, drama }}>
            <AsideSlot.Provider value={asideSlot}>
              <main className="scrollmain ds-scroll">
                <Outlet />
              </main>
            </AsideSlot.Provider>
          </ShellContext.Provider>
          <div ref={setAsideSlot} style={{ display: "contents" }} />
          {/* design/'s setup screens (Analyzing, the Fountain review) go full width, with no agent beside them. */}
          {drama.data && dramaId && !(page && isSetupScreen(drama.data, page)) && <Agent drama={drama.data} episode={followed} mode={agentMode} onMode={setAgentMode} canvas={(page !== undefined && ROOMS.includes(page)) || view === "lineage"} />}
        </div>
      </div>
    </div>
  );
}
