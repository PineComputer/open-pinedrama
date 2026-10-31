// The sidebar beside the rail, ported from the design (design/app.js, Side; screens.js, SetupSteps)
// with its markup and classes: on the studio's pages its places; in a drama the drama, its steps
// Script · Story · Episodes · Cut with what waits for the maker under each, the episode tree under
// Episodes, or the setup's steps while it is set up; and at the foot what it has spent.
import { Link, linkOptions, type LinkOptions, useNavigate } from "@tanstack/react-router";
import type { LineageView } from "../../shared/lineage.ts";
import type { ProjectView, SessionReport } from "../../shared/project.ts";
import type { CastCard, DramaCard, DramaView, EpisodeRow, ReviewSummary } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { Menu } from "../components/Menu.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { isSettingUp, moneyText, nowText, scriptWaits, SETUP_STEPS } from "../labels.ts";
import { Mark } from "../Mark.tsx";
import type { Page } from "../place.ts";
import { DramaThumb } from "../components/DramaThumb.tsx";
import { dramaTree, type Mark as EpisodeMark, markOf } from "./tree.ts";

export type Step = "script" | "story" | "episodes" | "cut";

/** The step a drama's page is on: before there are episodes, its board is the story being made. */
export function stepOf(drama: DramaView, page: Page | undefined): Step | undefined {
  const settingUp = isSettingUp(drama);
  if (page === "script" || page === "analyzing") return "script";
  if (page === "story" || page === "characters" || page === "locations" || page === "props" || (page === "episodes" && settingUp)) return "story";
  if (page === "delivery" || page === "cut") return "cut";
  return page === "episodes" || page === "list" ? "episodes" : undefined;
}

/**
 * The studio's sidebar, off any one project: only the studio's own items (yurun's Y2: on Home the main area is the list
 * of projects, so the sidebar doesn't repeat it). Projects, Reviews and Settings are the rail's; Computers and Usage
 * stay hidden until they work (IA §2).
 */
export function HomeSidebar({ page, replay, drawer }: { page: Page | undefined; replay: boolean; drawer: boolean }) {
  const { t } = useT();
  return (
    <aside className={drawer ? "side drawer-open" : "side"} aria-label={t("sidebar.label")}>
      <div className="head">
        <div className="who" style={{ paddingLeft: 4 }}>
          <Mark size={30} />
          <b style={{ fontSize: 14 }}>{t("app.name")}</b>
        </div>
      </div>
      <nav className="scroll" aria-label={t("sidebar.places")}>
        <Link to="/new" className="navi" aria-current={page === "new" ? "page" : "false"}>
          <Icon name="plus" className="ic" />
          {t("slate.new")}
        </Link>
      </nav>
      <div className="foot">
        <div className="who">
          <span className="av">Y</span>
          <span className="grow">{t("sidebar.yourStudio")}</span>
          <Icon name="caret-right" className="ic" />
        </div>
        {replay && <span className="muted">{t("mode.replay")}</span>}
      </div>
    </aside>
  );
}

/**
 * The sidebar's foot, as the design's (design/app.js, Side; BudgetMeter): what the drama has spent
 * against drama-cli's budget, solid, and what is in flight, dashed; how much is in flight and how
 * many episodes are at work, or the setup's step before there are any; and what Spent covers.
 */
