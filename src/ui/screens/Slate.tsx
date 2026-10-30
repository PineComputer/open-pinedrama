import { useState } from "react";
import type { AppInfo, DramaCard, Mode, ReviewSummary } from "../../shared/types.ts";
import { ago, api, useAction, useResource } from "../api.ts";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { Menu } from "../components/Menu.tsx";
import { Tabs } from "../components/Tabs.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, kindLabel, moneyText, plainText } from "../labels.ts";
import { Link, navigate } from "../router.tsx";
import { Still } from "../Still.tsx";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

const CJK = /[㐀-鿿]/;

/** A drama's poster: a frame of its own work, its title over it; before any, the designed empty cover, its title as type. */
function Poster({ drama, mode }: { drama: DramaCard; mode?: Mode | "none" }) {
  const { t } = useT();
  const elsewhere = mode !== undefined && mode !== "none" && mode !== drama.mode;
  // Where it stands is on the card's chip; the poster says only what else to know: another mode's, a rehearsal.
  const stamp = elsewhere ? t(drama.mode === "replay" ? "otherMode.replay" : "otherMode.pine") : undefined;
  const stamps = [drama.rehearsal ? t("rehearsal.tag") : undefined, stamp].filter(Boolean).join(" · ");
  return (
    <div className={`poster ${CJK.test(drama.title) ? "vertical" : ""} ${drama.cover ? "work" : ""}`}>
      {drama.cover && (
        <span className="work-pic">
          <Still still={drama.cover} />
        </span>
      )}
      <h3>{drama.title}</h3>
      <div className="foot">{stamps && <span className="stamp">{stamps}</span>}</div>
    </div>
  );
}

/** A drama's cover as a still: its first lead's sheet, once drawn. */
function coverOf(drama: DramaCard | undefined): { url: string } | undefined {
  return drama?.cast[0] ? { url: drama.cast[0] } : undefined;
}

/** The greeting by the hour of the maker's own clock. */
function greeting(): TKey {
  const hour = new Date().getHours();
  return hour < 12 ? "slate.greet.morning" : hour < 18 ? "slate.greet.afternoon" : "slate.greet.evening";
}

type Shelf = "all" | "you" | "work" | "done" | "stopped";

/** Where a drama stands, as its card's chip says it. */
function standing(drama: DramaCard): { status: Status; label: TKey; shelf: Shelf } {
  if (drama.waiting > 0) return { status: "you", label: "drama.needs", shelf: "you" };
  if (drama.status === "done") return { status: "accepted", label: "drama.finished", shelf: "done" };
  if (drama.status === "stopped") return { status: "back", label: "drama.stopped", shelf: "stopped" };
  return { status: "work", label: drama.status === "setup" ? "drama.casting" : "drama.atWork", shelf: "work" };
}

