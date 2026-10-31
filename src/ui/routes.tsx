// The studio's routes (IA §10, §14.1, §16): every object has one home, one URL, with typed params and search, built
// with TanStack Router's code-based route tree (tanstack.com/router, "Code-Based Routing"). An episode code and an item
// are distinct, checked types: the code is drama-cli's EPnnn, the item a drama-cli stage id (shared/lineage.ts);
// whether the drama has them is checked when the drama's page loads (DramaPage, App.tsx).
import { createRootRoute, createRoute, createRouter, notFound, redirect, type RouterHistory } from "@tanstack/react-router";
import { stageOf } from "../shared/lineage.ts";
import { App, DramaPage, Gallery, GalleryPage, MissingObject, NotFound, SettingsPage, useDrama } from "./App.tsx";
import { isSettingUp } from "./labels.ts";
import { Analyzing } from "./screens/Analyzing.tsx";
import { Board, SetupPanel } from "./screens/Board.tsx";
import { Canvas } from "./screens/Canvas.tsx";
import { Bible } from "./screens/Bible.tsx";
import { Cast } from "./screens/Cast.tsx";
import { Crew } from "./screens/Crew.tsx";
import { CutTab } from "./screens/CutTab.tsx";
import { Delivery } from "./screens/Delivery.tsx";
import { ReviewsScreen } from "./screens/Reviews.tsx";
import { NewDrama } from "./screens/NewDrama.tsx";
import { OutOfDate } from "./screens/OutOfDate.tsx";
import { Review } from "./screens/Review.tsx";
import { Script } from "./screens/Script.tsx";
import { Slate } from "./screens/Slate.tsx";

const text = (value: unknown) => (value === undefined ? undefined : String(value));

const rootRoute = createRootRoute({ component: App, notFoundComponent: NotFound });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", staticData: { page: "home" }, component: Slate });
const newRoute = createRoute({ getParentRoute: () => rootRoute, path: "/new", staticData: { page: "new" }, component: NewDrama });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", staticData: { page: "settings" }, component: SettingsPage });
// Reviews is one queue; a drama's Reviews is a filter of it (IA §16).
const reviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reviews",
  staticData: { page: "reviews" },
  validateSearch: (search: Record<string, unknown>): { drama?: string } => ({ drama: text(search.drama) }),
  component: function ReviewsPage() {
    return <ReviewsScreen dramaId={reviewsRoute.useSearch().drama} />;
  },
});
// A link may open a review at one of its items, by the item's key (ReviewItem.key).
const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/r/$reviewId",
  staticData: { page: "review" },
  validateSearch: (search: Record<string, unknown>): { key?: string } => ({ key: text(search.key) }),
  component: function ReviewPage() {
    const { reviewId } = reviewRoute.useParams();
    return <Review key={reviewId} id={reviewId} />;
  },
});
// The component gallery: in development and the end-to-end build only.
const galleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/gallery",
  staticData: { page: "gallery" },
  beforeLoad: () => {
    if (!Gallery) throw notFound();
  },
  component: GalleryPage,
});

// A drama's page: what is picked on it (a drama-cli stage id), which of its versions (none: the working one), and
// whether it shows as Lineage. A version is the lineage's own (shared/lineage.ts LineageNode.version, "vN or tNN").
const dramaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/d/$dramaId",
  validateSearch: (search: Record<string, unknown>): { item?: string; version?: string; view?: string } => ({ item: text(search.item), version: text(search.version), view: text(search.view) }),
  beforeLoad: ({ search }) => {
    if (search.item !== undefined && !stageOf(search.item)) throw notFound({ data: { what: search.item } });
    if (search.version !== undefined && (search.item === undefined || !/^(v[0-9]+|t[0-9]{2,})$/.test(search.version))) throw notFound({ data: { what: `version=${search.version}` } });
    if (search.view !== undefined && search.view !== "lineage") throw notFound({ data: { what: `view=${search.view}` } });
  },
  notFoundComponent: MissingObject,
  component: DramaPage,
});
const dramaIndexRoute = createRoute({
  getParentRoute: () => dramaRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/d/$dramaId/episodes", params, replace: true });
  },
});
const leaf = <Path extends string>(path: Path) => ({ getParentRoute: () => dramaRoute, path });

