// The drama's Story (docs/REDESIGN_PLAN.md, P5.5; the pro direction's Story screen): its
// episodes as the bible titles them, its cast as cards (the newest sheet, where it stands, its
// other names, the episodes it is in) and its world (places and key props). Every name is the
// bible's. Decisions are made in the review room: a card waiting for one links there.
import { useState } from "react";
import type { Names } from "../../shared/names.ts";
import type { CastCard, DramaView, Receipt } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ProjectView } from "../../shared/project.ts";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { errorText, subjectLabel, useNames } from "../labels.ts";
import { Link } from "../router.tsx";
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
          <span className="ds-chipslot">
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
  const project = useResource<ProjectView>(`/api/dramas/${dramaId}/project`, [`project:${dramaId}`]);
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
  // The bible as drama-cli's status gives it: its version, whether it is accepted, and how many episodes it writes.
  const bible = project.data?.state?.bible;
  const written = bible?.coverage?.episodes ?? 0;
  const total = drama.data?.episodeRows.length ?? episodes.length;
  const meta = bible?.current
    ? [t("cast.bibleVersion", { v: bible.current }), bible.accepted ? t("cast.accepted") : t("cast.notAccepted"), written ? t("cast.writtenRange", { last: `EP${String(written).padStart(3, "0")}` }) : ""].filter(Boolean).join(" · ")
    : "";
  const tabs: [Shelf, string, number | undefined][] = [
    ["bible", t("cast.bible"), undefined],
    ["cast", t("cast.cast"), characters.length],
    ["world", t("cast.world"), world.length],
  ];
  // The design's Story (design/screens.js, Story): underlined tabs with the bible's state at their end, then the shelf.
  return (
    <TabsPrimitive.Root value={shelf} onValueChange={(next) => setShelf(next as Shelf)}>
      <h2 className="sr-only">{t("step.story")}</h2>
      <div style={{ padding: "0 16px" }}>
        <div className="tabsrow" style={{ margin: "4px 0 18px" }}>
          <TabsPrimitive.List className="utabs" aria-label={t("cast.shelves")}>
            {tabs.map(([value, label, count]) => (
              <TabsPrimitive.Trigger key={value} value={value}>
                {label}
                {count !== undefined && <small> {count}</small>}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
          <span className="grow" />
          {meta && (
            <span className="muted" style={{ fontSize: 12 }}>
              {meta}
            </span>
          )}
        </div>
      </div>
      <TabsPrimitive.Content value="bible">
        {episodes.length || names?.logline ? (
          <div className="biblegrid">
            {names?.logline && (
              <section className="panel">
                <span className="kick">{t("cast.logline")}</span>
                <p className="logline">{names.logline}</p>
              </section>
            )}
            {names && names.beats.length > 0 && (
              <section className="panel" aria-label={t("cast.beats")}>
                <h3>
                  <Icon name="list-numbers" className="ic" />
                  {t("cast.beats")}
                </h3>
                <ol className="beats">
                  {names.beats.map((beat, n) => (
                    <li key={n}>{beat}</li>
                  ))}
                </ol>
              </section>
            )}
            <section className="panel wide" aria-label={t("cast.episodes")}>
              <h3>
                <Icon name="film-strip" className="ic" />
                {t("cast.episodes")}
                <span className="grow" />
                {written > 0 && (
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 500 }}>
                    {t("cast.writtenOf", { n: written, total })}
                  </span>
                )}
              </h3>
              <div className="eplist">
                {episodes.map(([code, title]) => {
                  const frame = drama.data?.episodeRows.find((row) => row.code === code)?.frame;
                  return (
                    <Link key={code} to={`/d/${dramaId}/e/${code}`} className="eprow">
                      {frame ? <img src={frame.url} alt="" /> : <span />}
                      <span className="mono">{code}</span>
                      <b>{title}</b>
                      <span className="muted grow">{names?.summaries[code]}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          <p className="empty-note" style={{ padding: "0 16px" }}>
            {t("cast.noBible")}
          </p>
        )}
      </TabsPrimitive.Content>
      <TabsPrimitive.Content value="cast">{castGrid}</TabsPrimitive.Content>
      <TabsPrimitive.Content value="world">
        <div className="ds-worldgrid">
          {world.flatMap((card) => card.looks.map((look) => <Card key={`${card.kind}:${card.subject}/${look.look}`} card={card} look={look} names={names} dramaId={dramaId} wide={false} />))}
        </div>
      </TabsPrimitive.Content>
    </TabsPrimitive.Root>
  );
}

