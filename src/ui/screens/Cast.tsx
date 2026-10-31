// The drama's Story (docs/architecture.md, section 8.5; the pro direction's Story screen): its
// episodes as the bible titles them, its cast as cards (the newest sheet, where it stands, its
// other names, the episodes it is in) and its world (places and key props). Every name is the
// bible's. Decisions are made in the review room: a card waiting for one links there.
import Lightbox from "yet-another-react-lightbox";
import { type Photo, RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Names } from "../../shared/names.ts";
import type { CastCard, DramaView, FileItem, Receipt } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
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

/** A look's, plate's or prop's own stage folder, as drama-cli names it (shared/lineage.ts, KINDS): a further look or a time of day below its subject. */
function stageOfEntry(card: CastCard, entry: CastCard["looks"][number]): string {
  const base = `${STAGE[card.kind]}/${card.subject}`;
  if (!entry.look || entry.look === "base") return base;
  return card.kind === "look" ? `${base}/states/${entry.look}` : card.kind === "location" ? `${base}/times/${entry.look}` : base;
}
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

/** The newest version of an entry, the one accepted last, and the picture each shows: the plate's sheet, not one of its views. */
function versionsOf(entry: CastCard["looks"][number] | undefined) {
  const sheet = (receipt: Receipt | undefined) => receipt?.files.find((file) => !file.style) ?? receipt?.files[0];
  const newest = entry?.versions[0];
  const accepted = entry?.versions.find((version) => standing(version) === "accepted");
  return { newest, file: sheet(newest), accepted: sheet(accepted)?.version };
}

/** The entry a card and the detail open on: a character's base look, a place's plate, a prop's picture. */
const mainOf = (card: CastCard) => card.looks.find((entry) => !entry.look || entry.look === "base") ?? card.looks[0];

/**
 * D56's grid card (design/screens.js, Story; Apple Photos and Finder's picture grid, liblib's 资产 library): the picture
 * at its own ratio, the name, the version and where it stands. Everything else is the detail's (progressive disclosure).
 */
function AssetCard({ card, names, dramaId, picked, width, height }: { card: CastCard; names: Names | null; dramaId: string; picked: boolean; width: number; height: number }) {
  const open = useOpen(card, dramaId);
  const { newest, file } = versionsOf(mainOf(card));
  if (!file) return null;
  const status = standing(newest);
  const name = subjectLabel(names, card.subject, card.kind);
  return (
    <article className={`assetcard${picked ? " sel" : ""}`} aria-label={name} aria-current={picked || undefined} onClick={open.onClick} style={{ width }}>
      <div className="pic" style={{ height }}>
        <img src={file.url} alt="" loading="lazy" />
        {status && <StatusChip status={status} />}
      </div>
      <div className="ctxt">
        <Link {...open.to} className="grow cardname">
          <b>{name}</b>
        </Link>
        <span className="mono subtle">{file.version}</span>
      </div>
    </article>
  );
}

/** Each picture's own size, read once it loads; a picture not loaded yet is laid out at 4:3 until it is. */
function useSizes(urls: string[]) {
  const [sizes, setSizes] = useState<Record<string, [number, number]>>({});
  const key = urls.join("|");
  useEffect(() => {
    for (const url of urls) {
      const image = new Image();
      image.onload = () => setSizes((known) => (known[url] ? known : { ...known, [url]: [image.naturalWidth, image.naturalHeight] }));
      image.src = url;
    }
    // The list is read through its key, so a re-render with the same pictures loads nothing again.
  }, [key]);
  return sizes;
}

type AssetPhoto = Photo & { card: CastCard };

/**
 * D56's grid as justified rows (Google Photos, Flickr; react-photo-album's rows layout): each row one height, each card
 * as wide as its picture's own ratio, so nothing is letterboxed or cropped; the caption sits under the picture.
 */
