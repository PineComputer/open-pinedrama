// An episode, as the design's Episode screen has it (design/screens.js, Episode): its code, title,
// where it stands and what it has spent, then its segments scene by scene.
import type { EpisodePage, Judged } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { errorText, moneyText, nowText } from "../labels.ts";
import { Icon } from "../icons.tsx";
import { Link } from "../router.tsx";
import { Segments } from "./Segments.tsx";

/** What the maker decided on what a review showed, with the way back to that review. */
export function JudgedLine({ review }: { review?: Judged }) {
  const { t } = useT();
  if (!review) return <div className="judged quiet">{t("judged.none")}</div>;
  const link = (
    <Link to={`/r/${review.reviewId}`} className="link inherit">
      {t("judged.open")}
    </Link>
  );
  if (review.state === "open" || review.state === "saving") {
    return (
      <div className="judged waiting">
        {t("judged.waiting")} · {link}
      </div>
    );
  }
  if (review.verdict === "approve") {
    return (
      <div className="judged approved">
        <Icon name="check" /> {t("judged.approve")} · {link}
      </div>
    );
  }
  if (review.verdict === "revise") {
    return (
      <div className="judged revised">
        <div>
          <Icon name="note-pencil" /> {t("judged.revise")} · {link}
        </div>
        {review.notes.length > 0 && (
          <ol className="judged-notes">
            {review.notes.map((note, index) => (
              <li key={index}>{note.text}</li>
            ))}
          </ol>
        )}
      </div>
    );
  }
  return <div className="judged quiet">{t(review.state === "sending" ? "judged.sending" : "judged.ended")} · {link}</div>;
}

export function Episode({ dramaId, code }: { dramaId: string; code: string }) {
  const { t, lang } = useT();
  const { data: page, error } = useResource<EpisodePage>(`/api/dramas/${dramaId}/episodes/${code}`, [`drama:${dramaId}`]);
  if (error !== undefined && !page) return <p className="error">{errorText(error, t)}</p>;
  if (!page) return <p className="quiet">{t("loading")}</p>;
  const { row } = page;
  return (
    <>
      <div className="ephead">
        <h2>
          {row.code}
          {row.title && <span className="muted"> · {row.title}</span>}
        </h2>
        <span className="muted">{nowText(row, t)}</span>
        <span className="grow" />
        {row.spent.total > 0 && (
          <span className="mono muted" title={t("spent.about")}>
            {moneyText(row.spent, t, lang)}
          </span>
        )}
      </div>
      <Segments dramaId={dramaId} page={page} />
    </>
  );
}
