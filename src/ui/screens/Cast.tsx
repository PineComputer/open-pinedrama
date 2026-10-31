// The drama's Story (docs/architecture.md, section 8.5; the pro direction's Story screen): its
// episodes as the bible titles them, its cast as cards (the newest sheet, where it stands, its
// other names, the episodes it is in) and its world (places and key props). Every name is the
// bible's. Decisions are made in the review room: a card waiting for one links there.
import { useState } from "react";
import type { Names } from "../../shared/names.ts";
import type { CastCard, DramaView, FileItem, Receipt } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ProjectView } from "../../shared/project.ts";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { errorText, subjectLabel, useNames } from "../labels.ts";
import { Link, linkOptions, useNavigate } from "@tanstack/react-router";
import { homeLink, type Page, useRoute } from "../place.ts";

type Shelf = "bible" | "cast" | "scenes" | "props";

// Each shelf's page: the bible is Story's, the assets each their own (IA §16), with one asset's detail open or none.
function shelfLink(shelf: Shelf, dramaId: string, assetId?: string) {
  if (shelf === "bible") return linkOptions({ to: "/d/$dramaId/story", params: { dramaId } });
  if (shelf === "cast") return linkOptions({ to: "/d/$dramaId/assets/characters/{-$assetId}", params: { dramaId, assetId } });
  if (shelf === "scenes") return linkOptions({ to: "/d/$dramaId/assets/locations/{-$assetId}", params: { dramaId, assetId } });
  return linkOptions({ to: "/d/$dramaId/assets/props/{-$assetId}", params: { dramaId, assetId } });
}

// drama-cli's stage folder for an asset (shared/lineage.ts, KINDS): what Lineage traces.
const STAGE: Record<CastCard["kind"], string> = { look: "assets/characters", location: "assets/scenes", prop: "assets/props" };
const SHELF_BY_KIND: Record<CastCard["kind"], Shelf> = { look: "cast", location: "scenes", prop: "props" };

/** A card opens its asset's detail (J1): its name is the link, and a click anywhere on the card follows it. */
function useOpen(card: CastCard, dramaId: string) {
  const navigate = useNavigate();
  const to = shelfLink(SHELF_BY_KIND[card.kind], dramaId, card.subject);
  const onClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    void navigate(to);
  };
  return { to, onClick };
}

/** Where a version stands, by what the maker decided on the review that showed it. */
function standing(receipt: Receipt | undefined): Status | undefined {
  const review = receipt?.review;
  if (!review) return undefined;
  if (review.state === "open" || review.state === "saving") return "you";
  if (review.verdict === "approve") return "accepted";
  return review.verdict === "revise" ? "back" : undefined;
}

