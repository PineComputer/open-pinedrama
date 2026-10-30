import { lazy, Suspense, useEffect, useState } from "react";
import type { AppInfo, DramaView, ReviewSummary } from "../shared/types.ts";
import { ApiError, useResource } from "./api.ts";
import { type TKey, useT } from "./i18n.ts";
import { errorText } from "./labels.ts";
import { useReviewNotifications } from "./notify.ts";
import { match, usePath } from "./router.tsx";
import { Chat } from "./screens/Chat.tsx";
import { Drama } from "./screens/Drama.tsx";
import { InboxScreen } from "./screens/Inbox.tsx";
import { NewDrama } from "./screens/NewDrama.tsx";
import { Review } from "./screens/Review.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Slate } from "./screens/Slate.tsx";
import { Welcome } from "./screens/Welcome.tsx";
import { NavRail } from "./shell/NavRail.tsx";
import { DramaSidebar, HomeSidebar } from "./shell/Sidebar.tsx";
import { type Crumb, TopBar } from "./shell/TopBar.tsx";

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
  const [talking, setTalking] = useState(false);
  const { t } = useT();
  useReviewNotifications(inbox.data && waiting);

  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) ${t("app.name")}` : t("app.name");
  }, [waiting.length, t]);
  useEffect(() => setTalking(false), [dramaId]);

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
        <main className="page">
          <p className={drama.error !== undefined ? "error" : "quiet"}>{drama.error !== undefined ? errorText(drama.error, t) : t("loading")}</p>
        </main>
      );
    const code = match("/d/:id/e/:code", path)?.code;
    crumbs = [home, ...(inDrama ? [inDrama] : []), ...(code ? [{ label: t("step.episodes"), to: inDrama?.to }, { label: code }] : TABS[tab] ? [{ label: t(TABS[tab]) }] : [{ label: t("step.episodes") }])];
  }

  const sidebar =
    drama.data && dramaId ? (
      <DramaSidebar drama={drama.data} tab={review ? "review" : tab} episode={match("/d/:id/e/:code", path)?.code ?? reviewed?.episode} onTalk={() => setTalking((open) => !open)} />
    ) : (
      <HomeSidebar path={path} waiting={waiting.length} replay={app.data.mode === "replay"} />
    );
  return (
    <div className="ds-app">
      <NavRail path={path} dramaId={dramaId} sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
      {sidebarOpen && sidebar}
      <div className="ds-main">
        <TopBar crumbs={crumbs} waiting={waiting} ready={ready} />
        <div className="ds-scroll">{screen}</div>
      </div>
      {talking && dramaId && <Chat dramaId={dramaId} onClose={() => setTalking(false)} />}
    </div>
  );
}
