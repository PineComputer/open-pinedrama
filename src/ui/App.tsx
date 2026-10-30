import { lazy, Suspense, useEffect } from "react";
import type { AppInfo, DramaView, ReviewSummary } from "../shared/types.ts";
import { ApiError, useResource } from "./api.ts";
import { useT } from "./i18n.ts";
import { useReviewNotifications } from "./notify.ts";
import { match, usePath } from "./router.tsx";
import { Drama } from "./screens/Drama.tsx";
import { InboxScreen } from "./screens/Inbox.tsx";
import { NewDrama } from "./screens/NewDrama.tsx";
import { Review } from "./screens/Review.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Slate } from "./screens/Slate.tsx";
import { Welcome } from "./screens/Welcome.tsx";
import { TopBar } from "./shell/TopBar.tsx";

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

export function App() {
  const { path } = usePath();
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const inbox = useResource<ReviewSummary[]>(app.data && app.data.mode !== "none" ? "/api/inbox" : null, ["inbox"]);
  const waiting = (inbox.data ?? []).filter((item) => item.state === "open");
  // In a drama, the top bar shows it.
  const dramaId = path.startsWith("/d/") ? decodeURIComponent(path.split("/")[2] ?? "") || undefined : undefined;
  const drama = useResource<DramaView>(dramaId && app.data && app.data.mode !== "none" ? `/api/dramas/${dramaId}` : null, [`drama:${dramaId}`]);
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
  if (!app.data) {
    return (
      <>
        <TopBar waiting={[]} />
        {app.error !== undefined && <Gate error={app.error} onRetry={app.reload} />}
      </>
    );
  }
  if (app.data.mode === "none") {
    return (
      <>
        <TopBar app={app.data} waiting={[]} />
        <Welcome onReady={app.reload} />
      </>
    );
  }

  let screen = <Slate />;
  let params: Record<string, string> | null;
  if (path === "/new") screen = <NewDrama />;
  else if (path === "/inbox") screen = <InboxScreen />;
  else if (path === "/settings") screen = <Settings app={app.data} onChange={app.reload} />;
  else if ((params = match("/r/:id", path))) screen = <Review key={params.id} id={params.id} />;
  else if ((params = match("/d/:id/e/:code", path))) screen = <Drama id={params.id} tab="episode" episode={params.code} />;
  else if ((params = match("/d/:id/:tab?", path))) screen = <Drama id={params.id} tab={params.tab ?? "board"} />;

  return (
    <>
      <TopBar app={app.data} waiting={waiting} drama={dramaId ? drama.data : undefined} />
      {screen}
    </>
  );
}
