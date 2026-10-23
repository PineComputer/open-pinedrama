import { Inbox as InboxIcon, Languages, Play } from "lucide-react";
import { useEffect } from "react";
import type { AppInfo, ReviewSummary } from "../shared/types.ts";
import { useResource } from "./api.ts";
import { setLang, useT } from "./i18n.ts";
import { Link, match, navigate, usePath } from "./router.tsx";
import { Drama } from "./screens/Drama.tsx";
import { InboxScreen } from "./screens/Inbox.tsx";
import { NewDrama } from "./screens/NewDrama.tsx";
import { Review } from "./screens/Review.tsx";
import { Slate } from "./screens/Slate.tsx";

function TopBar({ app, waiting }: { app?: AppInfo; waiting: ReviewSummary[] }) {
  const { t, lang } = useT();
  const { path } = usePath();
  // On a review, "next" means the one after it.
  const current = match("/r/:id", path)?.id;
  const others = waiting.filter((item) => item.id !== current);
  const next = others[0];
  return (
    <header className="top">
      <Link to="/" className="brand">
        <span className="brand-mark" />
        {t("app.name")}
      </Link>
      <nav>
        <Link to="/" className={path === "/" || path.startsWith("/d/") || path === "/new" ? "on" : ""}>
          {t("nav.dramas")}
        </Link>
        <Link to="/inbox" className={path === "/inbox" ? "on" : ""}>
          {t("nav.inbox")}
        </Link>
      </nav>
      <span className="spacer" />
      {app?.mode === "replay" && (
        <span className="mode" title={t("mode.replay.hint")}>
          {t("mode.replay")}
        </span>
      )}
      <button className="btn ghost small" onClick={() => setLang(lang === "zh" ? "en" : "zh")} title="中文 / English">
        <Languages size={15} />
        {lang === "zh" ? "EN" : "中文"}
      </button>
      <button className={`btn small ${next ? "primary" : ""}`} disabled={!next} onClick={() => next && navigate(`/r/${next.id}`)}>
        {next ? <Play size={14} /> : <InboxIcon size={14} />}
        {next ? t("next.review") : t("next.none")}
        {next && <span className="count">{others.length}</span>}
      </button>
    </header>
  );
}

export function App() {
  const { path } = usePath();
  const app = useResource<AppInfo>("/api/app", []);
  const inbox = useResource<ReviewSummary[]>("/api/inbox", ["inbox"]);
  const waiting = (inbox.data ?? []).filter((item) => item.state === "open");
  const { t } = useT();

  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) ${t("app.name")}` : t("app.name");
  }, [waiting.length, t]);

  let screen = <Slate />;
  let params: Record<string, string> | null;
  if (path === "/new") screen = <NewDrama />;
  else if (path === "/inbox") screen = <InboxScreen />;
  else if ((params = match("/r/:id", path))) screen = <Review key={params.id} id={params.id} />;
  else if ((params = match("/d/:id/:tab?", path))) screen = <Drama id={params.id} tab={params.tab ?? "board"} />;

  return (
    <>
      <TopBar app={app.data} waiting={waiting} />
      {screen}
    </>
  );
}