function AssetGrid({ cards, names, dramaId, picked }: { cards: CastCard[]; names: Names | null; dramaId: string; picked?: string }) {
  const items = cards.flatMap((card) => {
    const file = versionsOf(mainOf(card)).file;
    return file ? [{ card, url: file.url }] : [];
  });
  const sizes = useSizes(items.map((item) => item.url));
  const photos: AssetPhoto[] = items.map(({ card, url }) => {
    const [width, height] = sizes[url] ?? [4, 3];
    return { key: card.subject, src: url, width, height, card };
  });
  return (
    <div className="assetgrid">
      <RowsPhotoAlbum
        photos={photos}
        // Rows near the design's card height, never more than four a row nor a lone row taller than 300px, so near-square
        // multi-view plates don't squeeze six into one short row (react-photo-album's own row constraints).
        targetRowHeight={230}
        rowConstraints={{ maxPhotos: 4, singleRowMaxHeight: 300 }}
        spacing={12}
        defaultContainerWidth={960}
        render={{
          photo: (_, { photo, width, height }) => (
            <AssetCard key={photo.key} card={photo.card} names={names} dramaId={dramaId} picked={photo.card.subject === picked} width={width} height={height} />
          ),
        }}
      />
    </div>
  );
}

/**
 * D56's detail (Apple Photos' and Finder's inspector): one large picture with its views or looks as a strip under it,
 * the name, kind and version with where it stands, Review and Lineage, the bible's description clamped to three lines,
 * the episodes it is in, and its versions. Decisions are made in the review room, as everywhere.
 */
