import { Check, CircleDot, Loader, Minus, RotateCcw } from "lucide-react";
import { type DramaView, STAGES, type StageCell } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useT } from "../i18n.ts";
import { nowText } from "../labels.ts";
import { navigate } from "../router.tsx";
import { Cast } from "./Cast.tsx";

function Cell({ cell }: { cell: StageCell }) {
  const { t } = useT();
  const count = cell.count ? <span>{cell.count}</span> : null;
  switch (cell.state) {
    case "done":
      return <span className="cell done"><Check size={15} />{count}</span>;
    case "working":
      return <span className="cell working"><Loader size={14} className="spin" />{count}</span>;
    case "review":
      return <span className="cell review"><CircleDot size={14} />{t("board.review")}{count && <> · {count}</>}</span>;
    default:
      return <span className="cell"><Minus size={14} /></span>;
  }
}

export function Board({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const rows = drama.episodeRows;
  if (!rows.length) return <p className="empty">{t("board.empty")}</p>;
  const working = rows.filter((row) => row.state === "working").length;
  const waiting = rows.filter((row) => row.state === "waiting").length;
  return (
    <>
      <table className="board">
        <thead>
          <tr>
            <th />
            {STAGES.map((stage) => (
              <th key={stage}>{t(`stage.${stage}`)}</th>
            ))}
            <th>{t("board.now")}</th>
            <th>{t("board.computer")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.reviewId ? "click" : ""} onClick={() => row.reviewId && navigate(`/r/${row.reviewId}`)}>
              <td>
                <div className="code">{row.code}</div>
                <div className="title">{row.title}</div>
              </td>
              {STAGES.map((stage) => (
                <td key={stage}>
                  <Cell cell={row.stages[stage]} />
                </td>
              ))}
              <td>
                <div className="now" title={nowText(row, t)} style={row.state === "waiting" ? { color: "var(--accent)" } : row.state === "stopped" || row.state === "failed" ? { color: "var(--bad)" } : undefined}>
                  {nowText(row, t)}
                </div>
              </td>
              <td className="muted">{row.computer ?? ""}</td>
              <td>
                {(row.state === "stopped" || row.state === "failed") && (
                  <button
                    className="btn small"
                    onClick={(event) => {
                      event.stopPropagation();
                      void api(`/api/episodes/${row.id}/resume`, { method: "POST" });
                    }}
                  >
                    <RotateCcw size={13} />
                    {t("board.resume")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="line-note">
        {t("card.atWork", { n: drama.computers })} · {working} ⟳ · {waiting} ● · {t("card.episodes", { done: drama.episodes.done, total: drama.episodes.total })}
      </p>
    </>
  );
}

/** While the drama is being set up: where the setup is, and the cast as it arrives. */
export function SetupPanel({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const { setup } = drama;
  // 0 reading, 1 answering a question, 2 drawing the cast, 3 approving the leads' looks.
  const step = setup.state === "waiting" ? (setup.kind === "looks" ? 3 : 1) : setup.hasCast ? 2 : 0;
  const steps = [t("setup.reading"), t("setup.answers"), t("setup.cast"), t("setup.approval")];
  return (
    <div className="setup">
      <div className="steps">
        <h2 className="section" style={{ marginTop: 0 }}>{t("setup.title")}</h2>
        {steps.map((label, index) => (
          <div key={label} className={`step ${index === step ? "on" : index < step ? "done" : ""}`}>
            <span className="n">{index + 1}</span>
            {label}
          </div>
        ))}
        <div className="banner" style={{ marginTop: 12 }}>
          {drama.setup.state === "working" && <Loader size={15} className="spin" color="var(--work)" />}
          <span style={{ flex: 1 }} className={drama.setup.state === "stopped" ? "error" : ""}>
            {setup.state === "stopped"
              ? setup.note ?? t("board.stopped")
              : setup.state === "waiting"
                ? t("board.waits", { kind: t(`kind.${setup.kind ?? "question"}`) })
                : setup.activity ?? t("setup.startingComputer")}
          </span>
        </div>
        {drama.setup.reviewId && (
          <button className="btn primary" onClick={() => navigate(`/r/${drama.setup.reviewId}`)}>
            {t("setup.open")}
          </button>
        )}
        {drama.setup.state === "stopped" && (
          <button className="btn" onClick={() => void api(`/api/dramas/${drama.id}/retry`, { method: "POST" })}>
            {t("setup.retry")}
          </button>
        )}
      </div>
      <div>
        <Cast dramaId={drama.id} />
      </div>
    </div>
  );
}
