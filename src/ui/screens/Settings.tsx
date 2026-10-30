import { useState } from "react";
import type { AppInfo } from "../../shared/types.ts";
import { api, useAction } from "../api.ts";
import { Segmented } from "../components/Segmented.tsx";
import { setLang, useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { useNotifySetting } from "../notify.ts";
import { setTheme, type ThemeChoice, themeChoice } from "../theme/theme.ts";
import { ConnectForm } from "./Welcome.tsx";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

/** Reveric's notice links to it, as its NOTICES ask (AGPLv3 section 7(b); docs/REUSED.md). */
export const REVERIC = "https://github.com/looplj/reveric";
/** The studio's own source, which the AGPLv3 offers to every user. */
export const SOURCE = "https://github.com/PineComputer/open-pinedrama";

export function Settings({ app, onChange }: { app: AppInfo; onChange: () => void }) {
  const { t, lang } = useT();
  const [connecting, setConnecting] = useState(false);
  const [theme, chooseTheme] = useState<ThemeChoice>(themeChoice);
  const notify = useNotifySetting();
  const disconnect = useAction(async () => {
    await api("/api/connection", { method: "DELETE" });
    onChange();
  });
  return (
    <div className="page">
      <div className="head">
        <h1>{t("settings.title")}</h1>
      </div>
      <div className="settings">
        <section>
          <span className="label">{t("settings.project")}</span>
          <div className="block wide">
            {app.mode === "pine" && app.project ? (
              <>
                <dl>
                  <dt>{t("settings.endpoint")}</dt>
                  <dd>{app.project.endpoint}</dd>
                  <dt>{t("settings.key")}</dt>
                  <dd className="num">{app.project.keyHint}</dd>
                  <dt>{t("settings.skill")}</dt>
                  <dd>{t(`settings.skill.${app.dramaSkill ?? "unknown"}`)}</dd>
                </dl>
                {app.project.fromEnvironment ? (
                  <span className="quiet">{t("settings.fromEnv")}</span>
                ) : (
                  <>
                    <div className="inline">
                      <button className={buttonVariants({ variant: "outline" })} disabled={disconnect.busy} onClick={() => void disconnect.run()}>
                        {disconnect.busy ? t("settings.disconnecting") : t("settings.disconnect")}
                      </button>
                      <span className="quiet small">{t("settings.disconnectHint")}</span>
                    </div>
                    {disconnect.error !== undefined && <p className="error flush">{errorText(disconnect.error, t)}</p>}
                  </>
                )}
              </>
            ) : (
              <>
                <span>{t("settings.replayOn")}</span>
                {connecting ? (
                  <ConnectForm onDone={onChange} />
                ) : (
                  <button className={cn(buttonVariants({ variant: "outline" }), "start")} onClick={() => setConnecting(true)}>
                    {t("settings.connect")}
                  </button>
                )}
              </>
            )}
          </div>
        </section>
        <section>
          <span className="label">{t("settings.language")}</span>
          <Segmented label={t("settings.language")} value={lang} onChange={setLang} options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]} />
        </section>
        <section>
          <span className="label">{t("settings.theme")}</span>
          <Segmented
            label={t("settings.theme")}
            value={theme}
            onChange={(choice) => {
              setTheme(choice);
              chooseTheme(choice);
            }}
            options={(["dark", "light", "system"] as const).map((choice) => ({ value: choice, label: t(`settings.theme.${choice}`) }))}
          />
        </section>
        {notify.supported && (
          <section>
            <span className="label">{t("settings.notify")}</span>
            <div className="block">
              <Segmented
                label={t("settings.notify")}
                value={notify.on ? "on" : "off"}
                onChange={(choice) => void ((choice === "on") !== notify.on && notify.toggle())}
                options={[
                  { value: "on", label: t("settings.notifyOn") },
                  { value: "off", label: t("settings.notifyOff") },
                ]}
              />
              <span className="quiet small">{notify.blocked ? t("settings.notifyBlocked") : t("settings.notifyHint")}</span>
            </div>
          </section>
        )}
        <section>
          <span className="label">{t("settings.data")}</span>
          <div className="block">
            <span className="path">{app.dataDir}</span>
            <span className="quiet small">{t("settings.dataHint")}</span>
          </div>
        </section>
        <section>
          <span className="label">{t("settings.troubleshooting")}</span>
          <div className="block">
            <div className="inline">
              <a className={buttonVariants({ variant: "outline" })} href="/api/diagnostics" download>
                {t("settings.diagnostics")}
              </a>
            </div>
            <span className="quiet small">{t("settings.diagnosticsHint")}</span>
          </div>
        </section>
        <section aria-labelledby="settings-about">
          <span className="label" id="settings-about">
            {t("settings.about")}
          </span>
          <div className="block">
            <p className="flush">
              <a href={REVERIC} target="_blank" rel="noreferrer">
                {t("about.basedOn")}
              </a>
            </p>
            <span className="quiet small">{t("about.licence")}</span>
            <div className="inline">
              <a href={SOURCE} target="_blank" rel="noreferrer">
                {t("about.source")}
              </a>
              <a href={`${SOURCE}/blob/main/NOTICES`} target="_blank" rel="noreferrer">
                {t("about.notices")}
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
