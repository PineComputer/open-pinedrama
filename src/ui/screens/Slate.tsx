import type { AppInfo, DramaCard } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { lookLabel } from "../labels.ts";
import { Link, navigate } from "../router.tsx";

const CJK = /[㐀-鿿]/;

/** A drama's poster: its title set as type with its seal, over its leads once the agent has drawn them. */
function Poster({ drama }: { drama: DramaCard }) {
  const { t } = useT();
  const stamp = drama.status === "setup" ? t("drama.casting") : drama.status === "stopped" ? t("drama.stopped") : drama.status === "done" ? t("drama.finished") : undefined;
  return (
    <div className={`poster ${CJK.test(drama.title) ? "vertical" : ""} ${drama.cast.length ? "cast" : ""}`}>
      {drama.cast.length > 0 && (
        <div className="leads">
          {drama.cast.map((url) => (
            <span key={url} style={{ backgroundImage: `url(${url})` }} />
          ))}
        </div>
      )}
      <span className="seal">{[...drama.title.trim()][0]}</span>
      <h3>{drama.title}</h3>
      <div className="foot">{stamp && <span className="stamp">{stamp}</span>}</div>
    </div>
  );
}

export function Slate() {
  const { t, lang } = useT();
  const { data, error } = useResource<DramaCard[]>("/api/dramas", ["dramas", "inbox"]);
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const dramas = data ?? [];
  const producing = dramas.filter((drama) => drama.status === "setup" || drama.status === "production").length;
  const waiting = dramas.reduce((sum, drama) => sum + drama.waiting, 0);
  return (
    <main className="page">
      <div className="head">
        <h1>{t("slate.title")}</h1>
        {dramas.length > 0 && <span className="facts">{t("slate.facts", { a: producing, b: waiting })}</span>}
        <span className="spacer" />
        <Link to="/new" className="btn ink">
          {t("slate.new")}
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      {data && dramas.length === 0 && (
        <div style={{ display: "grid", gap: 18, justifyItems: "start" }}>
          <p className="empty-note" style={{ margin: 0 }}>
            {t("slate.empty")}
          </p>
          {app.data?.mode === "replay" && (
            <button className="btn" onClick={() => void api<{ id: string }>("/api/dramas/sample", { method: "POST", json: { language: lang } }).then(({ id }) => navigate(`/d/${id}`))}>
              {t("slate.sample")}
            </button>
          )}
        </div>
      )}
      <div className="shelf" style={{ marginTop: dramas.length ? 0 : 36 }}>
        {dramas.map((drama) => {
          const { total, done } = drama.episodes;
          return (
            <Link key={drama.id} to={`/d/${drama.id}`} className="drama">
              <Poster drama={drama} />
              <div className="title">{drama.title}</div>
              <div className="line">
                {total > 0 ? `${t("drama.episodes", { done, total })} · ` : ""}
                {drama.format.split(",")[0]} · {lookLabel(drama.look, t)}
              </div>
              {total > 0 && (
                <div className="progress">
                  <span style={{ width: `${(done / total) * 100}%` }} />
                </div>
              )}
              {drama.waiting > 0 && <div className="needs">{t("drama.needs", { n: drama.waiting })}</div>}
            </Link>
          );
        })}
        <Link to="/new" className="add-drama">
          <div>
            <div className="plus">+</div>
            {t("slate.new")}
          </div>
        </Link>
      </div>
    </main>
  );
}
