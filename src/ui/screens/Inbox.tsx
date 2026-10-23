import type { ReviewSummary } from "../../shared/types.ts";
import { ago, useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { Link } from "../router.tsx";

export function InboxList({ dramaId }: { dramaId?: string }) {
  const { t } = useT();
  const { data } = useResource<ReviewSummary[]>(dramaId ? `/api/inbox?drama=${dramaId}` : "/api/inbox", ["inbox"]);
  if (!data) return <p className="muted">{t("loading")}</p>;
  if (!data.length) return <p className="empty">{t("inbox.empty")}</p>;
  return (
    <div className="inbox">
      {data.map((item) => (
        <Link key={item.id} to={`/r/${item.id}`} className="inbox-item">
          <div className="thumb" style={item.thumb ? { backgroundImage: `url(${item.thumb})` } : undefined} />
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <b>{t(`kind.${item.kind}`)}</b>
              {item.episode && <span className="chip">{item.episode}</span>}
              {!dramaId && <span className="muted">{item.dramaTitle}</span>}
              {item.items > 0 && <span className="muted">· {item.items}</span>}
            </div>
            <div className="q">{item.question}</div>
          </div>
          <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
            {item.state === "ended" ? <span className="chip bad">{t("inbox.ended")}</span> : item.state === "saving" ? <span className="chip work">…</span> : <span className="chip accent">●</span>}
            <span className="muted">{ago(item.createdAt)}</span>
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
      <div className="page-head">
        <h1>{t("inbox.title")}</h1>
      </div>
      <InboxList />
    </main>
  );
}
