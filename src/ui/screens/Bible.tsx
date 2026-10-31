// The bible's page (D61; design/screens.js, Bible): drama-cli's bible.json as it is, the logline and the tone, then one
// row per episode with its title, summary, end hook and seconds; each episode's beats open under it (WAI-ARIA APG
// Disclosure), so they read as that episode's. Where it stands is drama-cli's status: its version, whether it is
// accepted, and how much of the screenplay it covers. drama-cli accepts only a bible that covers the whole screenplay
// (short_drama doc/drama-cli/long-screenplays.md), so one still being written says so with status's next step, and
// promises no later range (Codex round 4, F6).
import { Fragment, useState } from "react";
import { beatsOf } from "../../shared/names.ts";
import type { ProjectView } from "../../shared/project.ts";
import type { DramaView } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { useNames } from "../labels.ts";

export function Bible({ dramaId }: { dramaId: string }) {
  const { t } = useT();
  const names = useNames(dramaId);
  const drama = useResource<DramaView>(`/api/dramas/${dramaId}`, [`drama:${dramaId}`]);
  const project = useResource<ProjectView>(`/api/dramas/${dramaId}/project`, [`project:${dramaId}`]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const episodes = Object.entries(names?.episodes ?? {});
  const bible = project.data?.state?.bible;
  const total = drama.data?.episodeRows.length ?? episodes.length;
  // Whether the working version is the accepted one (drama-cli's current against accepted), the accepted one when it
  // isn't, and why the bible can't be used when drama-cli says so; never the mere presence of an accepted version.
  const standing = !bible?.current
    ? []
    : bible.current !== bible.accepted
      ? [t("cast.notAccepted"), bible.accepted ? t("cast.acceptedVersion", { v: bible.accepted }) : ""]
      : [t("cast.accepted"), !bible.usable ? t("cast.notUsable", { why: bible.why ?? "" }) : ""];
  const coverage = bible?.coverage;
  const covers = !coverage
    ? []
    : coverage.episodes >= total
      ? [total === 1 ? t("bible.coversOne") : t("bible.covers", { n: total })]
      : [t("bible.partial", { n: coverage.episodes, total }), coverage.next ? t("bible.next", { step: coverage.next }) : coverage.blocked ? t("bible.blocked", { why: coverage.blocked }) : ""];
  const meta = bible?.current ? [t("cast.bibleVersion", { v: bible.current }), ...standing, ...covers].filter(Boolean).join(" · ") : "";
  const toggle = (code: string) => setOpen((now) => (now.has(code) ? new Set([...now].filter((c) => c !== code)) : new Set([...now, code])));
  return (
    <>
      <div style={{ padding: "0 16px" }}>
        <div className="tabsrow" style={{ margin: "4px 0 18px" }}>
          <div>
            <h1 className="pagetitle">{t("step.bible")}</h1>
            <p className="muted pagesub">{t("bible.subtitle")}</p>
          </div>
          <span className="fill" />
          {meta && (
            <span className="muted" style={{ fontSize: 12 }}>
              {meta}
            </span>
          )}
        </div>
      </div>
      {names && (episodes.length || names.logline) ? (
        <div className="biblegrid">
          {(names.logline || names.tone) && (
            <section className="panel wide">
              {names.logline && (
                <>
                  <span className="kick">{t("cast.logline")}</span>
                  <p className="logline">{names.logline}</p>
                </>
              )}
              {names.tone && (
                <>
                  <span className="kick" style={{ marginTop: 14 }}>
                    {t("bible.tone")}
                  </span>
                  <p className="tone">{names.tone}</p>
                </>
              )}
            </section>
          )}
          <section className="panel wide" aria-label={t("cast.episodes")}>
            <h2>
              <Icon name="film-strip" className="ic" />
              {t("cast.episodes")}
            </h2>
            <div className="delivwrap flush">
              <table className="deliv bibleeps">
                <thead>
                  <tr>
                    <th>{t("bible.episode")}</th>
                    <th>{t("bible.title")}</th>
                    <th>{t("bible.summary")}</th>
                    <th>{t("bible.endHook")}</th>
                    <th>{t("bible.seconds")}</th>
                  </tr>
                </thead>
                <tbody>
                  {episodes.map(([code, title]) => {
                    const frame = drama.data?.episodeRows.find((row) => row.code === code)?.frame;
                    const beats = beatsOf(names, code);
                    const shown = open.has(code);
                    return (
                      <Fragment key={code}>
                        <tr>
                          <td>
                            <button type="button" className="disc" aria-expanded={shown} aria-controls={`beats-${code}`} title={t("bible.showBeats", { code })} onClick={() => toggle(code)}>
                              <Icon name={shown ? "caret-down" : "caret-right"} className="ic" />
                              {frame ? <img src={frame.url} alt="" /> : null}
                              <span className="mono">{code}</span>
                            </button>
                          </td>
                          <td className="ttl">
                            <b>{title}</b>
                          </td>
                          <td className="wrap">{names.summaries[code]}</td>
                          <td className="wrap">{names.endHooks[code]}</td>
                          {/* drama-cli's est_seconds, the sum of its beats, rounded for reading; the exact value in its title. */}
                          <td className="num mono" title={names.seconds[code] !== undefined ? `${names.seconds[code]} s` : undefined}>
                            {names.seconds[code] !== undefined && t("bible.secondsValue", { n: Math.round(names.seconds[code]) })}
                          </td>
                        </tr>
                        {shown && (
                          <tr className="beatsrow" id={`beats-${code}`}>
                            <td />
                            <td colSpan={4}>
                              <span className="kick">{t("bible.beatsOf", { n: beats.length })}</span>
                              <ol className="beats">
                                {beats.map((beat, n) => (
                                  <li key={n}>
                                    {beat.event} <span className="mono subtle">{beat.seconds} s</span>
                                  </li>
                                ))}
                              </ol>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <p className="empty-note">
          {t("cast.noBible")}
        </p>
      )}
    </>
  );
}
