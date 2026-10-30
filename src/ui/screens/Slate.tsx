// Home, ported from the approved pro prototype (design reference studio-pro/app.js, Home): the same DOM and class
// names as studio.css styles them, fed by the engine's dramas, inbox and card facts instead of the prototype's data.
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import type { AppInfo, DramaCard, ReviewSummary, Still as StillData } from "../../shared/types.ts";
import { ago, api, useAction, useResource } from "../api.ts";
import { Menu } from "../components/Menu.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, kindLabel, moneyText, plainText } from "../labels.ts";
import { Link, navigate } from "../router.tsx";
import { dropScreenplay } from "./NewDrama.tsx";

type St = "you" | "work" | "accepted" | "back";
type Shelf = "all" | "you" | "work" | "done" | "stopped";

/** The prototype's Status: a dot and a word, `span.st.<state>`. */
function Status({ st, label }: { st: St; label: string }) {
  return (
    <span className={`st ${st}`}>
      <i />
      {label}
    </span>
  );
}

/** Where a drama stands, as its card's chip says it, and the shelf it sits on. */
function standing(drama: DramaCard): { st: St; label: TKey; shelf: Shelf } {
  if (drama.waiting > 0) return { st: "you", label: "drama.needs", shelf: "you" };
  if (drama.status === "done") return { st: "accepted", label: "drama.finished", shelf: "done" };
  if (drama.status === "stopped") return { st: "back", label: "drama.stopped", shelf: "stopped" };
  return { st: "work", label: drama.status === "setup" ? "drama.casting" : "drama.atWork", shelf: "work" };
}

/** A picture as the prototype's `img`: an image, or a video's opening frame. `face` crops a look sheet to its close-up. */
function Pic({ still, face }: { still: StillData; face?: boolean }) {
  if (still.video) return <video src={`${still.url}#t=0.5`} muted playsInline preload="metadata" />;
  return <img src={still.url} alt="" className={face ? "face" : undefined} />;
}

/**
 * A drama's cover: a frame of its own work (its newest take's last frame, else its photoreal storyboard, from the
 * engine); before either, the designed empty cover, its title as type.
 */
function Cover({ drama }: { drama: DramaCard }) {
  return drama.cover ? <Pic still={drama.cover} /> : <span className="emptycover">{drama.title}</span>;
}

/** The greeting by the hour of the maker's own clock. */
function greeting(): TKey {
  const hour = new Date().getHours();
  return hour < 12 ? "slate.greet.morning" : hour < 18 ? "slate.greet.afternoon" : "slate.greet.evening";
}

/** The dramas by their newest activity: when the agent last spoke in each, else when it was made. */
function byActivity(dramas: DramaCard[]): DramaCard[] {
  const at = (drama: DramaCard) => drama.facts.lastActivity ?? drama.createdAt;
  return [...dramas].sort((a, b) => at(b).localeCompare(at(a)));
}