/** One character's look: its newest version's picture, where it stands, and the versions before it. */
function Card({ card, look, names, dramaId, picked }: { card: CastCard; look: CastCard["looks"][number]; names: Names | null; dramaId: string; picked: boolean }) {
  const { t } = useT();
  const open = useOpen(card, dramaId);
  const shown = look.versions[0];
  const file = shown?.files[0];
  if (!file) return null;
  const status = standing(shown);
  const name = subjectLabel(names, look.look && look.look !== "base" ? `${card.subject}/${look.look}` : card.subject, card.kind);
  const aliases = names?.characters[card.subject]?.aliases ?? [];
  const kind = look.look === "base" || !look.look ? t("cast.base") : look.look;
  // The design's cast card (design/screens.js, Story; studio.css .castcard): the sheet, where it stands, the name and
  // version, the look, its other names and episodes; its versions to flip through, and the way to its review.
  return (
    <article className={`castcard${picked ? " sel" : ""}`} aria-label={name} aria-current={picked || undefined} onClick={open.onClick}>
      <div className="pic">
        <img src={file.url} alt="" loading="lazy" />
        {status && <StatusChip status={status} />}
      </div>
      <div className="ctxt">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <Link {...open.to} className="grow cardname">
            <b>{name}</b>
          </Link>
          <span className="mono subtle" style={{ fontSize: 11 }}>
            {file.version}
          </span>
        </div>
        <small className="muted">{kind}</small>
        {aliases.length > 0 && (
          <div className="aka">
            <span className="muted">{t("cast.aliases")}</span>
            {aliases.map((alias) => (
              <span key={alias} className="tag">
                {alias}
              </span>
            ))}
          </div>
        )}
        {card.episodes.length > 0 && (
          <div className="aka">
            <span className="muted">{t("cast.in")}</span>
            {card.episodes.map((code) => (
              <Link key={code} to="/d/$dramaId/e/$episodeCode/list" params={{ dramaId: dramaId, episodeCode: code }} className="tag">
                {code}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** The newest version of an entry, the one accepted last, and the picture each shows: the plate's sheet, not one of its views. */
function versionsOf(entry: CastCard["looks"][number] | undefined) {
  const sheet = (receipt: Receipt | undefined) => receipt?.files.find((file) => !file.style) ?? receipt?.files[0];
  const newest = entry?.versions[0];
  const accepted = entry?.versions.find((version) => standing(version) === "accepted");
  return { newest, file: sheet(newest), accepted: sheet(accepted)?.version };
}

/**
 * A place as drama-cli scenes draws it, or a key prop as drama-cli props does (the design's .placecard): its plate or
 * picture, where its newest version stands, the bible's name and description, its views and its times of day.
 */
function PlaceCard({ card, names, dramaId, picked }: { card: CastCard; names: Names | null; dramaId: string; picked: boolean }) {
  const { t } = useT();
  const open = useOpen(card, dramaId);
  const place = card.kind === "location";
  const plate = card.looks.find((entry) => !entry.look);
  const { newest, file, accepted } = versionsOf(plate ?? card.looks[0]);
  if (!file) return null;
  const status = standing(newest);
  const name = subjectLabel(names, card.subject, card.kind);
  const description = (place ? names?.descriptions.locations : names?.descriptions.props)?.[card.subject];
  // Each view's newest picture (drama-cli's location steps), and each other time of day's newest sheet.
  const views = new Map<string, FileItem>();
  for (const version of plate?.versions ?? []) for (const view of version.files) if (view.style && !views.has(view.style)) views.set(view.style, view);
  const times = card.looks.filter((entry) => entry.look).map((entry) => ({ time: entry.look, file: versionsOf(entry).file }));
  return (
    <article className={`placecard${picked ? " sel" : ""}`} aria-label={name} aria-current={picked || undefined} onClick={open.onClick}>
      <div className="pic">
        <img src={file.url} alt="" loading="lazy" />
        {status && status !== "accepted" && <StatusChip status={status} />}
      </div>
      <div className="ctxt">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <Link {...open.to} className="grow cardname">
            <b>{name}</b>
          </Link>
          <span className="mono subtle" style={{ fontSize: 11 }}>
            {file.version}
          </span>
        </div>
        <small className="muted">{[place ? t("cast.plate") : t("cast.keyProp"), accepted && accepted !== file.version ? t("cast.acceptedVersion", { v: accepted }) : ""].filter(Boolean).join(" · ")}</small>
        {description && <p className="desc">{description}</p>}
        {views.size > 0 && (
          <div className="aka">
            <span className="muted">{t("cast.views")}</span>
            {[...views].map(([view, picture]) => (
              <a key={view} className="tag" href={picture.url} target="_blank" rel="noreferrer">
                {view.replace(/-/g, " ")}
              </a>
            ))}
          </div>
        )}
        {times.length > 0 && (
          <div className="aka">
            <span className="muted">{t("cast.times")}</span>
            {times.map(({ time, file: sheet }) => (
              <a key={time} className="tag" href={sheet?.url} target="_blank" rel="noreferrer">
                {[time, sheet?.version].filter(Boolean).join(" · ")}
              </a>
            ))}
          </div>
        )}
        {card.episodes.length > 0 && (
          <div className="aka">
            <span className="muted">{t("cast.in")}</span>
            {card.episodes.map((code) => (
              <Link key={code} to="/d/$dramaId/e/$episodeCode/list" params={{ dramaId: dramaId, episodeCode: code }} className="tag">
                {code}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * J1 (design/screens.js, Story's AssetDetail): an asset's one home is its detail beside the grid, as Lineage's inspector
 * sits beside its graph: its looks or plate, the versions with the one in view, current and accepted, where it stands,
 * the way to its review, its files and Lineage. Decisions are made in the review room, as everywhere.
 */
function AssetDetail({ card, names, dramaId }: { card: CastCard; names: Names | null; dramaId: string }) {
  const { t } = useT();
  const [lookIndex, setLookIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const look = card.looks[Math.min(lookIndex, card.looks.length - 1)];
  const versions = look?.versions ?? [];
  const shown = versions[Math.min(index, versions.length - 1)];
  const file = shown?.files.find((item) => !item.style) ?? shown?.files[0];
  const name = subjectLabel(names, card.subject, card.kind);
  const current = versions[0]?.files[0]?.version;
  const accepted = versions.find((version) => standing(version) === "accepted")?.files[0]?.version;
  const status = standing(shown);
  // drama-cli names a character's first look "base" (the cards say Base look); a plate or prop has no look name.
  const lookName = (entry: CastCard["looks"][number]) =>
    entry.look && entry.look !== "base" ? entry.look : card.kind === "look" ? t("cast.base") : card.kind === "location" ? t("cast.plate") : t("cast.keyProp");
  return (
    <aside className="insp" aria-label={t("asset.detail", { name })}>
      <div className="ihead">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b className="grow">{name}</b>
          <Link {...shelfLink(SHELF_BY_KIND[card.kind], dramaId)} className="ibtn" aria-label={t("asset.close")}>
            <Icon name="x" className="ic" />
          </Link>
        </div>
        <small>{[lookName(look!), file?.version].filter(Boolean).join(" · ")}</small>
        <Link {...homeLink(dramaId, `${STAGE[card.kind]}/${card.subject}`, "lineage")} className="btn sm">
          <Icon name="tree-structure" className="ic" />
          {t("asset.lineage")}
        </Link>
      </div>
      <div className="iscroll">
        {file && (
          <div className="isec">
            <a href={file.url} target="_blank" rel="noreferrer">
              <img src={file.url} alt="" style={{ width: "100%", borderRadius: 10, maxHeight: 240, objectFit: "cover", objectPosition: "top" }} />
            </a>
          </div>
        )}
        {card.looks.length > 1 && (
          <div className="isec">
            <h4>{t("asset.looks")}</h4>
            <div className="vstrip" role="group" aria-label={t("asset.looks")}>
              {card.looks.map((entry, i) => (
                <button key={entry.look || "base"} type="button" aria-pressed={i === lookIndex} onClick={() => (setLookIndex(i), setIndex(0))}>
                  {lookName(entry)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="isec">
          <h4>
            {t("asset.versions")} <span className="muted">{versions.length}</span>
          </h4>
          <div className="vstrip" role="group" aria-label={t("cast.versions", { name })}>
            {versions.map((version, i) => (
              <button key={version.turnId} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>
                {version.files[0]?.version ?? i + 1}
              </button>
            ))}
          </div>
          <p className="mono subtle" style={{ fontSize: 11.5, margin: "8px 0 6px" }}>
            {[current && t("asset.current", { v: current }), accepted ? t("asset.accepted", { v: accepted }) : t("asset.noneAccepted")].filter(Boolean).join(" · ")}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {status && <StatusChip status={status} />}
            <span className="grow" />
            {shown?.review && (
              <Link to="/r/$reviewId" params={{ reviewId: shown.review.reviewId }} className={`btn sm ${status === "you" ? "primary" : "ghost"}`}>
                {status === "you" ? t("cast.review") : t("judged.open")}
              </Link>
            )}
          </div>
        </div>
        {card.episodes.length > 0 && (
          <div className="isec">
            <h4>{t("cast.in")}</h4>
            <div className="aka">
              {card.episodes.map((code) => (
                <Link key={code} to="/d/$dramaId/e/$episodeCode/list" params={{ dramaId, episodeCode: code }} className="tag">
                  {code}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="isec">
          <h4>{t("asset.files")}</h4>
          {shown?.files.length ? (
            shown.files.map((item) => (
              <a key={item.id} className="lrow" href={item.url} target="_blank" rel="noreferrer">
                {item.name}
                <span className="mono subtle">{[item.style, item.version].filter(Boolean).join(" · ")}</span>
              </a>
            ))
          ) : (
            <p className="subtle">{t("asset.noFiles")}</p>
          )}
        </div>
      </div>
    </aside>
  );
}

// The shelf each page shows.
const SHELF_OF: Partial<Record<Page, Shelf>> = { story: "bible", characters: "cast", locations: "scenes", props: "props" };

/** The bible and the assets, on the shelf the page shows with the asset it names picked; compact, the characters alone. */
export function Cast({ dramaId, compact = false }: { dramaId: string; compact?: boolean }) {
  const navigate = useNavigate();
  const route = useRoute();
  const shelf = SHELF_OF[route.page ?? "story"] ?? "bible";
  const picked = route.params.assetId;
  const { t } = useT();
  const { data, error } = useResource<CastCard[]>(`/api/dramas/${dramaId}/cast`, [`drama:${dramaId}`]);
  const names = useNames(dramaId);
  const drama = useResource<DramaView>(`/api/dramas/${dramaId}`, [`drama:${dramaId}`]);
  const project = useResource<ProjectView>(`/api/dramas/${dramaId}/project`, [`project:${dramaId}`]);
  const characters = (data ?? []).filter((card) => card.kind === "look");
  const places = (data ?? []).filter((card) => card.kind === "location");
  const props = (data ?? []).filter((card) => card.kind === "prop");
  const pickedCard = shelf === "bible" ? undefined : (data ?? []).find((card) => SHELF_BY_KIND[card.kind] === shelf && card.subject === picked);
  const detail = pickedCard && <AssetDetail key={pickedCard.subject} card={pickedCard} names={names} dramaId={dramaId} />;
  const castGrid = (
    <div className="castgrid">
      {characters.flatMap((card) => card.looks.map((look) => <Card key={`${card.subject}/${look.look}`} card={card} look={look} names={names} dramaId={dramaId} picked={card.subject === picked} />))}
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
  // Whether the working version is the accepted one (drama-cli's current against accepted), the accepted one when it
  // isn't, and why the bible can't be used when drama-cli says so; never the mere presence of an accepted version.
  const standing = !bible?.current
    ? []
    : bible.current !== bible.accepted
      ? [t("cast.notAccepted"), bible.accepted ? t("cast.acceptedVersion", { v: bible.accepted }) : ""]
      : [t("cast.accepted"), !bible.usable ? t("cast.notUsable", { why: bible.why ?? "" }) : ""];
  const meta = bible?.current
    ? [t("cast.bibleVersion", { v: bible.current }), ...standing, written ? t("cast.writtenRange", { last: `EP${String(written).padStart(3, "0")}` }) : ""].filter(Boolean).join(" · ")
    : "";
  // Under the logline, as the design has them: the genres the maker's notes state, and the episodes × their length.
  const facts = drama.data?.facts;
  const tags = [...(facts?.genres ?? []), ...(facts?.scale && facts.length ? [t("cast.format", { n: facts.scale.episodes, s: facts.length })] : [])];
  const tabs: [Shelf, string, number][] = [
    ["cast", t("cast.characters"), characters.length],
    ["scenes", t("cast.locations"), places.length],
    ["props", t("cast.props"), props.length],
  ];
  // The design's Story and Assets (design/screens.js, Story): two homes (IA §16), the bible's page titled Story with its
  // state, and Assets with its three tabs, shared by every episode.
  const story = shelf === "bible";
  return (
    <TabsPrimitive.Root value={shelf} onValueChange={(next) => void navigate(shelfLink(next as Shelf, dramaId))}>
      <div style={{ padding: "0 16px" }}>
        <div className="tabsrow" style={{ margin: "4px 0 18px" }}>
          {story ? (
            <h2 className="pagetitle">{t("step.story")}</h2>
          ) : (
            <TabsPrimitive.List className="utabs" aria-label={t("cast.shelves")}>
              {tabs.map(([value, label, count]) => (
                <TabsPrimitive.Trigger key={value} value={value}>
                  {label}
                  <small> {count}</small>
                </TabsPrimitive.Trigger>
              ))}
            </TabsPrimitive.List>
          )}
          <span className="grow" />
          {(story ? meta : t("cast.shared")) && (
            <span className="muted" style={{ fontSize: 12 }}>
              {story ? meta : t("cast.shared")}
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
                {tags.length > 0 && (
                  <div className="tags" style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    {tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
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
                    <Link key={code} to="/d/$dramaId/e/$episodeCode/list" params={{ dramaId: dramaId, episodeCode: code }} className="eprow">
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
      <TabsPrimitive.Content value="cast" className={detail ? "assetsplit" : undefined}>
        {castGrid}
        {shelf === "cast" && detail}
      </TabsPrimitive.Content>
      {/* drama-cli's own two stages, as yurun decided: scenes (assets/scenes/<id>) and props (assets/props/<id>). */}
      {(["scenes", "props"] as const).map((shelf) => (
        <TabsPrimitive.Content key={shelf} value={shelf} className={detail ? "assetsplit" : undefined}>
          <div className="worldgrid">
            {(shelf === "scenes" ? places : props).map((card) => (
              <PlaceCard key={card.subject} card={card} names={names} dramaId={dramaId} picked={card.subject === picked} />
            ))}
          </div>
          {detail}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

