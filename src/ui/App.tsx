import { lazy, Suspense, useEffect, useState } from "react";
import type { AppInfo, DramaView, ReviewSummary } from "../shared/types.ts";
import { ApiError, useResource } from "./api.ts";
import { type TKey, useT } from "./i18n.ts";
import { errorText } from "./labels.ts";
import { useReviewNotifications } from "./notify.ts";
import { match, usePath } from "./router.tsx";
import { Drama } from "./screens/Drama.tsx";
import { InboxScreen } from "./screens/Inbox.tsx";
import { NewDrama } from "./screens/NewDrama.tsx";
import { Review } from "./screens/Review.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Slate } from "./screens/Slate.tsx";
import { Welcome } from "./screens/Welcome.tsx";
import { AgentBall, type AgentMode, AgentPanel, useAgentMode } from "./shell/AgentPanel.tsx";
import { NavRail } from "./shell/NavRail.tsx";
import { DramaSidebar, HomeSidebar } from "./shell/Sidebar.tsx";
import { type Crumb, DramaBar, StopControl, TopBar } from "./shell/TopBar.tsx";

/** Before the studio can be used: this window isn't the studio's, or the engine isn't answering. */
function Gate({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useT();
  const signedOut = error instanceof ApiError && error.code === "signed-out";
  return (
    <main className="page gate">
      <h1>{t(signedOut ? "gate.signedOutTitle" : "gate.offlineTitle")}</h1>
      <p className="empty-note">{t(signedOut ? "gate.signedOut" : "gate.offline")}</p>
      {!signedOut && (
        <button className="btn" onClick={onRetry}>
          {t("gate.retry")}
        </button>
      )}
    </main>
  );
}

/** The component gallery: in development and the end-to-end build only (screens/Gallery.tsx). */
const Gallery = import.meta.env.DEV || import.meta.env.VITE_GALLERY === "1" ? lazy(() => import("./screens/Gallery.tsx")) : null;

const TABS: Record<string, TKey> = {
  script: "step.script",
  analyzing: "step.script",
  story: "step.story",
  cut: "step.cut",
  canvas: "surface.canvas",
  graph: "surface.graph",
  crew: "section.crew",
  inbox: "section.inbox",
};

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
 * needs the room: a docked panel shows as the ball there, and opens floating over the board.
 */
function Agent({ drama, episode, mode, onMode, canvas }: { drama: DramaView; episode?: string; mode: AgentMode; onMode: (mode: AgentMode) => void; canvas: boolean }) {
  const shown = canvas && mode === "docked" ? "collapsed" : mode;
  if (shown === "collapsed") {
    const busy = drama.crew.some((computer) => computer.sessions.some((session) => session.state === "open" && !session.waiting));
    return <AgentBall waiting={drama.waiting} busy={busy} onOpen={() => onMode(canvas ? "floating" : "docked")} />;
  }
  return <AgentPanel drama={drama} episode={episode} mode={shown} onMode={onMode} />;
}

export function App() {
  const { path } = usePath();
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const ready = app.data !== undefined && app.data.mode !== "none";
  const inbox = useResource<ReviewSummary[]>(ready ? "/api/inbox" : null, ["inbox"]);
  const waiting = (inbox.data ?? []).filter((item) => item.state === "open");
  const review = match("/r/:id", path);
  const reviewed = review ? inbox.data?.find((item) => item.id === review.id) : undefined;
  // The drama in view: its page's, or the one the review in view belongs to.
  const page = match("/d/:id/e/:code", path) ?? match("/d/:id/:tab?", path);
  const dramaId = page?.id ?? reviewed?.dramaId;
  const drama = useResource<DramaView>(dramaId && ready ? `/api/dramas/${dramaId}` : null, [`drama:${dramaId}`]);
  const [sidebarOpen, toggleSidebar] = useSidebar();
  const [agentMode, setAgentMode] = useAgentMode();
  const { t } = useT();
  useReviewNotifications(inbox.data && waiting);

  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) ${t("app.name")}` : t("app.name");
  }, [waiting.length, t]);

  if (Gallery && path === "/dev/gallery") {
    return (
      <Suspense>
        <Gallery />
      </Suspense>
    );
  }
  if (!app.data) return app.error !== undefined ? <Gate error={app.error} onRetry={app.reload} /> : null;
  if (app.data.mode === "none") return <Welcome onReady={app.reload} />;

  const home: Crumb = { label: t("nav.dramas"), to: "/" };
  const inDrama: Crumb | undefined = drama.data && { label: drama.data.title, to: `/d/${drama.data.id}` };
  let crumbs: Crumb[] = [home];
  let screen = <Slate />;
  let params: Record<string, string> | null;
  const tab = match("/d/:id/e/:code", path) ? "episode" : (match("/d/:id/:tab?", path)?.tab ?? "board");
  if (path === "/new") {
    screen = <NewDrama />;
    crumbs = [home, { label: t("new.title") }];
  } else if (path === "/inbox") {
    screen = <InboxScreen />;
    crumbs = [{ label: t("inbox.title") }];
  } else if (path === "/settings") {
    screen = <Settings app={app.data} onChange={app.reload} />;
    crumbs = [{ label: t("settings.title") }];
  } else if ((params = review)) {
    screen = <Review key={params.id} id={params.id} />;
    crumbs = [home, ...(inDrama ? [inDrama] : []), ...(reviewed?.episode ? [{ label: reviewed.episode, to: `/d/${reviewed.dramaId}/e/${reviewed.episode}` }] : []), { label: reviewed ? t(`kind.${reviewed.kind}`) : t("inbox.title") }];
  } else if (page) {
    if (drama.data) screen = <Drama drama={drama.data} tab={tab} episode={match("/d/:id/e/:code", path)?.code} />;
    else
      screen = (
        <div className="page">
          <p className={drama.error !== undefined ? "error" : "quiet"}>{drama.error !== undefined ? errorText(drama.error, t) : t("loading")}</p>
        </div>
      );
    const code = match("/d/:id/e/:code", path)?.code;
    crumbs = [home, ...(inDrama ? [inDrama] : []), ...(code ? [{ label: t("step.episodes"), to: inDrama?.to }, { label: code }] : TABS[tab] ? [{ label: t(TABS[tab]) }] : [{ label: t("step.episodes") }])];
  }

  const sidebar =
    drama.data && dramaId ? (
      <DramaSidebar drama={drama.data} tab={review ? "review" : tab} episode={match("/d/:id/e/:code", path)?.code ?? reviewed?.episode} />
    ) : (
      <HomeSidebar path={path} waiting={waiting.length} replay={app.data.mode === "replay"} />
    );
  return (
    <div className="ds-app">
      <NavRail path={path} dramaId={dramaId} sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
      {sidebarOpen && sidebar}
      <div className="ds-main">
        <TopBar crumbs={crumbs} waiting={waiting} ready={ready} bar={page && drama.data ? <DramaBar drama={drama.data} /> : undefined}>
          {drama.data && <StopControl drama={drama.data} />}
        </TopBar>
        <main className="ds-scroll">{screen}</main>
      </div>
      {drama.data && dramaId && <Agent drama={drama.data} episode={match("/d/:id/e/:code", path)?.code ?? reviewed?.episode} mode={agentMode} onMode={setAgentMode} canvas={tab === "canvas" || tab === "graph"} />}
    </div>
  );
}