function AssetPanel({ card, names, dramaId, onShow }: { card: CastCard; names: Names | null; dramaId: string; onShow: (file: FileItem | undefined, move?: Move) => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { search } = useRoute();
  const [lookIndex, setLookIndex] = useState(Math.max(0, card.looks.indexOf(mainOf(card)!)));
  const [view, setView] = useState("");
  const [more, setMore] = useState(false);
  // Which way the picture moves when the next one is picked: the way the picked thumbnail or version lies from the one
  // in view, in the strip's order.
  const move = useRef<Move>(undefined);
  const look = card.looks[lookIndex];
  const versions = look?.versions ?? [];
  // The version in view is the URL's (?item=<this look's stage>&version=vN, D48), so the crumbs, a link and Back agree
  // on it; picking one writes it there. Without one, the newest.
  const stage = look && stageOfEntry(card, look);
  const named = search.item === stage && search.version ? versions.findIndex((version) => version.files[0]?.version === search.version) : -1;
  const index = Math.max(0, named);
  const pick = (i: number) => {
    move.current = i > index ? "asset-forward" : "asset-backward";
    const version = versions[i]?.files[0]?.version;
    if (stage && version) void navigate({ ...homeLink(dramaId, stage, "canvas", version), replace: true });
  };
  const shown = versions[Math.min(index, versions.length - 1)];
  const sheet = shown?.files.find((file) => !file.style) ?? shown?.files[0];
  const big = (view && shown?.files.find((file) => file.style === view)) || sheet;
  // The viewer shows large whatever the panel picks: a version, a view, a look.
  useEffect(() => {
    onShow(big, move.current);
    move.current = undefined;
  }, [big?.url]);
  const name = subjectLabel(names, card.subject, card.kind);
  const current = versions[0]?.files[0]?.version;
  const accepted = versions.find((version) => standing(version) === "accepted")?.files[0]?.version;
  const status = standing(shown);
  const lookName = (entry: CastCard["looks"][number]) =>
    entry.look && entry.look !== "base" ? entry.look : card.kind === "look" ? t("cast.base") : card.kind === "location" ? t("cast.plate") : t("cast.keyProp");
  const description = card.kind === "location" ? names?.descriptions.locations[card.subject] : card.kind === "prop" ? names?.descriptions.props[card.subject] : undefined;
  const aliases = card.kind === "look" ? (names?.characters[card.subject]?.aliases ?? []) : [];
  // The strip: a character's looks; a place's plate, its views and its other times of day; a prop has none.
  const strip: { key: string; label: string; file: FileItem | undefined; pick: () => void; on: boolean }[] =
    card.kind === "look"
      ? card.looks.map((entry, i) => ({ key: entry.look || "base", label: lookName(entry), file: versionsOf(entry).file, pick: () => (setLookIndex(i), setView("")), on: i === lookIndex }))
      : card.kind === "location"
        ? [
            ...(sheet ? [{ key: "plate", label: lookName(look!), file: sheet, pick: () => setView(""), on: !view }] : []),
            ...(shown?.files.filter((file) => file.style) ?? []).map((file) => ({ key: file.style!, label: file.style!.replace(/-/g, " "), file, pick: () => setView(file.style!), on: view === file.style })),
            ...card.looks.map((entry, i) => ({ entry, i })).filter(({ i }) => i !== lookIndex).map(({ entry, i }) => ({ key: `time-${entry.look}`, label: lookName(entry), file: versionsOf(entry).file, pick: () => (setLookIndex(i), setView("")), on: false })),
          ]
        : [];
  return (
    <aside className="insp" aria-label={t("asset.detail", { name })}>
      <div className="ihead">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b className="grow">{name}</b>
        </div>
        <small>{[lookName(look!), big?.version].filter(Boolean).join(" · ")}</small>
      </div>
      <div className="iscroll">
        {strip.length > 1 && (
          <div className="isec">
            <div className="viewstrip" role="group" aria-label={card.kind === "look" ? t("asset.looks") : t("cast.views")}>
              {strip.map((item, k) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={item.on}
                  onClick={() => {
                    move.current = k > strip.findIndex((other) => other.on) ? "asset-forward" : "asset-backward";
                    item.pick();
                  }}
                >
                  {item.file ? <img src={item.file.url} alt="" /> : <span className="emptythumb" />}
                  <small>{item.label}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="isec">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {status && <StatusChip status={status} />}
            <span className="grow" />
            {shown?.review && (
              <Link to="/r/$reviewId" params={{ reviewId: shown.review.reviewId }} className={`btn sm ${status === "you" ? "primary" : "ghost"}`}>
                {status === "you" ? t("cast.review") : t("judged.open")}
              </Link>
            )}
            <Link {...homeLink(dramaId, `${STAGE[card.kind]}/${card.subject}`, "lineage")} className="btn sm">
              <Icon name="tree-structure" className="ic" />
              {t("asset.lineage")}
            </Link>
          </div>
          {aliases.length > 0 && (
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {t("cast.aliases")} {aliases.join(" · ")}
            </p>
          )}
          {description && (
            <>
              <p className={`desc${more ? "" : " clamp3"}`}>{description}</p>
              <button type="button" className="link small" onClick={() => setMore(!more)}>
                {t(more ? "asset.less" : "asset.more")}
              </button>
            </>
          )}
        </div>
        {card.episodes.length > 0 && (
          <div className="isec">
            <h4>{t("cast.in")}</h4>
            <div className="aka">
              {card.episodes.map((code) => (
                <Link key={code} to="/d/$dramaId/e/$episodeCode/canvas" params={{ dramaId, episodeCode: code }} className="tag">
                  {code}
                </Link>
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
              <button key={version.turnId} type="button" aria-pressed={i === index} onClick={() => pick(i)}>
                {version.files[0]?.version ?? i + 1}
              </button>
            ))}
          </div>
          <p className="mono subtle" style={{ fontSize: 11.5, margin: "8px 0 0" }}>
            {[current && t("asset.current", { v: current }), accepted ? t("asset.accepted", { v: accepted }) : t("asset.noneAccepted")].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    </aside>
  );
}

/** The view transition types the asset viewer's picture moves by (studio.css, .assetviewer). */
type Move = "asset-forward" | "asset-backward" | undefined;

/**
 * D56's viewer (merecdesperez44323-lab: "弹出大图可以，做吧"): an asset opens in yet-another-react-lightbox, the picture as
 * large as the window allows at its own ratio on a dimmed backdrop, ← and → through the shelf, Esc back to the grid
 * (WAI-ARIA APG modal dialog), and its details in a panel beside it (LibTV's asset viewer; Google Photos, Lightroom).
 * The route names the asset, so a link opens it and the arrows move it.
 */
function AssetViewer({ cards, picked, shelf, names, dramaId }: { cards: CastCard[]; picked: string; shelf: Exclude<Shelf, "bible">; names: Names | null; dramaId: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [shown, setShown] = useState<FileItem>();
  // A look, view or version picked in the panel slides the stage picture in from the side it lies on (MDN, View
  // Transition API: document.startViewTransition with types; studio.css .assetviewer). Moving to another asset is the
  // library's own swipe, and where the API is missing the picture swaps at once (progressive enhancement).
  const show = (file: FileItem | undefined, move?: Move) => {
    if (!move || !document.startViewTransition) return setShown(file);
    document.startViewTransition({ update: () => flushSync(() => setShown(file)), types: [move] });
  };
  const index = cards.findIndex((card) => card.subject === picked);
  const slides = cards.map((card, i) => ({ src: (i === index && shown?.url) || versionsOf(mainOf(card)).file?.url || "", alt: subjectLabel(names, card.subject, card.kind) }));
  return (
    <Lightbox
      open
      index={index}
      slides={slides}
      close={() => void navigate(shelfLink(shelf, dramaId))}
      on={{ view: ({ index: next }) => next !== index && void navigate({ ...shelfLink(shelf, dramaId, cards[next].subject), replace: true }) }}
      labels={{ Previous: t("asset.previous"), Next: t("asset.next"), Close: t("asset.close"), Lightbox: t("asset.viewer") }}
      className="assetviewer"
      render={{ controls: () => <AssetPanel key={picked} card={cards[index]} names={names} dramaId={dramaId} onShow={show} /> }}
    />
  );
}

// The shelf each page shows.
const SHELF_OF: Partial<Record<Page, Shelf>> = { story: "bible", characters: "cast", locations: "scenes", props: "props" };

/** The bible and the assets, on the shelf the page shows with the asset it names picked; compact, the characters alone. */
export function Cast({ dramaId, compact = false }: { dramaId: string; compact?: boolean }) {
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

  const castGrid = <AssetGrid cards={characters} names={names} dramaId={dramaId} picked={picked} />;
  if (!data) return <p className={error === undefined ? "quiet" : "error"}>{error === undefined ? t("loading") : errorText(error, t)}</p>;
  // Y8: Story is the bible's page whether or not anything has been drawn; an asset shelf says when it is empty.
  const none = <p className="empty-note" style={{ padding: "0 16px" }}>{t("cast.empty")}</p>;
  if (compact) return characters.length ? castGrid : none;
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
  // D57: the drama tree is how Assets is navigated (Characters, Locations, Props are its rows, as Episodes' are), so the
  // page has no tabs of its own: a plain heading with the count, shared by every episode. Story is the bible's page.
  const shelves: Record<Exclude<Shelf, "bible">, [string, CastCard[]]> = { cast: [t("cast.characters"), characters], scenes: [t("cast.locations"), places], props: [t("cast.props"), props] };
  if (shelf === "bible")
    return (
      <>
        <div style={{ padding: "0 16px" }}>
          <div className="tabsrow" style={{ margin: "4px 0 18px" }}>
            <div>
              <h2 className="pagetitle">{t("step.story")}</h2>
              <p className="muted pagesub">{t("story.subtitle")}</p>
            </div>
            <span className="grow" />
            {meta && (
              <span className="muted" style={{ fontSize: 12 }}>
                {meta}
              </span>
            )}
          </div>
        </div>
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
                  <Link key={code} to="/d/$dramaId/e/$episodeCode/canvas" params={{ dramaId: dramaId, episodeCode: code }} className="eprow">
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
      </>
    );
  const [label, cards] = shelves[shelf];
  return (
    <>
      <div style={{ padding: "0 16px" }}>
        <div className="tabsrow" style={{ margin: "4px 0 18px" }}>
          <h2 className="pagetitle">
            {label} <span className="muted">· {cards.length}</span>
          </h2>
          <span className="grow" />
          <span className="muted" style={{ fontSize: 12 }}>
            {t("cast.shared")}
          </span>
        </div>
      </div>
      {cards.length ? <AssetGrid cards={cards} names={names} dramaId={dramaId} picked={picked} /> : none}
      {pickedCard && <AssetViewer cards={cards} picked={pickedCard.subject} shelf={shelf} names={names} dramaId={dramaId} />}
    </>
  );
}

