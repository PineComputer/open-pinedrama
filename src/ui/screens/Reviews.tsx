import type { ReviewSummary } from "../../shared/types.ts";
import { ago, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { plainText } from "../labels.ts";
import { Link } from "@tanstack/react-router";
import { Still } from "../Still.tsx";

function Asks({ items, dramaId }: { items: ReviewSummary[]; dramaId?: string }) {
  const { t, lang } = useT();
  return (
    <div className="queue">
      {items.map((item) => (
        <Link key={item.id} to="/r/$reviewId" params={{ reviewId: item.id }} className={`ask ${item.state === "ended" ? "ended" : ""}`}>
          <div className="thumb">
            <Still still={item.thumb} />
          </div>
          <div className="shrink">
            <div className="what">
              {t(`kind.${item.kind}` as TKey)}
              {item.episode && <span className="quiet"> · {item.episode}</span>}
            </div>
            <div className="where">
              {[!dramaId ? item.dramaTitle : null, item.items ? `${item.items}` : null].filter(Boolean).join(" · ")}
            </div>
            <div className="words">{plainText(item.question)}</div>
          </div>
          <div className="when">
            {item.state === "ended" ? t("reviews.ended") : item.state === "saving" ? "…" : <span className="seal-text">●</span>}
            <div className="num below">
              {ago(item.createdAt, lang)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** What waits for the maker, then, apart, what ended before they decided (each can carry on in a new session). */
export function ReviewsList({ dramaId }: { dramaId?: string }) {
  const { t } = useT();
  const { data } = useResource<ReviewSummary[]>(dramaId ? `/api/reviews?drama=${dramaId}` : "/api/reviews", ["reviews"]);
  if (!data) return <p className="quiet">{t("loading")}</p>;
  const waiting = data.filter((item) => item.state !== "ended");
  const ended = data.filter((item) => item.state === "ended");
  return (
    <>
      {waiting.length ? <Asks items={waiting} dramaId={dramaId} /> : <p className="empty-note">{t("reviews.empty")}</p>}
      {ended.length > 0 && (
        <section className="ended-asks">
          <h3 className="label">{t("reviews.endedTitle")}</h3>
          <Asks items={ended} dramaId={dramaId} />
        </section>
      )}
    </>
  );
}

/** Reviews: the one queue, or one drama's (IA §16). */
export function ReviewsScreen({ dramaId }: { dramaId?: string }) {
  const { t } = useT();
  return (
    <div className="page">
      <div className="head">
        <h1>{t("reviews.title")}</h1>
        {/* One drama's filter of the one queue says so, with the way back to all (IA §16; design/app.js, Reviews). */}
        {dramaId && (
          <Link className="btn sm ghost" to="/reviews">
            {t("reviews.allDramas")}
          </Link>
        )}
      </div>
      <ReviewsList dramaId={dramaId} />
    </div>
  );
}
