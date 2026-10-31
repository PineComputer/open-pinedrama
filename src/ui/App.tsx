import { Link, linkOptions, type NotFoundRouteProps, Outlet, useLocation } from "@tanstack/react-router";
import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { stageOf, type LineageView } from "../shared/lineage.ts";
import type { ProjectView } from "../shared/project.ts";
import type { AppInfo, DramaView, ReviewSummary, ReviewView } from "../shared/types.ts";
import { ApiError, useResource } from "./api.ts";
import { type TKey, useT } from "./i18n.ts";
import { errorText, lineageUnreadable, subjectLabel, useNames } from "./labels.ts";
import { useReviewNotifications } from "./notify.ts";
import { type Page, usePlace, useRoute } from "./place.ts";
import { EmptyState } from "./components/EmptyState.tsx";
import { Missing } from "./components/Missing.tsx";
import { Graph } from "./graph/Graph.tsx";
import { Drama } from "./screens/Drama.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Welcome } from "./screens/Welcome.tsx";
import { AgentBall, type AgentMode, AgentPanel, useAgentMode } from "./shell/AgentPanel.tsx";
import { NavRail } from "./shell/NavRail.tsx";
import { DramaSidebar } from "./shell/Sidebar.tsx";
import { type Crumb, StopControl, TopBar } from "./shell/TopBar.tsx";
import { ExportMenu } from "./shell/ExportMenu.tsx";
import { AsideSlot } from "./shell/aside.ts";
import { buttonClass } from "./components/Button.tsx";
import { DramaThumb } from "./components/DramaThumb.tsx";

/** Before the studio can be used: this window isn't the studio's, or the engine isn't answering. */
function Gate({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useT();
  const signedOut = error instanceof ApiError && error.code === "signed-out";
  return (
    <main className="page gate">
      <h1>{t(signedOut ? "gate.signedOutTitle" : "gate.offlineTitle")}</h1>
      <p className="empty-note">{t(signedOut ? "gate.signedOut" : "gate.offline")}</p>
      {!signedOut && (
        <button className={buttonClass()} onClick={onRetry}>
          {t("gate.retry")}
        </button>
      )}
    </main>
  );
}

// An asset shelf's own page, with no asset picked: the crumb above a picked asset.
function shelfOf(page: "characters" | "locations" | "props", dramaId: string) {
  if (page === "characters") return linkOptions({ to: "/d/$dramaId/assets/characters/{-$assetId}", params: { dramaId, assetId: undefined } });
  if (page === "locations") return linkOptions({ to: "/d/$dramaId/assets/locations/{-$assetId}", params: { dramaId, assetId: undefined } });
  return linkOptions({ to: "/d/$dramaId/assets/props/{-$assetId}", params: { dramaId, assetId: undefined } });
}

// The label each drama page's crumb shows.
const LABEL: Partial<Record<Page, TKey>> = {
  script: "step.script",
  bible: "step.bible",
  characters: "cast.characters",
  locations: "cast.locations",
  props: "cast.props",
  delivery: "step.delivery",
  canvasPick: "surface.canvas",
  outOfDate: "tree.outOfDate",
  crew: "section.crew",
  episodes: "step.episodes",
};

/** The agent for the drama in view (D32 as amended): its sidebar, open beside the page, or collapsed to the ball. */
function Agent({ drama, episode, mode, onMode }: { drama: DramaView; episode?: string; mode: AgentMode; onMode: (mode: AgentMode) => void }) {
  if (mode === "open") return <AgentPanel drama={drama} episode={episode} onCollapse={() => onMode("closed")} />;
  const busy = drama.crew.some((computer) => computer.sessions.some((session) => session.state === "open" && !session.waiting));
  return <AgentBall waiting={drama.waiting} busy={busy} onOpen={() => onMode("open")} />;
}

/** A path the studio has no page for, with the way back to the dramas. */
export function NotFound() {
  const { t } = useT();
  const path = useLocation({ select: (location) => location.pathname });
  return (
    <EmptyState title={t("notFound.title")} action={<Link className="btn primary" to="/">{t("notFound.home")}</Link>}>
      {t("notFound.text", { path })}
    </EmptyState>
  );
}


/** A drama route's Not found: what the URL names that the drama can't have, else the path. */
export function MissingObject({ data }: NotFoundRouteProps) {
  const dramaId = useRoute().params.dramaId;
  const what = (data as { what?: string } | undefined)?.what;
  return dramaId && what !== undefined ? <Missing dramaId={dramaId} what={what} /> : <NotFound />;
}

/** What the frame loaded that the pages in it use: the studio's mode, and the drama in view as it lives. */
interface Shell {
  app: AppInfo;
  reloadApp: () => void;
  drama: { data: DramaView | undefined; error: unknown };
}

const ShellContext = createContext<Shell | null>(null);

function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("A studio page renders inside App.");
  return shell;
}