/** The prototype's .hero: the drama worked on last, its waiting review first; beside it, what waits, newest first. */
function Hero({ waiting, dramas }: { waiting: ReviewSummary[]; dramas: DramaCard[] }) {
  const { t, lang } = useT();
  const drama = byActivity(dramas)[0];
  if (!drama) return null;
  const review = waiting.find((item) => item.dramaId === drama.id);
  const where = standing(drama);
  const line = review?.question || drama.facts.lastLine;
  const { total, done } = drama.episodes;
  return (
    <section className="hero" aria-labelledby="continue-title">
      <div className="left">
        <div className="cover">
          <Cover drama={drama} />
          <Status st={where.st} label={t(where.label, { n: drama.waiting })} />
        </div>
        <div className="info grow">
          <span className="kicker">{t("slate.continue")}</span>
          <h2 id="continue-title">{drama.title}</h2>
          <span className="where">
            <Icon name="map-pin" className="ic" />
            {review ? [review.episode, t("slate.waitsKind", { kind: t(`kind.${review.kind}` as TKey) })].filter(Boolean).join(" · ") : t(where.label, { n: drama.waiting })}
          </span>
          {line && <blockquote>{plainText(line)}</blockquote>}
          <div className="row">
            <span>
              {[
                total ? t("drama.episodes", { done, total }) : "",
                drama.spent.total > 0 ? t("slate.spent", { amount: moneyText(drama.spent, t, lang) }) : "",
                drama.facts.lastActivity ? ago(drama.facts.lastActivity, lang) : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="grow" />
            {review ? (
              <>
                <Link to={`/d/${drama.id}`} className="btn">
                  {t("slate.openDrama")}
                </Link>
                <Link to={`/r/${review.id}`} className="btn lg primary">
                  <Icon name="play" className="ic" />
                  {t("slate.review", { kind: t(`kind.${review.kind}` as TKey) })}
                </Link>
              </>
            ) : (
              <Link to={`/d/${drama.id}`} className="btn lg primary">
                {t("slate.openDrama")}
              </Link>
            )}
          </div>
        </div>
      </div>
      <div className="right">
        <h3 id="waiting-title">{t("slate.waiting")}</h3>
        <ul aria-labelledby="waiting-title">
          {[...waiting]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 4)
            .map((item) => {
              const own = dramas.find((entry) => entry.id === item.dramaId);
              // The item's own picture (a look's is a whole sheet, cropped to its close-up), else its drama's cover.
              const pic = item.thumb ?? own?.cover;
              return (
                <li key={item.id}>
                  <Link to={`/r/${item.id}`} className="wait">
                    {pic ? <Pic still={pic} face={Boolean(item.thumb) && item.kind === "looks"} /> : <span className="emptythumb" />}
                    <span>
                      <b>{[item.episode, t(`kind.${item.kind}` as TKey)].filter(Boolean).join(" · ")}</b>
                      <small>{[t("slate.items", { n: item.items }), item.dramaTitle, ago(item.createdAt, lang)].join(" · ")}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
        </ul>
      </div>
    </section>
  );
}

/** The prototype's .pcard: the cover with its status and progress, then the title, what it is, its spend and two tags. */
function Card({ drama }: { drama: DramaCard }) {
  const { t, lang } = useT();
  const where = standing(drama);
  const { total, done } = drama.episodes;
  const { facts } = drama;
  // Planned: the episodes drama-cli lists, at the length the maker asked; neither guessed.
  const planned = facts.scale && facts.length ? Math.round((facts.scale.episodes * Number(facts.length)) / 60) : 0;
  return (
    <Link to={`/d/${drama.id}`} className="pcard">
      <div className="pic">
        <Cover drama={drama} />
        <Status st={where.st} label={t(where.label, { n: drama.waiting })} />
        {total > 0 && (
          <span className="bar">
            <i style={{ width: `${(done / total) * 100}%` }} />
          </span>
        )}
      </div>
      <div className="txt">
        <b>{drama.title}</b>
        {facts.logline && <small className="logline">{facts.logline}</small>}
        <small>{[facts.scale ? t("drama.scale", facts.scale) : "", kindLabel(drama, t), planned ? t("drama.planned", { n: planned }) : ""].filter(Boolean).join(" · ")}</small>
        <small>
          {[facts.lastActivity ? ago(facts.lastActivity, lang) : "", drama.spent.total > 0 ? t("slate.spent", { amount: moneyText(drama.spent, t, lang) }) : ""].filter(Boolean).join(" · ")}
        </small>
        {facts.genres && (
          <div className="tags">
            {facts.genres.slice(0, 2).map((genre) => (
              <span key={genre} className="tag">
                {genre}
              </span>
            ))}
            {facts.genres.length > 2 && <span className="tag">+{facts.genres.length - 2}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}

/**
 * The prototype's .newcard at the shelf's end: a link to Upload, and a drop target (react-dropzone, drops only) that
 * opens Upload with the dropped screenplay in place.
 */
function NewCard() {
  const { t } = useT();
  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (files[0]) dropScreenplay(files[0]);
      navigate("/new");
    },
  });
  return (
    // react-dropzone marks its root role="presentation"; the card stays the link it is.
    <Link to="/new" {...getRootProps({ className: `newcard ${isDragActive ? "over" : ""}`, role: "link" })}>
      <span className="plus">
        <Icon name="plus" className="ic" />
      </span>
      <b>{t("slate.new")}</b>
      <small>{t("slate.newHint")}</small>
    </Link>
  );
}

export function Slate() {
  const { t, lang } = useT();
  const { data, error } = useResource<DramaCard[]>("/api/dramas", ["dramas", "inbox"]);
  const inbox = useResource<ReviewSummary[]>("/api/inbox", ["inbox"]);
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const [shelf, setShelf] = useState<Shelf>("all");
  const [find, setFind] = useState("");
  const [sort, setSort] = useState<"edited" | "title">("edited");
  const sample = useAction(async () => {
    const { id } = await api<{ id: string }>("/api/dramas/sample", { method: "POST", json: { language: lang } });
    navigate(`/d/${id}`);
  });
  const dramas = data ?? [];
  // On a project without the drama skill, the way to try the studio on Pine is a rehearsal.
  const noSkill = app.data?.mode === "pine" && app.data.dramaSkill === "missing";
  const waiting = (inbox.data ?? []).filter((item) => item.state === "open");
  const counts: Record<Shelf, number> = { all: dramas.length, you: 0, work: 0, done: 0, stopped: 0 };
  for (const drama of dramas) counts[standing(drama).shelf]++;
  const sorted = sort === "title" ? [...dramas].sort((a, b) => a.title.localeCompare(b.title, lang)) : byActivity(dramas);
  const shown = sorted.filter((drama) => (shelf === "all" || standing(drama).shelf === shelf) && drama.title.toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <div className="wrap">
      <div className="greet">
        <div className="grow">
          <h1>{t(greeting())}</h1>
          {dramas.length > 0 && <p>{waiting.length ? t("slate.decisions", { n: waiting.length }) : t("slate.facts", { a: counts.work + counts.you, b: 0 })}</p>}
        </div>
        <Link to="/new" className="btn lg primary">
          <Icon name="upload" className="ic" />
          {t("slate.upload")}
        </Link>
      </div>
      {error !== undefined && <p className="error">{errorText(error, t)}</p>}
      {data && dramas.length === 0 && (
        <div className="first">
          <p className="muted">{t(noSkill ? "slate.noSkill" : "slate.empty")}</p>
          {(app.data?.mode === "replay" || noSkill) && (
            <button type="button" className="btn" disabled={sample.busy} onClick={() => void sample.run()}>
              {t(noSkill ? "slate.rehearseSample" : "slate.sample")}
            </button>
          )}
          {sample.error !== undefined && <p className="error small">{errorText(sample.error, t)}</p>}
        </div>
      )}
      {data && dramas.length > 0 && noSkill && (
        <div className="first">
          <p className="muted">{t("slate.noSkill")}</p>
          <button type="button" className="btn sm" disabled={sample.busy} onClick={() => void sample.run()}>
            {t("slate.rehearseSample")}
          </button>
        </div>
      )}
      <Hero waiting={waiting} dramas={dramas} />
      {dramas.length > 0 && (
        <div className="tabsrow">
          <div className="utabs" role="tablist" aria-label={t("slate.shelves")}>
            {(["all", "you", "work", "done", "stopped"] as const).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={shelf === key} onClick={() => setShelf(key)}>
                {t(`slate.shelf.${key}`)}
                <small>{counts[key]}</small>
              </button>
            ))}
          </div>
          <span className="grow" />
          <label className="search">
            <Icon name="magnifying-glass" className="ic" />
            <input type="search" placeholder={t("slate.find")} aria-label={t("slate.find")} value={find} onChange={(event) => setFind(event.target.value)} />
          </label>
          <Menu
            label={t("slate.sort")}
            wide="select"
            trigger={
              <>
                {t(sort === "title" ? "slate.sort.title" : "slate.sort.edited")}
                <Icon name="caret-down" className="ic" />
              </>
            }
            items={[
              { label: t("slate.sort.edited"), run: () => setSort("edited") },
              { label: t("slate.sort.title"), run: () => setSort("title") },
            ]}
          />
        </div>
      )}
      <div className="cards" role="tabpanel" aria-label={t("slate.shelves")}>
        {shown.map((drama) => (
          <Card key={drama.id} drama={drama} />
        ))}
        {(shelf === "all" && !find) || dramas.length === 0 ? <NewCard /> : null}
      </div>
    </div>
  );
}
