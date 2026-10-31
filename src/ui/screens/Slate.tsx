// Home, ported from the approved pro prototype (design reference studio-pro/app.js, Home): the same DOM and class
// names as studio.css styles them, fed by the engine's dramas, reviews and card facts instead of the prototype's data.
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import type { AppInfo, DramaCard, ReviewSummary, Still as StillData } from "../../shared/types.ts";
import { ago, api, since, useAction, useResource } from "../api.ts";
import { Menu } from "../components/Menu.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { countText, errorText } from "../labels.ts";
import { Link, useNavigate } from "@tanstack/react-router";
import { dropScreenplay } from "./NewDrama.tsx";

type St = "you" | "redline" | "work" | "accepted" | "back";
type Shelf = "all" | "you" | "work" | "done";

/** The prototype's Status: a dot and a word, `span.st.<state>`. */
function Status({ st, label }: { st: St; label: string }) {
  return (
    <span className={`st ${st}`}>
      <i />
      {label}
    </span>
  );
}

/**
 * Where a drama stands, as its card's chip says it, and the prototype's shelf it sits on: a red line waiting on the
 * maker is its own state under Needs you; a stopped drama is under All only.
 */
function standing(drama: DramaCard, redLine: boolean): { st: St; label: TKey; shelf?: Shelf } {
  if (redLine) return { st: "redline", label: "drama.redLine", shelf: "you" };
  if (drama.waiting > 0) return { st: "you", label: "drama.needs", shelf: "you" };
  if (drama.status === "done") return { st: "accepted", label: "drama.finished", shelf: "done" };
  if (drama.status === "stopped") return { st: "back", label: "drama.stopped" };
  return { st: "work", label: drama.status === "setup" ? "drama.casting" : "drama.atWork", shelf: "work" };
}

const isRedLine = (item: ReviewSummary) => item.stop?.kind === "red-line";

type T = ReturnType<typeof useT>["t"];

/**
 * A waiting review as design/'s rows name it, tied to its drama: "Bride on Bail · EP006", then what waits (how
 * many, or a red line or a question), which, and how long it has waited.
 */
function rowOf(item: ReviewSummary, t: T, lang: ReturnType<typeof useT>["lang"]): { title: string; detail: string } {
  const title = `${item.dramaTitle} · ${item.episode ?? t(`kind.${item.kind}`)}`;
  const what = isRedLine(item) ? t("drama.redLine") : countText(item.kind, item.items, t) || t(`kind.${item.kind}`);
  return { title, detail: [what, item.subjects.join(", "), since(item.createdAt, lang)].filter(Boolean).join(" · ") };
}

/** A picture as the prototype's `img`: an image, or a video's opening frame. */
function Pic({ still }: { still: StillData }) {
  if (still.video) return <video src={`${still.url}#t=0.5`} muted playsInline preload="metadata" />;
  return <img src={still.url} alt="" />;
}

/**
 * A drama's cover: a frame of its own work (its newest take's last frame, else its photoreal storyboard, from the
 * engine); before either, the designed empty cover, its title as type.
 */
function Cover({ drama }: { drama: DramaCard }) {
  return drama.cover ? (
    <Pic still={drama.cover} />
  ) : (
    <span className="emptycover" aria-hidden="true">
      <Icon name="film-strip" className="ic" />
    </span>
  );
}


/** The dramas by their newest activity: when the agent last spoke in each, else when it was made. */
function byActivity(dramas: DramaCard[]): DramaCard[] {
  const at = (drama: DramaCard) => drama.facts.lastActivity ?? drama.createdAt;
  return [...dramas].sort((a, b) => at(b).localeCompare(at(a)));
}

/**
 * What waits for the maker, newest first, as a compact strip above the grid (D50: the projects are the grid's,
 * once each; design/app.js Home, .waitstrip). Each row opens its review; See all opens Reviews, the one queue (IA §16).
 */