/** The drama a drama page shows; DramaPage renders its pages only once it has loaded. */
export function useDrama(): DramaView {
  const drama = useShell().drama.data;
  if (!drama) throw new Error("A drama page renders inside DramaPage.");
  return drama;
}

export function SettingsPage() {
  const { app, reloadApp } = useShell();
  return <Settings app={app} onChange={reloadApp} />;
}

/** The component gallery: in development and the end-to-end build only (screens/Gallery.tsx). */
export const Gallery = import.meta.env.DEV || import.meta.env.VITE_GALLERY === "1" ? lazy(() => import("./screens/Gallery.tsx")) : null;

export function GalleryPage() {
  return Gallery && (
    <Suspense>
      <Gallery />
    </Suspense>
  );
}

/**
 * A drama's page: the drama loaded, the episode and item the URL names checked against it (an episode against its
 * episodes, an item or asset against its lineage), then the page, or Lineage when the item is shown as its relations.
 */
export function DramaPage() {
  const { t } = useT();
  const { drama } = useShell();
  const { page, params, search } = useRoute();
  const place = usePlace()!;
  const { assetId } = params;
  const shelf = page === "characters" ? "look" : page === "locations" ? "plate" : page === "props" ? "prop" : undefined;
  // What the URL names is checked against drama-cli's lineage, except on Script, which checks its own item against the
  // screenplay versions recorded: a version waits for the maker before the lineage has a screenplay node.
  // The Canvas checks its own item against its own board too: its shots nodes are its own (D66), no lineage node.
  const asked = page === "script" || page === "canvas" || page === "canvasPick" ? undefined : search.item;
  // Loaded on every page of the project, not only once a link names an item: a pick on Canvas writes ?item, and a lineage
  // first fetched then would put Loading in the page's place and remount it, losing the board's view.
  const lineage = useResource<LineageView>(`/api/dramas/${place.dramaId}/lineage`, [`project:${place.dramaId}`]);
  if (!drama.data)
    return (
      <div className="page">
        <p className={drama.error !== undefined ? "error" : "quiet"}>{drama.error !== undefined ? errorText(drama.error, t) : t("loading")}</p>
      </div>
    );
  if (place.episode && !drama.data.episodeRows.some((row) => row.code === place.episode)) return <Missing dramaId={place.dramaId} what={place.episode} />;
  // A lineage drama-cli returned but the studio couldn't read says so, and the page opens from what it has (an asset
  // page from its pictures), unchecked: never "This project has no …" for what may well be there (Codex rc3, C12).
  const unreadable = lineage.data && lineageUnreadable(lineage.data, t);
  if ((asked !== undefined || assetId !== undefined) && !unreadable) {
    if (lineage.error !== undefined) return <p className="error">{errorText(lineage.error, t)}</p>;
    if (!lineage.data) return <p className="quiet">{t("loading")}</p>;
    const nodes = lineage.data.lineage?.nodes ?? [];
    if (asked !== undefined && !nodes.some((node) => node.id === asked)) return <Missing dramaId={place.dramaId} what={asked} />;
    if (assetId !== undefined && !nodes.some((node) => node.kind === shelf && node.where.subject === assetId)) return <Missing dramaId={place.dramaId} what={assetId} />;
  }
  return (
    <Drama drama={drama.data} page={page}>
      {unreadable && (asked !== undefined || assetId !== undefined) && (
        <p className="notice" role="status">
          {unreadable}
        </p>
      )}
      {place.surface === "lineage" && page !== "outOfDate" ? <Graph dramaId={drama.data.id} /> : <Outlet />}
    </Drama>
  );
}

