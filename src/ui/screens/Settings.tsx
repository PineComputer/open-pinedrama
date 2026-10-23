import { useState } from "react";
import type { AppInfo } from "../../shared/types.ts";
import { api } from "../api.ts";
import { setLang, useT } from "../i18n.ts";
import { ConnectForm } from "./Welcome.tsx";

export function Settings({ app, onChange }: { app: AppInfo; onChange: () => void }) {
  const { t, lang } = useT();
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const disconnect = async () => {
    setBusy(true);
    await api("/api/connection", { method: "DELETE" }).finally(() => setBusy(false));
    onChange();
  };
  return (
    <main className="page">
      <div className="head">
        <h1>{t("settings.title")}</h1>
      </div>
      <div className="settings">
        <section>
          <span className="label">{t("settings.project")}</span>
          <div style={{ display: "grid", gap: 16 }}>
            {app.mode === "pine" && app.project ? (
              <>
                <dl>
                  <dt>{t("settings.endpoint")}</dt>
                  <dd>{app.project.endpoint}</dd>
                  <dt>{t("settings.key")}</dt>
                  <dd className="num">{app.project.keyHint}</dd>
                </dl>
                {app.project.fromEnvironment ? (
                  <span className="quiet">{t("settings.fromEnv")}</span>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <button className="btn" disabled={busy} onClick={disconnect}>
                      {t("settings.disconnect")}
                    </button>
                    <span className="quiet" style={{ fontSize: 13 }}>
                      {t("settings.disconnectHint")}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <span>{t("settings.replayOn")}</span>
                {connecting ? (
                  <ConnectForm onDone={onChange} />
                ) : (
                  <button className="btn" style={{ justifySelf: "start" }} onClick={() => setConnecting(true)}>
                    {t("settings.connect")}
                  </button>
                )}
              </>
            )}
          </div>
        </section>
        <section>
          <span className="label">{t("settings.language")}</span>
          <div className="options">
            <button className={lang === "zh" ? "on" : ""} onClick={() => setLang("zh")}>
              中文
            </button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
              English
            </button>
          </div>
        </section>
        <section>
          <span className="label">{t("settings.data")}</span>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ wordBreak: "break-all" }}>{app.dataDir}</span>
            <span className="quiet" style={{ fontSize: 13 }}>
              {t("settings.dataHint")}
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