function Waiting({ waiting, dramas }: { waiting: ReviewSummary[]; dramas: DramaCard[] }) {
  const { t, lang } = useT();
  if (!waiting.length) return null;
  return (
    <section className="waitstrip" aria-labelledby="waiting-title">
      <div className="wh">
        <h3 id="waiting-title">{t("slate.waiting")}</h3>
        <span className="fill" />
        <Link to="/reviews" className="seeall">
          {t("slate.seeAll", { n: waiting.length })}
          <Icon name="caret-right" className="ic" />
        </Link>
      </div>
      <ul aria-labelledby="waiting-title">
        {[...waiting]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 4)
          .map((item) => {
            // design/'s row is pictured by its project's cover, so the row and the card read as one project.
            const cover = dramas.find((entry) => entry.id === item.dramaId)?.cover;
            const row = rowOf(item, t, lang);
            return (
              <li key={item.id}>
                <Link to="/r/$reviewId" params={{ reviewId: item.id }} className="wait">
                  {cover ? <Pic still={cover} /> : <span className="emptythumb" />}
                  <span>
                    <b>{row.title}</b>
                    <small>{row.detail}</small>
                  </span>
                </Link>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

/** The prototype's .pcard: the cover with its status and progress, then the title, what it is, its spend and two tags. */
function Card({ drama, redLine }: { drama: DramaCard; redLine: boolean }) {
  const { t, lang } = useT();
  const where = standing(drama, redLine);
  const { facts } = drama;
  // D50: a cover, a title and a time (liblib's project grid); the rest is the project's own, a step away.
  return (
    <div className="pcard">
      <Link to="/d/$dramaId/episodes" params={{ dramaId: drama.id }} className="open">
        {/* D55: the format decides the cover's shape, portrait for a vertical drama, wide for a 16:9 one. */}
        <div className={drama.format.startsWith("16:9") ? "pic wide" : "pic"}>
          <Cover drama={drama} />
        </div>
        <div className="txt">
          <b>{drama.title}</b>
          {facts.lastActivity && <small>{ago(facts.lastActivity, lang)}</small>}
        </div>
      </Link>
      {/* design/'s "N need you" or "Red line" pill opens Reviews filtered to this drama (IA §16: a drama's Reviews is a
          filter of the one queue): a sibling of the card's link, not inside it. */}
      {where.st === "you" || where.st === "redline" ? (
        <Link to="/reviews" search={{ drama: drama.id }} className={`st ${where.st}`} title={t("slate.waitsFor", { title: drama.title })}>
          <i />
          {t(where.label, { n: drama.waiting })}
        </Link>
      ) : (
        <Status st={where.st} label={t(where.label, { n: drama.waiting })} />
      )}
    </div>
  );
}

/**
 * The prototype's .newcard at the shelf's end: a link to Upload, and a drop target (react-dropzone, drops only) that
 * opens Upload with the dropped screenplay in place.
 */
function NewCard() {
  const { t } = useT();
  const navigate = useNavigate();
  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (files[0]) dropScreenplay(files[0]);
      void navigate({ to: "/new" });
    },
  });
  return (
    // react-dropzone marks its root role="presentation"; the card stays the link it is.
    <Link to="/new" {...getRootProps({ className: `newcard ${isDragActive ? "over" : ""}`, role: "link" })}>
      <span className="pic">
        <span className="plus">
          <Icon name="plus" className="ic" />
        </span>
      </span>
      <span className="txt">
        <b>{t("slate.new")}</b>
        <small>{t("slate.newHint")}</small>
      </span>
    </Link>
  );
}

export function Slate() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { data, error } = useResource<DramaCard[]>("/api/dramas", ["dramas", "reviews"]);
  const queue = useResource<ReviewSummary[]>("/api/reviews", ["reviews"]);
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const [shelf, setShelf] = useState<Shelf>("all");
  const [find, setFind] = useState("");
  const [sort, setSort] = useState<"edited" | "title">("edited");
  const sample = useAction(async () => {
    const { id } = await api<{ id: string }>("/api/dramas/sample", { method: "POST", json: { language: lang } });
    void navigate({ to: "/d/$dramaId/episodes", params: { dramaId: id } });
  });
  const dramas = data ?? [];
  // On a project without the drama skill, the way to try the studio on Pine is a rehearsal.
  const noSkill = app.data?.mode === "pine" && app.data.dramaSkill === "missing";
  const waiting = (queue.data ?? []).filter((item) => item.state === "open");
  const redLines = new Set(waiting.filter(isRedLine).map((item) => item.dramaId));
  const counts: Record<Shelf, number> = { all: dramas.length, you: 0, work: 0, done: 0 };
  for (const drama of dramas) {
    const { shelf } = standing(drama, redLines.has(drama.id));
    if (shelf) counts[shelf]++;
  }
  const sorted = sort === "title" ? [...dramas].sort((a, b) => a.title.localeCompare(b.title, lang)) : byActivity(dramas);
  const shown = sorted.filter((drama) => (shelf === "all" || standing(drama, redLines.has(drama.id)).shelf === shelf) && drama.title.toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <div className="wrap">
      <div className="greet">
        <div className="fill">
          <h1>{t("slate.title")}</h1>
          {dramas.length > 0 && <p>{waiting.length ? t("slate.decisions", { n: waiting.length }) : t("slate.facts", { a: counts.work + counts.you, b: 0 })}</p>}
        </div>
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
      <Waiting waiting={waiting} dramas={dramas} />
      {dramas.length > 0 && (
        <div className="tabsrow">
          <div className="utabs" role="tablist" aria-label={t("slate.shelves")}>
            {(["all", "you", "work", "done"] as const).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={shelf === key} onClick={() => setShelf(key)}>
                {t(`slate.shelf.${key}`)}
                <small>{counts[key]}</small>
              </button>
            ))}
          </div>
          <span className="fill" />
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
        {/* Y3: New project leads the grid (liblib's 开始创作; Apple HIG keeps the create action with its collection). */}
        {(shelf === "all" && !find) || dramas.length === 0 ? <NewCard /> : null}
        {shown.map((drama) => (
          <Card key={drama.id} drama={drama} redLine={redLines.has(drama.id)} />
        ))}
      </div>
    </div>
  );
}