export function App() {
  const { page, params, search } = useRoute();
  const [asideSlot, setAsideSlot] = useState<HTMLElement | null>(null);
  const app = useResource<AppInfo>("/api/app", ["app"]);
  const ready = app.data !== undefined && app.data.mode !== "none";
  const queue = useResource<ReviewSummary[]>(ready ? "/api/reviews" : null, ["reviews"]);
  const waiting = (queue.data ?? []).filter((item) => item.state === "open");
  const reviewed = params.reviewId ? queue.data?.find((item) => item.id === params.reviewId) : undefined;
  // The drama in view: its page's, or the one the review in view belongs to.
  const dramaId = params.dramaId ?? reviewed?.dramaId;
  const drama = useResource<DramaView>(dramaId && ready ? `/api/dramas/${dramaId}` : null, [`drama:${dramaId}`]);
  const place = usePlace();
  const filteredBy = useRoute().search.drama;
  // The stage picked in an episode and its version, as drama-cli's status gives it, for the crumbs: "seg03 · Take t02".
  const stage = place?.item && place.episode ? stageOf(place.item) : undefined;
  const status = useResource<ProjectView>((stage || params.assetId) && dramaId ? `/api/dramas/${dramaId}/project` : null, [`project:${dramaId}`]);
  // D26: an asset's detail ends the crumbs at the asset and its working version, as drama-cli's status names it.
  const names = useNames(params.assetId ? dramaId : undefined);
  const assetState = params.assetId && status.data?.state ? { characters: status.data.state.characters, locations: status.data.state.locations, props: status.data.state.props }[page === "characters" || page === "locations" || page === "props" ? page : "props"][params.assetId] : undefined;
  const assetKind = page === "characters" ? "look" : page === "locations" ? "location" : "prop";
  // The version in view, where the URL names one (the detail writes it, D48), else drama-cli's working version.
  const assetCrumb = params.assetId ? { label: [subjectLabel(names, params.assetId, assetKind), place?.version ?? assetState?.current].filter(Boolean).join(" · ") } : undefined;
  const stageState = stage?.where.segment && place?.episode ? status.data?.state?.episodes[place.episode] : undefined;
  const version = place?.version ?? (stage && stage.where.segment ? (stage.kind === "take" ? stageState?.segments[stage.where.segment]?.current : stage.kind === "storyboard" && stage.where.style ? stageState?.storyboards[stage.where.segment]?.[stage.where.style]?.current : undefined) : undefined);
  // The cut in view on an episode's Cut: the one its open review shows (CutTab), with its version for the crumbs.
  const cutReview = page === "cut" && place?.episode ? waiting.find((item) => item.kind === "cut" && item.dramaId === dramaId && item.episode === place.episode) : undefined;
  const cutInView = useResource<ReviewView>(cutReview ? `/api/reviews/${cutReview.id}` : null, ["reviews"]);
  const cutVersion = cutInView.data?.reviewItems[0]?.files.find((file) => file.kind === "cut")?.version;
  // IA draft r2 (F): below 1100 px the sidebar is a drawer over the work, opened from the rail and closed by any move.
  const narrow = useMediaQuery("(max-width: 1100px)");
  const [drawer, setDrawer] = useState(false);
  const pathname = useLocation({ select: (location) => location.pathname });
  useEffect(() => setDrawer(false), [pathname]);
  const agentShown = Boolean(drama.data && dramaId);
  const [agentMode, setAgentMode] = useAgentMode(agentShown);
  const { t } = useT();
  useReviewNotifications(queue.data && waiting);

  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) ${t("app.name")}` : t("app.name");
  }, [waiting.length, t]);

  if (page === "gallery") return <Outlet />;
  if (!app.data) return app.error !== undefined ? <Gate error={app.error} onRetry={app.reload} /> : null;
  if (app.data.mode === "none") return <Welcome onReady={app.reload} />;

  // Round 3 (design/ 2f2a07b): the crumbs say where the page's object belongs, each ancestor a link to its home; where
  // you came from is only "Back to …". The drama comes first, its cover and name, so it is clear which one is open.
  const inDrama: Crumb | undefined = drama.data && {
    label: (
      <>
        <DramaThumb drama={drama.data} className="crumbimg" />
        <span className="ctext" title={drama.data.title}>
          {drama.data.title}
        </span>
      </>
    ),
    to: linkOptions({ to: "/d/$dramaId/episodes", params: { dramaId: drama.data.id } }),
  };
  const picked = stage?.where.segment ? [stage.where.segment, [t(`graph.kind.${stage.kind}` as TKey), version].filter(Boolean).join(" ")].join(" · ") : undefined;
  const ofDrama = (...rest: Crumb[]): Crumb[] => [...(inDrama ? [inDrama] : []), ...rest];
  const episodeCrumb = (code: string, dramaOf: string): Crumb => ({ label: code, to: linkOptions({ to: "/d/$dramaId/e/$episodeCode/canvas", params: { dramaId: dramaOf, episodeCode: code } }) });
  // The episode in view, wherever it shows (its List, Canvas or Cut, a review of it): the sidebar marks it and the agent follows it (B3).
  const followed = place?.episode ?? reviewed?.episode;
  let crumbs: Crumb[];
  if (page === "home" || page === "new") crumbs = [{ label: t("new.title") }];
  // One drama's Reviews is a filter of the one queue: the crumbs name it under Reviews (design/app.js, Reviews).
  else if (page === "reviews")
    crumbs = filteredBy ? [{ label: t("reviews.title"), to: linkOptions({ to: "/reviews" }) }, { label: queue.data?.find((item) => item.dramaId === filteredBy)?.dramaTitle ?? filteredBy }] : [{ label: t("reviews.title") }];
  else if (page === "settings") crumbs = [{ label: t("settings.title") }];
  else if (page === "review") crumbs = ofDrama(...(reviewed?.episode ? [episodeCrumb(reviewed.episode, reviewed.dramaId)] : []), { label: reviewed ? t(`kind.${reviewed.kind}`) : t("reviews.title") });
  else if (!page) crumbs = [{ label: t("notFound.title") }];
  // In an episode: the episode, then what is picked in it (its stage and version), or its Cut.
  else if (place?.episode && drama.data) {
    const episode = episodeCrumb(place.episode, drama.data.id);
    if (page === "cut") crumbs = ofDrama(episode, { label: [t("step.cut"), cutVersion].filter(Boolean).join(" ") });
    else crumbs = picked ? ofDrama(episode, { label: picked }) : ofDrama({ label: place.episode });
  }
  // An Assets shelf sits under Assets, as the drama tree has it (IA §2): Drama › Assets › Characters.
  else if (drama.data && (page === "characters" || page === "locations" || page === "props"))
    crumbs = ofDrama(
      { label: t("step.assets"), to: linkOptions({ to: "/d/$dramaId/assets/characters/{-$assetId}", params: { dramaId: drama.data.id, assetId: undefined } }) },
      assetCrumb ? { label: t(LABEL[page] ?? "step.assets"), to: shelfOf(page, drama.data.id) } : { label: t(LABEL[page] ?? "step.assets") },
      ...(assetCrumb ? [assetCrumb] : []),
    );
  else crumbs = ofDrama({ label: t(LABEL[page] ?? "step.episodes") });

  // Inside a project: the icon rail beside its tree. Off a project the rail itself is the studio's one column (NavRail).
  // Below 1100 px either column is a drawer that ☰ opens.
  const inProject = Boolean(drama.data && dramaId);
  const sidebar = drama.data && dramaId ? <DramaSidebar drama={drama.data} page={page} episode={followed} drawer={narrow} /> : null;
  return (
    // The design's frame (design/app.js, App): the rail, the sidebar, the main column (its top bar over the work), then
    // the agent's sidebar the window's full height, or its ball.
    <div className="app">
      <NavRail page={page} waiting={waiting.length} replay={app.data.mode === "replay"} drawerToggle={inProject && narrow} drawer={drawer} onToggleDrawer={() => setDrawer(!drawer)} />
      {/* On a wide window the column is always shown; ☰ opens it as a drawer on a narrow one (merecdesperez44323-lab; Apple HIG sidebars). */}
      {(narrow ? drawer : true) && sidebar}
      <div className="main">
        {/* design/'s Home has no top bar: the page starts at the greeting; its Upload's has no Next review. Reviews acts on
            no one drama, so it has none either (IA draft A1); inside a drama, Next review is that drama's. */}
        {page !== "home" && (
          <TopBar crumbs={crumbs} waiting={dramaId ? waiting.filter((item) => item.dramaId === dramaId) : waiting} ready={ready} next={page !== "new" && page !== "reviews"}>
            {drama.data && <ExportMenu drama={drama.data} />}
            {drama.data && <StopControl drama={drama.data} />}
          </TopBar>
        )}
        <div className="body" style={{ position: "relative" }}>
          <ShellContext.Provider value={{ app: app.data, reloadApp: app.reload, drama }}>
            <AsideSlot.Provider value={asideSlot}>
              <main className="scrollmain ds-scroll">
                <Outlet />
              </main>
            </AsideSlot.Provider>
          </ShellContext.Provider>
          <div ref={setAsideSlot} style={{ display: "contents" }} />
        </div>
      </div>
      {agentShown && drama.data && <Agent drama={drama.data} episode={followed} mode={agentMode} onMode={setAgentMode} />}
    </div>
  );
}
