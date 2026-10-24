import { useState } from "react";
import { type DramaView, type EpisodeRow, STAGES, type StageCell } from "../../shared/types.ts";
import { api, useAction } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { errorText, moneyText, nowText } from "../labels.ts";
import { Link, navigate } from "../router.tsx";
import { Still } from "../Still.tsx";
import { Cast } from "./Cast.tsx";

function Mark({ cell }: { cell: StageCell }) {
  const { t } = useT();
  switch (cell.state) {
    case "done":
      return (
        <span className="mark done">
          ✓{cell.count ? <span className="count num">{cell.count}</span> : null}
        </span>
      );
    case "working":
      return (
        <span className="mark working">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        </span>
      );
    case "review":
      return <span className="mark review">{t("board.review")} →</span>;
    default:
      return <span className="mark">—</span>;
  }
}

/** One episode's line on the sheet. The whole row opens its review; its code is the keyboard's way in. */
function Row({ row, wide, dramaId }: { row: EpisodeRow; wide: boolean; dramaId: string }) {
  const { t, lang } = useT();
  const resume = useAction(() => api(`/api/episodes/${row.id}/resume`, { method: "POST" }));
  const trouble = row.state === "stopped" || row.state === "failed";
  return (
    <tr className="go" onClick={() => navigate(`/d/${dramaId}/e/${row.code}`)}>
      <td>
        <div className="ep-cell">
          <span className={`frame ${wide ? "wide" : ""}`}>
            <Still still={row.frame} />
          </span>
          <div>
            <Link to={`/d/${dramaId}/e/${row.code}`} className="ep" onClick={(event) => event.stopPropagation()}>
              {row.code}
            </Link>
            {row.title && <div className="ep-title">{row.title}</div>}
          </div>
        </div>
      </td>
      {STAGES.map((stage) => (
        <td key={stage}>
          <Mark cell={row.stages[stage]} />
        </td>
      ))}
      <td>
        <div className={`now ${row.state === "waiting" ? "waiting" : trouble ? "trouble" : ""}`} title={nowText(row, t)}>
          <span className="said">{nowText(row, t)}</span>
        </div>
        {trouble && (
          <button
            className="link row-action"
            disabled={resume.busy}
            onClick={(event) => {
              event.stopPropagation();
              void resume.run();
            }}
          >
            {t("board.resume")}
          </button>
        )}
        {resume.error !== undefined && <div className="error small">{errorText(resume.error, t)}</div>}
      </td>
      <td className="pc">{row.computer ?? ""}</td>
      <td className="spent num">{row.spent.total > 0 ? moneyText(row.spent, t, lang) : ""}</td>
    </tr>
  );
}

/**
 * One episode on the wall: its newest picture in the drama's own frame (a phone screen for
 * a vertical drama), its five stages as a strip, and what is happening now. An episode
 * waiting for the maker is marked in seal red and opens its review.
 */
function Card({ row, wide, dramaId }: { row: EpisodeRow; wide: boolean; dramaId: string }) {
  const { t } = useT();
  const resume = useAction(() => api(`/api/episodes/${row.id}/resume`, { method: "POST" }));
  const trouble = row.state === "stopped" || row.state === "failed";
  const picture = (
    <span className={`shot ${wide ? "wide" : ""} ${row.frame ? "" : "blank"}`}>
      <Still still={row.frame} live />
      {!row.frame && <span className="number">{String(row.number).padStart(2, "0")}</span>}
      {row.state === "done" && <span className="flag done">{t("board.done")}</span>}
    </span>
  );
  return (
    <div className={`episode ${row.state}`}>
      {/* The card opens the episode; a waiting one also has its own way straight to the review. */}
      <div className="shot-wrap">
        <Link to={`/d/${dramaId}/e/${row.code}`} className="shot-link" aria-label={row.title ? `${row.code} · ${row.title}` : row.code}>
          {picture}
        </Link>
        {row.state === "waiting" && row.reviewId && (
          <Link to={`/r/${row.reviewId}`} className="flag">
            {t("board.review")} →
          </Link>
        )}
      </div>
      <div className="caption">
        <span className="code">{row.code}</span>
        {row.title && <span className="title">{row.title}</span>}
      </div>
      <div className="strip" aria-hidden="true">
        {STAGES.map((stage) => (
          <span key={stage} className={row.stages[stage].state} title={t(`stage.${stage}` as TKey)} />
        ))}
      </div>
      <div className={`now ${row.state === "waiting" ? "waiting" : trouble ? "trouble" : ""}`}>
        {row.state === "working" && (
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        )}
        <span className="said" title={nowText(row, t)}>
          {nowText(row, t)}
        </span>
      </div>
      {trouble && (
        <button className="link row-action" disabled={resume.busy} onClick={() => void resume.run()}>
          {t("board.resume")}
        </button>
      )}
      {resume.error !== undefined && <div className="error small">{errorText(resume.error, t)}</div>}
    </div>
  );
}

type View = "wall" | "sheet";

/** Which episodes the board shows: all, or those in one condition. */
const FILTERS = {
  all: () => true,
  you: (row: EpisodeRow) => row.state === "waiting" || row.state === "stopped" || row.state === "failed",
  working: (row: EpisodeRow) => row.state === "working",
  queued: (row: EpisodeRow) => row.state === "queued",
  done: (row: EpisodeRow) => row.state === "done",
} satisfies Record<string, (row: EpisodeRow) => boolean>;
type Filter = keyof typeof FILTERS;

