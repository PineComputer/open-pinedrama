import { type DramaView, STAGES, type StageCell } from "../../shared/types.ts";
import { api } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { nowText } from "../labels.ts";
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

export function Board({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const rows = drama.episodeRows;
  const count = (state: string) => rows.filter((row) => row.state === state).length;
  const wide = /^\s*16\s*:\s*9/.test(drama.format);
  return (
    <>
      <div className="work-head">
        <h2>{t("section.board")}</h2>
        {rows.length > 0 && <span className="facts">{t("board.foot", { work: count("working"), wait: count("waiting"), queued: count("queued") })}</span>}
      </div>
      {!rows.length ? (
        <p className="empty-note">{t("board.empty")}</p>
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
            {rows.map((row) => {
              const trouble = row.state === "stopped" || row.state === "failed";
              return (
                <tr key={row.id} className={row.reviewId ? "go" : ""} onClick={() => row.reviewId && navigate(`/r/${row.reviewId}`)}>
                  <td>
                    <div className="ep-cell">
                      <span className={`frame ${wide ? "wide" : ""}`} style={{ backgroundImage: row.frame ? `url(${row.frame})` : undefined }} />
                      <div>
                        <div className="ep">{row.code}</div>
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
                        className="link"
                        style={{ marginTop: 4, fontSize: 13 }}
                        onClick={(event) => {
                          event.stopPropagation();
                          void api(`/api/episodes/${row.id}/resume`, { method: "POST" });
                        }}
                      >
                        {t("board.resume")}
                      </button>
                    )}
                  </td>
                  <td className="pc">{row.computer ?? ""}</td>
                </tr>
              );
            })}
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
                      <span className="dots" style={{ color: "var(--work)", marginRight: 8 }}>
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    {detail}
                    {setup.reviewId && (
                      <>
                        {" · "}
                        <Link to={`/r/${setup.reviewId}`} className="link" style={{ color: "inherit" }}>
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
            <button className="btn" style={{ marginTop: 16, justifySelf: "start" }} onClick={() => void api(`/api/dramas/${drama.id}/retry`, { method: "POST" })}>
              {t("setup.retry")}
            </button>
          )}
        </div>
        <Cast dramaId={drama.id} compact />
      </div>
    </>
  );
}
