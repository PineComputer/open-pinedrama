import { connectionFromDelegation, type DelegatedConnection } from "@pinesandbox/computer-web";
import { PineDesktop } from "@pinesandbox/computer-web/react";
import { Monitor, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppInfo, DramaView, SessionView } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { useT } from "../i18n.ts";

/** A session's live desktop, view only, with a fresh two-minute token on every (re)connect. */
function Desk({ session, onClose }: { session: SessionView; onClose: () => void }) {
  const { t } = useT();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const token = async () => connectionFromDelegation(await api<DelegatedConnection>(`/api/sessions/${session.id}/desktop`, { method: "POST" })).token;
  useEffect(() => {
    api<DelegatedConnection>(`/api/sessions/${session.id}/desktop`, { method: "POST" })
      .then((delegation) => setUrl(connectionFromDelegation(delegation).url))
      .catch((reason: Error) => setError(reason.message));
  }, [session.id]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="desk" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <b>{session.episode ?? t("crew.setup")}</b>
          <span style={{ flex: 1 }} />
          <button className="btn ghost small" onClick={onClose}>
            <X size={15} />
            {t("crew.close")}
          </button>
        </div>
        {error ? <p className="error" style={{ margin: 16 }}>{error}</p> : url ? <PineDesktop url={url} token={token} control="view" style={{ width: "100%", height: "100%" }} /> : <p className="muted" style={{ margin: 16 }}>{t("loading")}</p>}
      </div>
    </div>
  );
}

export function Crew({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const app = useResource<AppInfo>("/api/app", []);
  const [watching, setWatching] = useState<SessionView>();
  if (!drama.crew.length) return <p className="empty">{t("crew.none")}</p>;
  return (
    <div className="crew">
      {drama.crew.map((computer) => {
        const slots = Math.max(drama.perComputer, computer.sessions.length);
        return (
          <div key={computer.id} className="machine">
            <div className="machine-head">
              <b>{computer.label}</b>
              <span className={`chip ${computer.state === "running" ? "work" : computer.state === "failed" ? "bad" : ""}`}>{computer.state}</span>
              {computer.idleTimeoutMinutes !== null && <span className="muted">{t("crew.idle", { m: computer.idleTimeoutMinutes })}</span>}
              {computer.lastError && <span className="error">{computer.lastError}</span>}
            </div>
            <div className="slots">
              {Array.from({ length: slots }, (_, index) => {
                const session = computer.sessions[index];
                if (!session) return <div key={index} className="slot empty">—</div>;
                return (
                  <div key={session.id} className="slot">
                    <div className="row">
                      <b>{session.episode ?? t("crew.setup")}</b>
                      {session.waiting && <span className="chip accent">{t("crew.waiting")}</span>}
                      <span style={{ flex: 1 }} />
                      {app.data?.mode === "pine" && (
                        <button className="btn ghost small" onClick={() => setWatching(session)}>
                          <Monitor size={14} />
                          {t("crew.watch")}
                        </button>
                      )}
                    </div>
                    <span className="muted">{session.activity ?? ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {watching && <Desk session={watching} onClose={() => setWatching(undefined)} />}
    </div>
  );
}