const episodesRoute = createRoute({
  ...leaf("episodes"),
  staticData: { page: "episodes" },
  component: function EpisodesPage() {
    const drama = useDrama();
    return isSettingUp(drama) ? <SetupPanel drama={drama} /> : <Board drama={drama} />;
  },
});
// Script at an episode (?ep=EPxxx, drama-cli's code): the Canvas's "Episode script" opens it there (D66, design/app.js EpisodeHead).
const scriptRoute = createRoute({
  ...leaf("script"),
  staticData: { page: "script" },
  validateSearch: (search: Record<string, unknown>): { ep?: string } => ({ ep: text(search.ep) }),
  beforeLoad: ({ search }) => {
    if (search.ep !== undefined && !/^EP[0-9]{3}$/.test(search.ep)) throw notFound({ data: { what: `ep=${search.ep}` } });
  },
  component: () => <Script dramaId={useDrama().id} />,
});
// Analyzing and the Fountain review are setup steps, a process like the review room, not views of Script's (D21).
const analyzingRoute = createRoute({ ...leaf("analyzing"), staticData: { page: "analyzing" }, component: () => <Analyzing dramaId={useDrama().id} /> });
const bibleRoute = createRoute({
  ...leaf("bible"),
  staticData: { page: "bible" },
  component: function BiblePage() {
    const drama = useDrama();
    return isSettingUp(drama) ? <SetupPanel drama={drama} /> : <Bible dramaId={drama.id} />;
  },
});
const charactersRoute = createRoute({
  ...leaf("assets/characters/{-$assetId}"),
  staticData: { page: "characters" },
  component: () => <Cast dramaId={useDrama().id} />,
});
const locationsRoute = createRoute({
  ...leaf("assets/locations/{-$assetId}"),
  staticData: { page: "locations" },
  component: () => <Cast dramaId={useDrama().id} />,
});
const propsRoute = createRoute({
  ...leaf("assets/props/{-$assetId}"),
  staticData: { page: "props" },
  component: () => <Cast dramaId={useDrama().id} />,
});
const deliveryRoute = createRoute({ ...leaf("delivery"), staticData: { page: "delivery" }, component: () => <Delivery dramaId={useDrama().id} /> });
// Out of date is a drama-wide filter beside Reviews (D21): a row per out-of-date item, each linking to its home.
const outOfDateRoute = createRoute({ ...leaf("out-of-date"), staticData: { page: "outOfDate" }, component: () => <OutOfDate dramaId={useDrama().id} /> });
const crewRoute = createRoute({ ...leaf("crew"), staticData: { page: "crew" }, component: () => <Crew drama={useDrama()} /> });
// The drama's Canvas opens the episode it picks (Canvas.tsx) on that episode's Canvas.
const canvasPickRoute = createRoute({ ...leaf("canvas"), staticData: { page: "canvasPick" }, component: () => <Canvas drama={useDrama()} /> });

// An episode, by drama-cli's code (short_drama drama_cli/schemas/bible.py:197, "^EP[0-9]{3}$"); an item picked in
// it belongs to it, or to no episode (a shared asset) (Codex's rebuttal, IA §14.1).
const episodeRoute = createRoute({
  getParentRoute: () => dramaRoute,
  path: "e/$episodeCode",
  params: {
    parse: ({ episodeCode }) => {
      if (!/^EP[0-9]{3}$/.test(episodeCode)) throw notFound({ data: { what: episodeCode } });
      return { episodeCode };
    },
    stringify: ({ episodeCode }) => ({ episodeCode }),
  },
  beforeLoad: ({ params, search }) => {
    const episode = search.item === undefined ? undefined : stageOf(search.item)?.where.episode;
    if (episode !== undefined && episode !== params.episodeCode) throw notFound({ data: { what: search.item } });
  },
  notFoundComponent: MissingObject,
});
const episodeIndexRoute = createRoute({
  getParentRoute: () => episodeRoute,
  path: "/",
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/d/$dramaId/e/$episodeCode/canvas", params, search, replace: true });
  },
});
const canvasRoute = createRoute({ getParentRoute: () => episodeRoute, path: "canvas", staticData: { page: "canvas" }, component: () => <Canvas drama={useDrama()} /> });
const cutRoute = createRoute({
  getParentRoute: () => episodeRoute,
  path: "cut",
  staticData: { page: "cut" },
  component: function CutPage() {
    const { dramaId, episodeCode } = cutRoute.useParams();
    return <CutTab dramaId={dramaId} episode={episodeCode} />;
  },
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  newRoute,
  settingsRoute,
  reviewsRoute,
  reviewRoute,
  galleryRoute,
  dramaRoute.addChildren([
    dramaIndexRoute,
    episodesRoute,
    scriptRoute,
    analyzingRoute,
    bibleRoute,
    charactersRoute,
    locationsRoute,
    propsRoute,
    deliveryRoute,
    outOfDateRoute,
    crewRoute,
    canvasPickRoute,
    episodeRoute.addChildren([episodeIndexRoute, canvasRoute, cutRoute]),
  ]),
]);

/** The studio's router, on the browser's history unless a test gives its own (test/router.tsx). */
export function studioRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof studioRouter>;
  }
}
