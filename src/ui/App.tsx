import { useEffect } from "react";
import type { AppInfo, ReviewSummary } from "../shared/types.ts";
import { useResource } from "./api.ts";
import { setLang, useT } from "./i18n.ts";
import { Link, match, navigate, usePath } from "./router.tsx";
import { Drama } from "./screens/Drama.tsx";
import { InboxScreen } from "./screens/Inbox.tsx";
import { NewDrama } from "./screens/NewDrama.tsx";
import { Review } from "./screens/Review.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Slate } from "./screens/Slate.tsx";
import { Welcome } from "./screens/Welcome.tsx";

function Bar({ app, waiting }: { app: AppInfo; waiting: ReviewSummary[] }) {
  const { t, lang } = useT();
  const { path } = usePath();
  // On a review, "next" means the one after it.
  const current = match("/r/:id", path)?.id;
  const others = waiting.filter((item) => item.id !== current);
  const ready = app.mode !== "none";
  return (
    <header className="bar">
      <Link to="/" className="wordmark">
        <span className="seal">松</span>
        {t("app.name")}
      </Link>
      {ready && (
        <nav>
          <Link to="/" className={path === "/" || path.startsWith("/d/") || path === "/new" ? "on" : ""}>
            {t("nav.dramas")}
          </Link>
          <Link to="/inbox" className={path === "/inbox" ? "on" : ""}>
            {t("nav.inbox")}
          </Link>
        </nav>
      )}
      <span className="spacer" />
      <div className="meta">
        {app.mode === "replay" && <span>{t("mode.replay")}</span>}
        <button className="link" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
          {lang === "zh" ? "English" : "中文"}
        </button>
        {ready && (
          <Link to="/settings" className={path === "/settings" ? "" : "quiet"}>
            {t("nav.settings")}
          </Link>
        )}
      </div>
      {ready && (
        <button className={`next ${others.length ? "" : "none"}`} disabled={!others.length} onClick={() => others[0] && navigate(`/r/${others[0].id}`)}>
          {others.length > 0 && <span className="seal">{others.length}</span>}
          {others.length ? t("next.count", { n: others.length }) : t("next.none")}
        </button>
      )}
    </header>
  );
}

export function App() {
  const { path } = usePath();
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const inbox = useResource<ReviewSummary[]>(app.data && app.data.mode !== "none" ? "/api/inbox" : null, ["inbox"]);
  const waiting = (inbox.data ?? []).filter((item) => item.state === "open");
  const { t } = useT();

  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) ${t("app.name")}` : t("app.name");
  }, [waiting.length, t]);

  if (!app.data) return null;
  if (app.data.mode === "none") {
    return (
      <>
        <Bar app={app.data} waiting={[]} />
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
  else if ((params = match("/d/:id/:tab?", path))) screen = <Drama id={params.id} tab={params.tab ?? "board"} />;

  return (
    <>
      <Bar app={app.data} waiting={waiting} />
      {screen}
    </>
  );
}
