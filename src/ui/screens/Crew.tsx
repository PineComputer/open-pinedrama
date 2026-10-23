import { connectionFromDelegation, type DelegatedConnection } from "@pinesandbox/computer-web";
import { PineDesktop } from "@pinesandbox/computer-web/react";
import { useEffect, useState } from "react";
import type { AppInfo, DramaView, SessionView } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { useT } from "../i18n.ts";

function minutes(value: number): string {
  return value >= 60 && value % 60 === 0 ? `${value / 60} h` : `${value} min`;
}

/** A session's live desktop, view only, with a fresh two-minute token on every (re)connect. */
function Watch({ session, onClose }: { session: SessionView; onClose: () => void }) {
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
    <div className="watch">
      <div className="watch-head">
        <span style={{ font: "500 18px var(--serif)" }}>{session.episode ?? t("crew.setup")}</span>
        <span style={{ color: "var(--on-room-2)" }}>{session.activity}</span>
        <span style={{ flex: 1 }} />
        <button className="link" style={{ color: "var(--on-room)" }} onClick={onClose}>
          {t("crew.close")}
        </button>
      </div>
      {error ? <p style={{ margin: 22 }}>{error}</p> : url ? <PineDesktop url={url} token={token} control="view" style={{ width: "100%", height: "100%" }} /> : <p style={{ margin: 22 }}>{t("loading")}</p>}
    </div>
  );
}

export function Crew({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const [watching, setWatching] = useState<SessionView>();
  return (
    <>
      <div className="work-head">
        <h2>{t("section.crew")}</h2>
      </div>
      {!drama.crew.length ? (
        <p className="empty-note">{t("crew.none")}</p>
      ) : (
        <div className="crew">
          {drama.crew.map((computer) => {
            const slots = Math.max(drama.perComputer, computer.sessions.length);
            return (
              <div key={computer.id} className="machine">
                <div>
                  <div className="name">{computer.label}</div>
                  <div className="state">
                    {computer.state}
                    {computer.idleTimeoutMinutes !== null && (
                      <>
                        <br />
                        {t("crew.idle", { t: minutes(computer.idleTimeoutMinutes) })}
                      </>
                    )}
                  </div>
                  {computer.lastError && <div className="error" style={{ fontSize: 13, marginTop: 4 }}>{computer.lastError}</div>}
                </div>
                <div className="slots">
                  {Array.from({ length: slots }, (_, index) => {
                    const session = computer.sessions[index];
                    if (!session) return <div key={index} className="slot free"><span className="ep">—</span><span>{t("crew.free")}</span><span /></div>;
                    return (
                      <div key={session.id} className="slot">
                        <span className="ep">{session.episode ?? t("crew.setup")}</span>
                        <span className="doing">
                          {session.waiting ? <span className="seal-text" style={{ fontWeight: 600 }}>{t("crew.waiting")}</span> : session.activity ?? ""}
                        </span>
                        {app.data?.mode === "pine" ? (
                          <button className="link" onClick={() => setWatching(session)}>
                            {t("crew.watch")}
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {watching && <Watch session={watching} onClose={() => setWatching(undefined)} />}
    </>
  );
}
