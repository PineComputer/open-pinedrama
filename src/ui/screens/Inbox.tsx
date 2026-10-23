import type { ReviewSummary } from "../../shared/types.ts";
import { ago, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { Link } from "../router.tsx";

export function InboxList({ dramaId }: { dramaId?: string }) {
  const { t } = useT();
  const { data } = useResource<ReviewSummary[]>(dramaId ? `/api/inbox?drama=${dramaId}` : "/api/inbox", ["inbox"]);
  if (!data) return <p className="quiet">{t("loading")}</p>;
  if (!data.length) return <p className="empty-note">{t("inbox.empty")}</p>;
  return (
    <div className="queue">
      {data.map((item) => (
        <Link key={item.id} to={`/r/${item.id}`} className={`ask ${item.state === "ended" ? "ended" : ""}`}>
          <div className="thumb" style={item.thumb ? { backgroundImage: `url(${item.thumb})` } : undefined} />
          <div style={{ minWidth: 0 }}>
            <div className="what">
              {t(`kind.${item.kind}` as TKey)}
              {item.episode && <span className="quiet"> · {item.episode}</span>}
            </div>
            <div className="where">
              {[!dramaId ? item.dramaTitle : null, item.items ? `${item.items}` : null].filter(Boolean).join(" · ")}
            </div>
            <div className="words">{item.question}</div>
          </div>
          <div className="when">
            {item.state === "ended" ? t("inbox.ended") : item.state === "saving" ? "…" : <span className="seal-text">●</span>}
            <div className="num" style={{ marginTop: 4 }}>
              {ago(item.createdAt)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function InboxScreen() {
  const { t } = useT();
  return (
    <main className="page">
      <div className="head">
        <h1>{t("inbox.title")}</h1>
      </div>
      <InboxList />
    </main>
  );
}
