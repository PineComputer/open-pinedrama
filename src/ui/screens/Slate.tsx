import { Plus } from "lucide-react";
import type { DramaCard } from "../../shared/types.ts";
import { formatMoney, useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { lookLabel } from "../labels.ts";
import { Link } from "../router.tsx";

function Status({ drama }: { drama: DramaCard }) {
  const { t } = useT();
  if (drama.status === "setup") return <span className="chip work"><span className="dot pulse" />{t("card.casting")}</span>;
  if (drama.status === "stopped") return <span className="chip bad">{t("card.stopped")}</span>;
  if (drama.status === "done") return <span className="chip ok">{t("card.finished")}</span>;
  return null;
}

export function Slate() {
  const { t } = useT();
  const { data, error } = useResource<DramaCard[]>("/api/dramas", ["dramas", "inbox"]);
  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("slate.title")}</h1>
        <span className="spacer" style={{ flex: 1 }} />
        <Link to="/new" className="btn primary">
          <Plus size={16} />
          {t("slate.new")}
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="slate">
        {(data ?? []).map((drama) => {
          const { total, done } = drama.episodes;
          return (
            <Link key={drama.id} to={`/d/${drama.id}`} className="card">
              <div className="poster">{drama.cover ? <img src={drama.cover} alt="" /> : <span className="initial">{drama.title.slice(0, 1)}</span>}</div>
              <div className="card-body">
                <div className="row">
                  <span className="card-title">{drama.title}</span>
                  <span style={{ flex: 1 }} />
                  <Status drama={drama} />
                </div>
                <span className="muted">
                  {drama.format} · {lookLabel(drama.look, t)}
                </span>
                {total > 0 && (
                  <>
                    <div className="bar">
                      <span style={{ width: `${(done / total) * 100}%` }} />
                    </div>
                    <span className="muted">{t("card.episodes", { done, total })}</span>
                  </>
                )}
                <div className="card-meta">
                  {drama.waiting > 0 && <span className="chip accent">● {t("card.needYou", { n: drama.waiting })}</span>}
                  {drama.computers > 0 && <span className="chip work">{t("card.atWork", { n: drama.computers })}</span>}
                  <span className="chip">
                    {formatMoney(drama.money.agent)}
                    {drama.money.budget ? ` / ${formatMoney(drama.money.budget)}` : ""}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
        <Link to="/new" className="card new">
          <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
            <Plus size={28} />
            {data && data.length === 0 ? <span style={{ maxWidth: 240, textAlign: "center" }}>{t("slate.empty")}</span> : t("slate.new")}
          </div>
        </Link>
      </div>
    </main>
  );
}