/** A drama on the shelf: its cover, where it stands, its progress, title and facts (the spec's DramaCard). */
export function DramaTile({ drama, mode }: { drama: DramaCard; mode?: Mode | "none" }) {
  const { t, lang } = useT();
  const { total, done } = drama.episodes;
  const where = standing(drama);
  const { facts } = drama;
  // Planned: the episodes drama-cli lists, at the length the maker asked; neither guessed.
  const planned = facts.scale && facts.length ? Math.round((facts.scale.episodes * Number(facts.length)) / 60) : 0;
  return (
    <Link to={`/d/${drama.id}`} className="ds-dramacard">
      <span className="pic">
        <Poster drama={drama} mode={mode} />
        <span className="chip">
          <StatusChip status={where.status} label={t(where.label, { n: drama.waiting })} over />
        </span>
        {total > 0 && (
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${(done / total) * 100}%` }} />
          </span>
        )}
      </span>
      <span className="txt">
        <b>{drama.title}</b>
        {facts.logline && <small className="logline">{facts.logline}</small>}
        {facts.genres && (
          <span className="tags">
            {facts.genres.slice(0, 2).map((genre) => (
              <Badge key={genre} variant="secondary">
                {genre}
              </Badge>
            ))}
            {facts.genres.length > 2 && <Badge variant="outline">+{facts.genres.length - 2}</Badge>}
          </span>
        )}
        {facts.scale && <small>{t("drama.scale", facts.scale)}</small>}
        <small>
          {total > 0 ? `${t("drama.episodes", { done, total })} · ` : ""}
          {[drama.format.split(",")[0], kindLabel(drama, t), planned ? t("drama.planned", { n: planned }) : ""].filter(Boolean).join(" · ")}
        </small>
        <small className="num">
          {[facts.lastActivity ? ago(facts.lastActivity, lang) : "", drama.spent.total > 0 ? moneyText(drama.spent, t, lang) : ""].filter(Boolean).join(" · ")}
        </small>
      </span>
    </Link>
  );
}

/** The dramas by their newest activity: when the agent last spoke in each, else when it was made. */
function byActivity(dramas: DramaCard[]): DramaCard[] {
  const at = (drama: DramaCard) => drama.facts.lastActivity ?? drama.createdAt;
  return [...dramas].sort((a, b) => at(b).localeCompare(at(a)));
}

/**
 * The drama worked on last, to carry on with (reveric's 继续写): its cover, where it stands, the review waiting in it
 * first, else the agent's last line; beside it, the recent dramas, each with its cover, standing and time.
 */
function Continue({ waiting, dramas }: { waiting: ReviewSummary[]; dramas: DramaCard[] }) {
  const { t, lang } = useT();
  const recent = byActivity(dramas);
  const drama = recent[0];
  if (!drama) return null;
  const review = waiting.find((item) => item.dramaId === drama.id);
  const where = standing(drama);
  return (
    <section className="ds-hero" aria-labelledby="continue-title">
      <div className="left">
        <span className="cover">
          <Poster drama={drama} />
          <span className="chip">
            <StatusChip status={where.status} label={t(where.label, { n: drama.waiting })} over />
          </span>
        </span>
        <div className="info">
          <span className="kicker">{t("slate.continue")}</span>
          <h2 id="continue-title">{drama.title}</h2>
          <span className="where">
            <Icon name="map-pin" />
            {review ? [review.episode, t("slate.waitsKind", { kind: t(`kind.${review.kind}` as TKey) })].filter(Boolean).join(" · ") : t(where.label, { n: drama.waiting })}
          </span>
          {(review?.question || drama.facts.lastLine) && <blockquote>{plainText(review?.question || drama.facts.lastLine!)}</blockquote>}
          <span className="row">
            {[drama.facts.scale ? t("drama.scale", drama.facts.scale) : "", drama.facts.lastActivity ? ago(drama.facts.lastActivity, lang) : "", drama.spent.total > 0 ? moneyText(drama.spent, t, lang) : ""].filter(Boolean).join(" · ")}
          </span>
          <span className="acts">
            {review && (
              <Link to={`/r/${review.id}`} className={buttonVariants({ size: "lg" })}>
                <Icon name="play" />
                {t("slate.review", { kind: t(`kind.${review.kind}` as TKey) })}
              </Link>
            )}
            <Link to={`/d/${drama.id}`} className={buttonVariants({ variant: review ? "outline" : "default", size: review ? "default" : "lg" })}>
              {t("slate.openDrama")}
            </Link>
          </span>
        </div>
      </div>
      <div className="right">
        <h3 id="waiting-title">{t("slate.waiting")}</h3>
        <ul aria-labelledby="waiting-title">
          {[...waiting]
            .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
            .slice(0, 4)
            .map((item) => (
              <li key={item.id}>
                <Link to={`/r/${item.id}`} className="wait">
                  {/* A look's picture is a whole sheet: cropped to its close-up, as a cover of the leads is. */}
                  <span className={item.thumb && item.kind !== "looks" ? "thumb" : "thumb cover"}>
                    <Still still={item.thumb ?? coverOf(dramas.find((entry) => entry.id === item.dramaId))} />
                  </span>
                  <span>
                    <b>{[item.episode, t(`kind.${item.kind}` as TKey)].filter(Boolean).join(" · ")}</b>
                    <small>{[t("slate.items", { n: item.items }), item.dramaTitle, ago(item.createdAt, lang)].join(" · ")}</small>
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}

function Shelf({ dramas, mode, adding }: { dramas: DramaCard[]; mode?: Mode | "none"; adding: boolean }) {
  const { t } = useT();
  return (
    <div className="ds-shelf">
      {dramas.map((drama) => (
        <DramaTile key={drama.id} drama={drama} mode={mode} />
      ))}
      {adding && (
        <Link to="/new" className="ds-newcard">
          <span className="plus">
            <Icon name="plus" />
          </span>
          <b>{t("slate.new")}</b>
          <small>{t("slate.newHint")}</small>
        </Link>
      )}
    </div>
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
  const waiting = (inbox.data ?? []).filter((item) => item.state === "open").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const counts = { all: dramas.length, you: 0, work: 0, done: 0, stopped: 0 };
  for (const drama of dramas) {
    const where = standing(drama).shelf;
    if (where !== "all") counts[where]++;
  }
  const sorted = sort === "title" ? [...dramas].sort((a, b) => a.title.localeCompare(b.title, lang)) : byActivity(dramas);
  const shown = sorted.filter((drama) => (shelf === "all" || standing(drama).shelf === shelf) && drama.title.toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>{t(greeting())}</h1>
          {dramas.length > 0 && <p className="facts">{waiting.length ? t("slate.decisions", { n: waiting.length }) : t("slate.facts", { a: counts.work + counts.you, b: 0 })}</p>}
        </div>
        <span className="spacer" />
        <Link to="/new" className={buttonVariants({ variant: "default", size: "lg" })}>
          <Icon name="upload" />
          {t("slate.upload")}
        </Link>
      </div>
      {error !== undefined && <p className="error">{errorText(error, t)}</p>}
      {data && dramas.length === 0 && (
        <div className="first">
          <p className="empty-note">{t(noSkill ? "slate.noSkill" : "slate.empty")}</p>
          {(app.data?.mode === "replay" || noSkill) && (
            <button className={buttonVariants({ variant: "outline" })} disabled={sample.busy} onClick={() => void sample.run()}>
              {t(noSkill ? "slate.rehearseSample" : "slate.sample")}
            </button>
          )}
          {sample.error !== undefined && <p className="error small">{errorText(sample.error, t)}</p>}
        </div>
      )}
      {data && dramas.length > 0 && noSkill && (
        <div className="notice quiet-notice">
          <span>{t("slate.noSkill")}</span>
          <span className="notice-actions">
            {sample.error !== undefined && <span className="error small">{errorText(sample.error, t)}</span>}
            <button className={buttonVariants({ variant: "outline", size: "sm" })} disabled={sample.busy} onClick={() => void sample.run()}>
              {t("slate.rehearseSample")}
            </button>
          </span>
        </div>
      )}
      <Continue waiting={waiting} dramas={dramas} />
      {dramas.length > 0 ? (
        <Tabs
          label={t("slate.shelves")}
          value={shelf}
          onChange={setShelf}
          tabs={(["all", "you", "work", "done", "stopped"] as const).map((key) => ({ value: key, label: t(`slate.shelf.${key}`), count: counts[key] }))}
          end={
            <>
            <Menu
              label={t("slate.sort")}
              wide="ds-select"
              trigger={
                <>
                  {t(sort === "title" ? "slate.sort.title" : "slate.sort.edited")}
                  <Icon name="caret-down" />
                </>
              }
              items={[
                { label: t("slate.sort.edited"), run: () => setSort("edited") },
                { label: t("slate.sort.title"), run: () => setSort("title") },
              ]}
            />
            <label className="ds-search">
              <Icon name="magnifying-glass" />
              <input type="search" placeholder={t("slate.find")} aria-label={t("slate.find")} value={find} onChange={(event) => setFind(event.target.value)} />
            </label>
            </>
          }
        >
          <Shelf dramas={shown} mode={app.data?.mode} adding={shelf === "all" && !find} />
        </Tabs>
      ) : (
        <Shelf dramas={[]} adding />
      )}
    </div>
  );
}