function savedView(): View {
  try {
    return localStorage.getItem("studio.boardView") === "sheet" ? "sheet" : "wall";
  } catch {
    return "wall";
  }
}

export function Board({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const rows = drama.episodeRows;
  const [view, setView] = useState<View>(savedView);
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter(FILTERS[filter]);
  const choose = (next: View) => {
    setView(next);
    try {
      localStorage.setItem("studio.boardView", next);
    } catch {
      // remembered for this visit only
    }
  };
  const wide = /^\s*16\s*:\s*9/.test(drama.format);
  return (
    <>
      <div className="work-head">
        <h2>{t("section.board")}</h2>
        {rows.length > 0 && (
          <div className="filters" role="group" aria-label={t("board.filter")}>
            {(Object.keys(FILTERS) as Filter[]).map((key) => {
              const n = rows.filter(FILTERS[key]).length;
              return (
                <button key={key} aria-pressed={filter === key} className={`${filter === key ? "on" : ""} ${key === "you" && n ? "needs" : ""}`} onClick={() => setFilter(key)}>
                  {t(`board.filter.${key}` as TKey)} <span className="num">{n}</span>
                </button>
              );
            })}
          </div>
        )}
        <span className="grow" />
        {rows.length > 0 && (
          <div className="views" role="group" aria-label={t("board.view")}>
            <button aria-pressed={view === "wall"} className={view === "wall" ? "on" : ""} onClick={() => choose("wall")}>
              {t("board.wall")}
            </button>
            <button aria-pressed={view === "sheet"} className={view === "sheet" ? "on" : ""} onClick={() => choose("sheet")}>
              {t("board.sheet")}
            </button>
          </div>
        )}
      </div>
      {!rows.length ? (
        <p className="empty-note">{t("board.empty")}</p>
      ) : view === "wall" ? (
        <div className={`wall ${wide ? "wide" : ""}`}>
          {shown.map((row) => (
            <Card key={row.id} row={row} wide={wide} dramaId={drama.id} />
          ))}
        </div>
      ) : (
        <table className="sheet">
          <thead>
            <tr>
              <th>{t("board.episode")}</th>
              {STAGES.map((stage) => (
                <th key={stage}>{t(`stage.${stage}` as TKey)}</th>
              ))}
              <th>{t("board.now")}</th>
              <th>{t("board.computer")}</th>
              <th className="spent">{t("board.spent")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <Row key={row.id} row={row} wide={wide} dramaId={drama.id} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** While the drama is being set up: where the setup stands, and the cast as it arrives. */
export function SetupPanel({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const { setup } = drama;
  const retry = useAction(() => api(`/api/dramas/${drama.id}/retry`, { method: "POST" }));
  const rehearse = useAction(() => api(`/api/dramas/${drama.id}/rehearse`, { method: "POST" }));
  // Reading, answering, drawing the leads, approving them; then pre-production: preparing every
  // episode (breakdowns and shared references), and approving the shared references. A plain
  // question waits at the step the setup has reached, or at "answering" before any.
  const current =
    setup.state === "waiting"
      ? setup.kind === "references"
        ? 5
        : setup.kind === "looks"
          ? 3
          : Math.max(1, setup.reached)
      : setup.reached === 3 || setup.reached === 1
        ? setup.reached + 1
        : setup.reached;
  const steps: TKey[] = ["setup.reading", "setup.answers", "setup.cast", "setup.approval", "setup.preparing", "setup.references"];
  const detail =
    setup.state === "stopped"
      ? setup.reason
        ? t(`setup.held.${setup.reason}`)
        : setup.note ?? t("board.stopped")
      : setup.state === "waiting"
        ? t("board.waits", { kind: t(`kind.${setup.kind ?? "question"}` as TKey) })
        : setup.activity ?? t(drama.crew.some((computer) => computer.sessions.length > 0) ? "setup.atWork" : "setup.startingComputer");
  return (
    <>
      <div className="work-head">
        <h2>{t("setup.title")}</h2>
      </div>
      <div className="setup">
        <div className="steps">
          {steps.map((label, index) => {
            const on = index === current;
            return (
              <div key={label} className={`step ${on ? "on" : index < current ? "done" : ""} ${on && setup.state === "waiting" ? "waiting" : ""}`}>
                <span className="n">{index + 1}</span>
                <span className="what">{t(label)}</span>
                {on && (
                  <span className="detail">
                    {setup.state === "working" && (
                      <span className="dots">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    {detail}
                    {setup.reviewId && (
                      <>
                        {" · "}
                        <Link to={`/r/${setup.reviewId}`} className="link inherit">
                          {t("setup.open")}
                        </Link>
                      </>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          {setup.state === "stopped" && (
            <div className="step-action">
              <button className="btn" disabled={retry.busy} onClick={() => void retry.run()}>
                {t("setup.retry")}
              </button>
              {setup.reason === "no-drama-skill" && (
                <button className="btn" disabled={rehearse.busy} onClick={() => void rehearse.run()}>
                  {t("setup.rehearse")}
                </button>
              )}
              {[retry.error, rehearse.error].map((failed, n) => failed !== undefined && <span key={n} className="error small">{errorText(failed, t)}</span>)}
              {setup.reason === "no-drama-skill" && <p className="quiet small hint">{t("setup.rehearseHint")}</p>}
            </div>
          )}
        </div>
        <Cast dramaId={drama.id} compact />
      </div>
    </>
  );
}