function Standing({ drama, sessions }: { drama: DramaView; sessions: SessionReport[] }) {
  const { t, lang } = useT();
  const { episodes } = drama;
  // Every session's project carries the drama's one config, so its cap; what each has reserved for calls still out is its own.
  const cap = sessions[0]?.budget.budgetUsd ?? null;
  const inFlight = sessions.reduce((sum, session) => sum + session.budget.reservedUsd, 0);
  const share = (usd: number) => (cap ? `${Math.min(100, (usd / cap) * 100)}%` : "0%");
  return (
    <div className="foot" role="status" aria-label={t("statusbar.label")} title={t("spent.about")}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{t(drama.mode === "replay" ? "budget.simulated" : "budget.spent")}</span>
        <b className="mono" style={{ color: "var(--text-primary)" }}>
          {moneyText(drama.spent, t, lang)}
          {cap !== null && <span className="muted"> / {usd(cap)}</span>}
        </b>
      </div>
      {cap !== null && (
        <div className="meter" role="meter" aria-label={t("budget.spentOf")} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={drama.spent.total}>
          <i style={{ width: share(drama.spent.total) }} />
          <i className="fly" style={{ width: share(inFlight) }} />
        </div>
      )}
      <span>
        {episodes.total
          ? [inFlight > 0 ? t("budget.inFlight", { money: usd(inFlight) }) : "", t("statusbar.atWork", { n: episodes.working })].filter(Boolean).join(" · ")
          : t("statusbar.setup", { step: t(SETUP_STEPS[Math.min(drama.setup.reached, SETUP_STEPS.length - 1)]) })}
      </span>
      <span className="subtle" style={{ fontSize: 11 }}>
        {t("spent.about")}
      </span>
    </div>
  );
}

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, "")}`;

/** A drama's sidebar, as the design's (design/app.js, Side; screens.js, SetupSteps). */
/** drawer: the sidebar opens over the work, below 1100 px (IA draft r2, F). */
export function DramaSidebar({ drama, page, episode, drawer }: { drama: DramaView; page: Page | undefined; episode?: string; drawer: boolean }) {
  const { t } = useT();
  const navigate = useNavigate();
  const others = useResource<DramaCard[]>("/api/dramas", ["dramas"]);
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  const step = stepOf(drama, page);
  // The tree's counts, each from the resource its place shows (tree.ts).
  const reviews = useResource<ReviewSummary[]>(`/api/reviews?drama=${drama.id}`, ["reviews"]);
  const cast = useResource<CastCard[]>(`/api/dramas/${drama.id}/cast`, [`drama:${drama.id}`]);
  const lineage = useResource<LineageView>(`/api/dramas/${drama.id}/lineage`, [`project:${drama.id}`]);
  const tree = dramaTree({ cast: cast.data ?? [], reviews: reviews.data ?? [], lineage: lineage.data?.lineage ?? null, rows: drama.episodeRows });
  // The script is done once the maker has answered the setup's first question about it.
  const scriptDone = drama.setup.reached > 1 || drama.episodeRows.length > 0;
  // The tree folds the episodes that only wait in line at its end into one line ("EP009–EP024 · 16 in line"), as the design does.
  const lineStart = drama.episodeRows.findLastIndex((row) => row.state !== "queued") + 1;
  const folded = drama.episodeRows.length - lineStart > 1 ? drama.episodeRows.slice(lineStart) : [];
  const shownRows = drama.episodeRows.slice(0, drama.episodeRows.length - folded.length);
  const { episodes } = drama;
  const settingUp = isSettingUp(drama);
  const head = (
    <div className="head">
      <Menu
        label={t("sidebar.switch")}
        wide="proj"
        trigger={
          <>
            <DramaThumb drama={drama} />
            <span className="grow">
              <b>{drama.title}</b>
              <small>{settingUp ? t("sidebar.setupSession") : [episodes.total ? t("sidebar.episodes", { n: episodes.total }) : "", drama.format].filter(Boolean).join(" · ")}</small>
            </span>
            <Icon name="caret-down" className="ic subtle" />
          </>
        }
        items={[
          ...(others.data ?? []).filter((other) => other.id !== drama.id).map((other) => ({ label: other.title, run: () => void navigate({ to: "/d/$dramaId/episodes", params: { dramaId: other.id } }) })),
          { label: t("sidebar.allDramas"), run: () => void navigate({ to: "/" }) },
        ]}
      />
    </div>
  );
  if (settingUp) {
    // The setup's steps, as the design's SetupSteps: Script, Story, Episodes and Cut, each where it stands.
    const reached = drama.setup.reached;
    const rows: { key: Step; label: TKey; state: "done" | "you" | "work" | "line"; detail: TKey; to?: LinkOptions }[] = [
      { key: "script", label: "step.script", state: scriptDone ? "done" : scriptWaits(drama) ? "you" : "work", detail: scriptDone ? "setupSteps.done" : scriptWaits(drama) ? "setupSteps.yourReview" : "setupSteps.checking", to: linkOptions({ to: "/d/$dramaId/script", params: { dramaId: drama.id } }) },
      { key: "story", label: "step.story", state: !scriptDone ? "line" : drama.setup.state === "waiting" ? "you" : reached >= 4 ? "done" : "work", detail: !scriptDone ? "setupSteps.afterYourReview" : drama.setup.state === "waiting" ? "setupSteps.yourReview" : "setupSteps.making", to: linkOptions({ to: "/d/$dramaId/story", params: { dramaId: drama.id } }) },
      { key: "episodes", label: "step.episodes", state: reached >= 4 ? "work" : "line", detail: reached >= 4 ? "setupSteps.making" : "setupSteps.afterLooks" },
      { key: "cut", label: "step.cut", state: "line", detail: "setupSteps.perEpisode" },
    ];
    return (
      <aside className={drawer ? "side drawer-open" : "side"} aria-label={t("sidebar.label")}>
        {head}
        <div className="scroll">
          <div className="sec">{t("sidebar.setup")}</div>
          <ol className="setup" aria-label={t("rail.steps")}>
            {rows.map((row, n) => (
              <li key={row.key} className={row.state}>
                <button type="button" disabled={!row.to} aria-current={row.key === step ? "true" : "false"} onClick={() => row.to && void navigate(row.to)}>
                  <span className="n">{row.state === "done" ? <Icon name="check" className="ic" /> : n + 1}</span>
                  <span>
                    <b>{t(row.label)}</b>
                    <small>{t(row.detail)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <Standing drama={drama} sessions={project.data?.sessions ?? []} />
      </aside>
    );
  }
  const dramaId = drama.id;
  const params = { dramaId };
  // What waits for the maker at a place: shown, and said in the link's name with its visible text (WCAG 2.5.3).
  const needs = (n: number) =>
    n > 0 && (
      <span className="cnt" aria-label={t("rail.needYou", { n })}>
        {n}
      </span>
    );
  const at = (current: boolean) => (current ? "page" : "false");
  const shelves = [
    { page: "characters", label: "cast.characters", n: tree.shelves.characters, to: "/d/$dramaId/assets/characters/{-$assetId}" },
    { page: "locations", label: "cast.locations", n: tree.shelves.locations, to: "/d/$dramaId/assets/locations/{-$assetId}" },
    { page: "props", label: "cast.props", n: tree.shelves.props, to: "/d/$dramaId/assets/props/{-$assetId}" },
  ] as const;
  const onShelf = shelves.some((shelf) => shelf.page === page);
  // The drama tree (IA §2, §16; design/app.js, Side): each of the drama's places once, the Assets shelves and the
  // episodes under theirs, then the drama's Reviews and what is Out of date.
  return (
    <aside className={drawer ? "side drawer-open" : "side"} aria-label={t("sidebar.label")}>
      {head}
      {/* The drama tree is named after its drama, as its head shows it. */}
      <nav className="scroll" aria-label={drama.title}>
        <Link to="/d/$dramaId/script" params={params} className="navi" aria-current={at(page === "script" || page === "analyzing")}>
          <Icon name="file-text" className="ic" />
          {t("step.script")}
          {needs(tree.needs.script) || (scriptDone && <span className="end"><Icon name="check" className="ic" /></span>)}
        </Link>
        <Link to="/d/$dramaId/story" params={params} className="navi" aria-current={at(page === "story")}>
          <Icon name="book-open" className="ic" />
          {t("step.story")}
        </Link>
        <Link to="/d/$dramaId/assets/characters/{-$assetId}" params={{ dramaId, assetId: undefined }} className="navi" aria-current={at(onShelf)}>
          <Icon name="stack" className="ic" />
          {t("step.assets")}
          {needs(tree.needs.assets)}
        </Link>
        <ul className="tree sub" aria-label={t("step.assets")}>
          {shelves.map((shelf) => (
            <li key={shelf.page}>
              <button type="button" aria-current={shelf.page === page ? "true" : "false"} onClick={() => void navigate({ to: shelf.to, params: { dramaId, assetId: undefined } })}>
                <span className="now">{t(shelf.label)}</span>
                <span className="n">{shelf.n}</span>
              </button>
            </li>
          ))}
        </ul>
        <Link to="/d/$dramaId/episodes" params={params} className="navi" aria-current={at(page === "episodes")}>
          <Icon name="film-strip" className="ic" />
          {t("step.episodes")}
          {needs(tree.episodes)}
        </Link>
        {drama.episodeRows.length > 0 && (
          <ul className="tree" aria-label={t("tree.label")}>
            {shownRows.map((row) => {
              const mark = markOf(row);
              return [
                <li key={row.id}>
                  {/* The name is what the button shows, then where it stands, said rather than shown (WCAG 2.5.3). */}
                  <button type="button" aria-current={row.code === episode ? "true" : "false"} onClick={() => void navigate({ to: "/d/$dramaId/e/$episodeCode/list", params: { dramaId, episodeCode: row.code } })}>
                    <span className="code">{row.code}</span> <span className="now">{nowText(row, t)}</span>
                    <span className="sr-only">, {t(`tree.${mark}` as TKey)}</span>
                    <span className={`dot ${DOT[mark]}`} aria-hidden="true" title={t(`tree.${mark}` as TKey)} />
                  </button>
                </li>,
                // The episode in view's cut, its own object with its own home (IA §16), as its child row.
                row.code === episode && row.stages.cut.state !== "none" && (
                  <li key={`${row.id}-cut`} className="treecut">
                    <button type="button" aria-current={page === "cut" ? "true" : "false"} onClick={() => void navigate({ to: "/d/$dramaId/e/$episodeCode/cut", params: { dramaId, episodeCode: row.code } })}>
                      <span className="code">› {t("step.cut")}</span> <span className="now">{t(`status.${CUT[row.stages.cut.state]}` as TKey)}</span>
                      <span className={`dot ${DOT_OF[CUT[row.stages.cut.state]]}`} aria-hidden="true" />
                    </button>
                  </li>
                ),
              ];
            })}
            {folded.length > 0 && (
              <li style={{ padding: "6px 8px", color: "var(--text-muted)", fontSize: 11.5 }}>
                {t("tree.folded", { first: folded[0].code, last: folded[folded.length - 1].code, n: folded.length })}
              </li>
            )}
          </ul>
        )}
        {/* What the dots mean, once, at the tree's foot (yurun's Y10; Nielsen: recognition rather than recall). */}
        {drama.episodeRows.length > 0 && (
          <p className="treelegend" aria-hidden="true">
            {(["you", "work", "done"] as const).map((mark) => (
              <span key={mark}>
                <i className={`dot ${DOT[mark]}`} />
                {t(`tree.legend.${mark}`)}
              </span>
            ))}
          </p>
        )}
        <Link to="/d/$dramaId/delivery" params={params} className="navi" aria-current={at(page === "delivery")}>
          <Icon name="scissors" className="ic" />
          {t("step.delivery")}
          {needs(tree.needs.delivery)}
        </Link>
        <hr className="sidehr" />
        <Link to="/reviews" search={{ drama: dramaId }} className="navi" aria-current={at(page === "reviews")}>
          <Icon name="list-checks" className="ic" />
          {t("nav.reviews")}
          {needs(tree.reviews)}
        </Link>
        <Link to="/d/$dramaId/out-of-date" params={params} className="navi" aria-current={at(page === "outOfDate")}>
          <Icon name="warning" className="ic" />
          {t("tree.outOfDate")}
          <span className="n">{tree.outOfDate}</span>
        </Link>
      </nav>
      <Standing drama={drama} sessions={project.data?.sessions ?? []} />
    </aside>
  );
}

const DOT: Record<EpisodeMark, string> = { you: "you", work: "work", done: "accepted", line: "line" };
// A cut's stage as the maker's state (principle "Five maker-facing states"), and its dot.
const CUT = { review: "you", working: "work", done: "accepted" } as const;
const DOT_OF = { you: "you", work: "work", accepted: "accepted" } as const;
