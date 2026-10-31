import type { DeliveryRow, Judged } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { StatusChip, type Status } from "../components/StatusChip.tsx";
import { buttonClass } from "../components/Button.tsx";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { homeLink } from "../place.ts";
import { Link } from "@tanstack/react-router";

function status(review: Judged | undefined): "approve" | "revise" | "waiting" | "none" {
  if (!review) return "none";
  if (review.state === "open" || review.state === "saving") return "waiting";
  return review.verdict ?? "none";
}

const CHIP: Record<ReturnType<typeof status>, Status> = { approve: "accepted", revise: "back", waiting: "you", none: "line" };

/**
 * Drama › Delivery, the one home of the accepted cuts across episodes (IA §16; design/screens.js, Delivery): each
 * episode's delivered cut and its latest, with the latest's review status. A row links to its episode's Cut, which
 * plays it; there is no second player here. Only an approved cut is offered as the episode's delivery; a review that
 * showed several cuts approves none of them in particular, and says so.
 */
export function Delivery({ dramaId, episode }: { dramaId: string; episode?: string }) {
  const { t } = useT();
  const all = useResource<DeliveryRow[]>(`/api/dramas/${dramaId}/delivery`, [`drama:${dramaId}`]);
  // An episode's Cut shows its own row; the drama's Delivery every episode's.
  const data = episode ? all.data?.filter((row) => row.code === episode) : all.data;
  const error = all.error;
  if (error !== undefined && !data) return <p className="error">{errorText(error, t)}</p>;
  if (!data) return <p className="quiet">{t("loading")}</p>;
  const ready = data.filter((row) => row.accepted).length;
  const cut = (code: string) => ({ to: "/d/$dramaId/e/$episodeCode/cut" as const, params: { dramaId, episodeCode: code } });
  return (
    <>
      <div className="bar2">
        <h2 className="sr-only">{t("step.delivery")}</h2>
        {data.length > 0 && <span className="delivsum">{t("delivery.ready", { n: ready, total: data.length })}</span>}
        <span className="grow" />
        {ready > 0 && (
          <a className={buttonClass({ size: "sm" })} href={`/api/dramas/${dramaId}/season.zip`} download>
            <Icon name="download-simple" className="ic" />
            {t("delivery.season", { n: ready })}
          </a>
        )}
      </div>
      {!data.length ? (
        <p className="empty-note">{t("delivery.empty")}</p>
      ) : (
        <div className="delivwrap">
          <table className="deliv">
            <thead>
              <tr>
                <th>{t("board.episode")}</th>
                <th>{t("delivery.accepted")}</th>
                <th>{t("delivery.latest")}</th>
                <th>{t("delivery.status")}</th>
                <th aria-label={t("episode.download")} />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const latest = status(row.latest?.review);
                const group = (row.latest?.together ?? 1) > 1 && (latest === "approve" || latest === "revise");
                return (
                  <tr key={row.code}>
                    <td>
                      <span className="delivep">
                        <span>
                          <b className="mono">{row.code}</b>
                          {row.title && <small>{row.title}</small>}
                        </span>
                      </span>
                    </td>
                    <td>
                      {row.accepted ? (
                        <Link {...cut(row.code)} className="linkbtn">
                          {row.accepted.version ?? row.accepted.name}
                        </Link>
                      ) : row.ambiguous ? (
                        <span className="muted">{t("delivery.ambiguous")}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {row.latest ? (
                        <>
                          <Link {...cut(row.code)} className="linkbtn">
                            {row.latest.file.version ?? row.latest.file.name}
                          </Link>{" "}
                          <Link {...homeLink(dramaId, `episodes/${row.code}/edit`, "lineage")} className="ibtn" aria-label={t("edit.lineage")} title={t("edit.lineage")}>
                            <Icon name="tree-structure" className="ic" />
                          </Link>
                        </>
                      ) : (
                        <span className="muted">{t("delivery.none")}</span>
                      )}
                    </td>
                    <td>{row.latest && <StatusChip status={CHIP[latest]} label={group ? t(latest === "approve" ? "delivery.groupApproved" : "delivery.groupRevised", { n: row.latest.together }) : t(`delivery.status.${latest}`)} />}</td>
                    <td className="act">
                      {row.accepted && (
                        <a className={buttonClass({ size: "sm", variant: "ghost" })} href={`${row.accepted.url}&download=1`}>
                          <Icon name="download-simple" className="ic" />
                          {t("episode.download")} {row.accepted.version}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
