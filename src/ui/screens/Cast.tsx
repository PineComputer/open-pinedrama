// The drama's Story (docs/REDESIGN_PLAN.md, P5.5; the pro direction's Story screen): its
// episodes as the bible titles them, its cast as cards (the newest sheet, where it stands, its
// other names, the episodes it is in) and its world (places and key props). Every name is the
// bible's. Decisions are made in the review room: a card waiting for one links there.
import { useState } from "react";
import type { Names } from "../../shared/names.ts";
import type { CastCard, DramaView, Receipt } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { Tabs } from "../components/Tabs.tsx";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { errorText, subjectLabel, useNames } from "../labels.ts";
import { Link } from "../router.tsx";
import { Still } from "../Still.tsx";
import { buttonVariants } from "@/components/ui/button";

type Shelf = "bible" | "cast" | "world";

/** Where a version stands, by what the maker decided on the review that showed it. */
function standing(receipt: Receipt | undefined): Status | undefined {
  const review = receipt?.review;
  if (!review) return undefined;
  if (review.state === "open" || review.state === "saving") return "you";
  if (review.verdict === "approve") return "accepted";
  return review.verdict === "revise" ? "back" : undefined;
}

/** One look, place or prop: its newest version's picture, where it stands, and the versions before it. */
function Card({ card, look, names, dramaId, wide }: { card: CastCard; look: CastCard["looks"][number]; names: Names | null; dramaId: string; wide: boolean }) {
  const { t } = useT();
  const [index, setIndex] = useState(0);
  const shown = look.versions[Math.min(index, look.versions.length - 1)];
  const file = shown?.files[0];
  if (!file) return null;
  const status = standing(shown);
  const name = subjectLabel(names, look.look && look.look !== "base" ? `${card.subject}/${look.look}` : card.subject, card.kind);
  const aliases = card.kind === "look" ? (names?.characters[card.subject]?.aliases ?? []) : [];
  const kind = card.kind === "look" ? (look.look === "base" || !look.look ? t("cast.base") : look.look) : card.kind === "location" ? t("cast.plate") : t("cast.keyProp");
  return (
    <article className={wide ? "ds-castcard" : "ds-placecard"} aria-label={name}>
      <a className="pic" href={file.url} target="_blank" rel="noreferrer">
        <img src={file.url} alt="" loading="lazy" />
        {status && (
          <span className="chip">
            <StatusChip status={status} over />
          </span>
        )}
      </a>
      <div className="txt">
        <div className="line">
          <b>{name}</b>
          <span className="ver">{file.version}</span>
        </div>
        <small>{kind}</small>
        {aliases.length > 0 && (
          <div className="aka">
            <span>{t("cast.aliases")}</span>
            {aliases.map((alias) => (
              <span key={alias} className="ds-tag">
                {alias}
              </span>
            ))}
          </div>
        )}
        {card.episodes.length > 0 && (
          <div className="aka">
            <span>{t("cast.in")}</span>
            {card.episodes.map((code) => (
              <Link key={code} to={`/d/${dramaId}/e/${code}`} className="ds-tag">
                {code}
              </Link>
            ))}
          </div>
        )}
        <div className="acts">
          {look.versions.length > 1 && (
            <span className="versions" role="group" aria-label={t("cast.versions", { name })}>
              {look.versions.map((version, i) => (
                <button key={version.turnId} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>
                  {version.files[0]?.version ?? i + 1}
                </button>
              ))}
            </span>
          )}
          <span className="grow" />
          {shown.review && (
            <Link to={`/r/${shown.review.reviewId}`} className={buttonVariants({ variant: status === "you" ? "default" : "ghost", size: "sm" })}>
              {status === "you" ? t("cast.review") : t("judged.open")}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function Cast({ dramaId, compact = false }: { dramaId: string; compact?: boolean }) {
  const { t } = useT();
  const { data, error } = useResource<CastCard[]>(`/api/dramas/${dramaId}/cast`, [`drama:${dramaId}`]);
  const names = useNames(dramaId);
  const drama = useResource<DramaView>(`/api/dramas/${dramaId}`, [`drama:${dramaId}`]);
  // The Story opens on the bible, as the pro direction's does.
  const [shelf, setShelf] = useState<Shelf>("bible");
  const characters = (data ?? []).filter((card) => card.kind === "look");
  const world = (data ?? []).filter((card) => card.kind !== "look");
  const castGrid = (
    <div className="ds-castgrid">
      {characters.flatMap((card) => card.looks.map((look) => <Card key={`${card.subject}/${look.look}`} card={card} look={look} names={names} dramaId={dramaId} wide />))}
    </div>
  );
  if (!data) return <p className={error === undefined ? "quiet" : "error"}>{error === undefined ? t("loading") : errorText(error, t)}</p>;
  if (!data.length) return <p className="empty-note">{t("cast.empty")}</p>;
  if (compact) return castGrid;
  const episodes = Object.entries(names?.episodes ?? {});
  return (
    <div className="ds-story">
      <h2 className="sr-only">{t("step.story")}</h2>
      <Tabs
        label={t("cast.shelves")}
        value={shelf}
        onChange={setShelf}
        tabs={[
          { value: "bible", label: t("cast.bible"), count: episodes.length || undefined },
          { value: "cast", label: t("cast.cast"), count: characters.length },
          { value: "world", label: t("cast.world"), count: world.length },
        ]}
      >
        {shelf === "bible" &&
          (episodes.length || names?.logline ? (
            // The bible as the pro direction lays it out: the logline and the beats side by side, the episodes under them.
            <div className="ds-biblegrid">
              {names?.logline && (
                <section className="ds-panel">
                  <span className="kick">{t("cast.logline")}</span>
                  <p className="ds-logline">{names.logline}</p>
                </section>
              )}
              {names && names.beats.length > 0 && (
                <section className="ds-panel" aria-label={t("cast.beats")}>
                  <h3>
                    <Icon name="list-numbers" />
                    {t("cast.beats")}
                  </h3>
                  <ol className="ds-beats">
                    {names.beats.map((beat, n) => (
                      <li key={n}>{beat}</li>
                    ))}
                  </ol>
                </section>
              )}
              <section className="ds-panel wide" aria-label={t("cast.episodes")}>
                <h3>
                  <Icon name="film-strip" />
                  {t("cast.episodes")}
                  <span className="grow" />
                  <Link to={`/d/${dramaId}/script`} className="quiet small">
                    {t("cast.openBible")}
                  </Link>
                </h3>
                <ol className="ds-eplist">
                  {episodes.map(([code, title]) => {
                    const frame = drama.data?.episodeRows.find((row) => row.code === code)?.frame;
                    return (
                      <li key={code}>
                        <Link to={`/d/${dramaId}/e/${code}`}>
                          <span className="thumb">{frame && <Still still={frame} />}</span>
                          <span className="code">{code}</span>
                          <b>{title}</b>
                          <span className="quiet">{names?.summaries[code]}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          ) : (
            <p className="empty-note">{t("cast.noBible")}</p>
          ))}
        {shelf === "cast" && castGrid}
        {shelf === "world" && (
          <div className="ds-worldgrid">
            {world.flatMap((card) => card.looks.map((look) => <Card key={`${card.kind}:${card.subject}/${look.look}`} card={card} look={look} names={names} dramaId={dramaId} wide={false} />))}
          </div>
        )}
      </Tabs>
    </div>
  );
}

