import { useState } from "react";
import { type DramaView, type EpisodeRow, STAGES, type StageCell } from "../../shared/types.ts";
import { api, useAction } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { errorText, nowText } from "../labels.ts";
import { Link, navigate } from "../router.tsx";
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
function Row({ row, wide }: { row: EpisodeRow; wide: boolean }) {
  const { t } = useT();
  const resume = useAction(() => api(`/api/episodes/${row.id}/resume`, { method: "POST" }));
  const trouble = row.state === "stopped" || row.state === "failed";
  return (
    <tr className={row.reviewId ? "go" : ""} onClick={() => row.reviewId && navigate(`/r/${row.reviewId}`)}>
      <td>
        <div className="ep-cell">
          <span className={`frame ${wide ? "wide" : ""}`} style={{ backgroundImage: row.frame ? `url(${row.frame})` : undefined }} />
          <div>
            {row.reviewId ? (
              <Link to={`/r/${row.reviewId}`} className="ep" onClick={(event) => event.stopPropagation()}>
                {row.code}
              </Link>
            ) : (
              <div className="ep">{row.code}</div>
            )}
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
        <div className={`now ${row.state === "waiting" ? "waiting" : trouble ? "trouble" : ""}`}>{nowText(row, t)}</div>
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
    </tr>
  );
}

/**
 * One episode on the wall: its newest picture in the drama's own frame (a phone screen for
 * a vertical drama), its five stages as a strip, and what is happening now. An episode
 * waiting for the maker is marked in seal red and opens its review.
 */
function Card({ row, wide }: { row: EpisodeRow; wide: boolean }) {
  const { t } = useT();
  const resume = useAction(() => api(`/api/episodes/${row.id}/resume`, { method: "POST" }));
  const trouble = row.state === "stopped" || row.state === "failed";
  const picture = (
    <span className={`shot ${wide ? "wide" : ""} ${row.frame ? "" : "blank"}`} style={row.frame ? { backgroundImage: `url(${row.frame})` } : undefined}>
      {!row.frame && <span className="number">{String(row.number).padStart(2, "0")}</span>}
      {row.state === "waiting" && <span className="flag">{t("board.review")}</span>}
      {row.state === "done" && <span className="flag done">{t("board.done")}</span>}
    </span>
  );
  return (
    <div className={`episode ${row.state}`}>
      {row.reviewId ? (
        <Link to={`/r/${row.reviewId}`} className="shot-link" aria-label={`${row.code} · ${t("board.review")}`}>
          {picture}
        </Link>
      ) : (
        picture
      )}
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
        {nowText(row, t)}
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
  const count = (state: string) => rows.filter((row) => row.state === state).length;
  const [view, setView] = useState<View>(savedView);
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
        {rows.length > 0 && <span className="facts">{t("board.foot", { work: count("working"), wait: count("waiting"), queued: count("queued") })}</span>}
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
          {rows.map((row) => (
            <Card key={row.id} row={row} wide={wide} />
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.id} row={row} wide={wide} />
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
  // 0 reading, 1 answering a question, 2 drawing the cast, 3 approving the leads' looks.
  const current = setup.state === "waiting" ? (setup.kind === "looks" ? 3 : 1) : setup.hasCast ? 2 : 0;
  const steps: TKey[] = ["setup.reading", "setup.answers", "setup.cast", "setup.approval"];
  const detail =
    setup.state === "stopped"
      ? setup.note ?? t("board.stopped")
      : setup.state === "waiting"
        ? t("board.waits", { kind: t(`kind.${setup.kind ?? "question"}` as TKey) })
        : setup.activity ?? t("setup.startingComputer");
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
              {retry.error !== undefined && <span className="error small">{errorText(retry.error, t)}</span>}
            </div>
          )}
        </div>
        <Cast dramaId={drama.id} compact />
      </div>
    </>
  );
}
