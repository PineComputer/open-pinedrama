// The sidebar beside the rail, ported from the design (design/app.js, Side)
// with its markup and classes: on the studio's pages its places; in a drama the drama's tree, Script · Bible · Assets ·
// Episodes · Delivery · Reviews · Out of date, each row saying where it stands, the episode tree under Episodes, during
// the setup as after it; and at the foot what it has spent.
import { Link, useNavigate } from "@tanstack/react-router";
import type { LineageView } from "../../shared/lineage.ts";
import type { ProjectView, SessionReport } from "../../shared/project.ts";
import type { CastCard, DramaCard, DramaView, EpisodeRow, ReviewSummary, ScriptPage } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { Menu } from "../components/Menu.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { isSettingUp, moneyText, nowText, SETUP_STEPS } from "../labels.ts";
import { Mark } from "../Mark.tsx";
import type { Page } from "../place.ts";
import { DramaThumb } from "../components/DramaThumb.tsx";
import { dramaTree, type Mark as EpisodeMark, markOf, scriptNow } from "./tree.ts";

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

/** A drama's sidebar, as the design's (design/app.js, Side): the one project tree, during the setup too (D62). */
/** drawer: the sidebar opens over the work, below 1100 px (IA draft r2, F). */
export function DramaSidebar({ drama, page, episode, drawer }: { drama: DramaView; page: Page | undefined; episode?: string; drawer: boolean }) {
  const { t } = useT();
  const navigate = useNavigate();
  const others = useResource<DramaCard[]>("/api/dramas", ["dramas"]);
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  // The tree's counts, each from the resource its place shows (tree.ts).
  const reviews = useResource<ReviewSummary[]>(`/api/reviews?drama=${drama.id}`, ["reviews"]);
  const cast = useResource<CastCard[]>(`/api/dramas/${drama.id}/cast`, [`drama:${drama.id}`]);
  const lineage = useResource<LineageView>(`/api/dramas/${drama.id}/lineage`, [`project:${drama.id}`]);
  const tree = dramaTree({ cast: cast.data ?? [], reviews: reviews.data ?? [], lineage: lineage.data?.lineage ?? null, rows: drama.episodeRows });
  // The script is done once the maker has answered the setup's first question about it.
  const scriptDone = drama.setup.reached > 1 || drama.episodeRows.length > 0;
  const script = useResource<ScriptPage>(`/api/dramas/${drama.id}/script`, [`drama:${drama.id}`]);
  const scriptRow = script.data && scriptNow(script.data.versions, isSettingUp(drama) && drama.setup.state === "working" && drama.setup.reached <= 1, scriptDone);
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
  // A place the setup hasn't reached yet, said as a row's now-line with the waiting-in-line dot, never as a numbered step (D62).
  const notStarted = (
    <>
      <span className="now">{t("tree.notStarted")}</span>
      <span className={`dot ${DOT.line}`} aria-hidden="true" />
    </>
  );
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
        <Link to="/d/$dramaId/script" params={params} className="navi" aria-current={at(page === "script")}>
          <Icon name="file-text" className="ic" />
          {t("step.script")}
          {scriptRow && (
            <>
              <span className="now">{t(`tree.script.${scriptRow.now}`)}</span>
              <span className={`dot ${DOT[scriptRow.mark]}`} aria-hidden="true" />
            </>
          )}
        </Link>
        <Link to="/d/$dramaId/bible" params={params} className="navi" aria-current={at(page === "bible")}>
          <Icon name="book-open" className="ic" />
          {t("step.bible")}
          {settingUp && drama.setup.reached < 2 && notStarted}
        </Link>
        <Link to="/d/$dramaId/assets/characters/{-$assetId}" params={{ dramaId, assetId: undefined }} className="navi" aria-current={at(onShelf)}>
          <Icon name="stack" className="ic" />
          {t("step.assets")}
          {needs(tree.needs.assets) || (!(cast.data ?? []).length && notStarted)}
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
          {needs(tree.episodes) || (!drama.episodeRows.length && notStarted)}
        </Link>
        {drama.episodeRows.length > 0 && (
          <ul className="tree" aria-label={t("tree.label")}>
            {shownRows.map((row) => {
              const mark = markOf(row);
              return [
                <li key={row.id}>
                  {/* The name is what the button shows, then where it stands, said rather than shown (WCAG 2.5.3). */}
                  <button type="button" aria-current={row.code === episode ? "true" : "false"} onClick={() => void navigate({ to: "/d/$dramaId/e/$episodeCode/canvas", params: { dramaId, episodeCode: row.code } })}>
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
        {/* What the dots mean, once, at the tree's foot (merecdesperez44323-lab's Y10; Nielsen: recognition rather than recall). */}
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
