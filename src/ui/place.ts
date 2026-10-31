// The current object (IA §10, "one current-object contract"; Codex's IA review 7.2): the drama, the episode in view,
// the item picked (a drama-cli stage id, shared/lineage.ts) and how it shows. The routes (routes.tsx) carry it as
// typed params and search; one reader (usePlace) and one builder (placeLink), so an item is never taken for an
// episode, and a link lands on the item's one home (IA §16).
import { linkOptions, useMatches } from "@tanstack/react-router";
import { stageOf } from "../shared/lineage.ts";

/** What a route shows, as its staticData names it: App's crumbs, the sidebar's step and the agent's room follow it. */
export type Page =
  | "home"
  | "new"
  | "settings"
  | "reviews"
  | "review"
  | "gallery"
  | "episodes"
  | "script"
  | "analyzing"
  | "story"
  | "characters"
  | "locations"
  | "props"
  | "delivery"
  | "outOfDate"
  | "crew"
  | "canvasPick"
  | "list"
  | "canvas"
  | "cut";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    page?: Page;
  }
}

/** An episode-scoped List or Canvas, or Lineage: a view of the item's relations on its home (IA §16, rule 3). */
export type Surface = "list" | "canvas" | "lineage";

export interface Place {
  dramaId: string;
  surface: Surface;
  episode?: string;
  item?: string;
  /** Which of the item's versions (vN or tNN); none for its working version. A link keeps it, so it lands on that version. */
  version?: string;
}

// The asset shelves by drama-cli's folder under assets/ (drama_cli/lineage.py, KINDS): the URL says Locations where
// drama-cli says scenes, as IA §10 names them.
const SHELF = { characters: "characters", locations: "scenes", props: "props" } as const;
type Shelf = keyof typeof SHELF;

/** The page that shows a route's whole object: the page whose path already names the item. */
function named(page: Page | undefined, params: { assetId?: string }): string | undefined {
  if (page === "script") return "screenplay";
  if (page === "story") return "bible";
  if ((page === "characters" || page === "locations" || page === "props") && params.assetId) return `assets/${SHELF[page]}/${params.assetId}`;
  return undefined;
}

/** The route in view: its page, and the params and search its URL gives, read from the innermost match wherever the reader renders. */
export function useRoute(): {
  page: Page | undefined;
  params: { dramaId?: string; episodeCode?: string; assetId?: string; reviewId?: string };
  search: { item?: string; version?: string; view?: string; key?: string; drama?: string };
} {
  const leaf = useMatches({ select: (matches) => matches[matches.length - 1] });
  return { page: leaf?.staticData.page, params: leaf?.params ?? {}, search: leaf?.search ?? {} };
}

/** The page the route in view shows. */
export function usePage(): Page | undefined {
  return useRoute().page;
}

/** The current object on a drama's page; null elsewhere. */
export function usePlace(): Place | null {
  const { page, params, search } = useRoute();
  if (!params.dramaId) return null;
  const surface: Surface = search.view === "lineage" || page === "outOfDate" ? "lineage" : page === "canvas" || page === "canvasPick" ? "canvas" : "list";
  return { dramaId: params.dramaId, surface, episode: params.episodeCode, item: search.item ?? named(page, params), version: search.version };
}

/** The item's one home (IA §16), with it picked there; Lineage is that home's view. */
export function homeLink(dramaId: string, item: string, surface: "list" | "lineage" = "list", version?: string) {
  const stage = stageOf(item);
  if (!stage) throw new Error(`${item} is no stage folder of drama-cli's`);
  const view = surface === "lineage" ? "lineage" : undefined;
  const { where } = stage;
  switch (stage.kind) {
    case "screenplay":
      return linkOptions({ to: "/d/$dramaId/script", params: { dramaId }, search: { item: version && item, version, view } });
    case "bible":
      return linkOptions({ to: "/d/$dramaId/story", params: { dramaId }, search: { item: version && item, version, view } });
    case "look":
    case "plate":
    case "prop": {
      const shelf: Shelf = stage.kind === "look" ? "characters" : stage.kind === "plate" ? "locations" : "props";
      const assetId = where.subject!;
      const search = { item: item === `assets/${SHELF[shelf]}/${assetId}` && !version ? undefined : item, version, view };
      if (shelf === "characters") return linkOptions({ to: "/d/$dramaId/assets/characters/{-$assetId}", params: { dramaId, assetId }, search });
      if (shelf === "locations") return linkOptions({ to: "/d/$dramaId/assets/locations/{-$assetId}", params: { dramaId, assetId }, search });
      return linkOptions({ to: "/d/$dramaId/assets/props/{-$assetId}", params: { dramaId, assetId }, search });
    }
    case "cut":
      return linkOptions({ to: "/d/$dramaId/e/$episodeCode/cut", params: { dramaId, episodeCode: where.episode! }, search: { item, version, view } });
    default:
      return linkOptions({ to: "/d/$dramaId/e/$episodeCode/list", params: { dramaId, episodeCode: where.episode! }, search: { item, version, view } });
  }
}

/** Where a place shows: Canvas in its episode (the drama's Canvas picks one), else the item's home, the episode, or the drama's. */
export function placeLink({ dramaId, surface, episode, item, version }: Place) {
  if (surface === "canvas")
    return episode
      ? linkOptions({ to: "/d/$dramaId/e/$episodeCode/canvas", params: { dramaId, episodeCode: episode }, search: { item, version } })
      : linkOptions({ to: "/d/$dramaId/canvas", params: { dramaId }, search: { item, version } });
  if (item) return homeLink(dramaId, item, surface, version);
  if (episode) return linkOptions({ to: "/d/$dramaId/e/$episodeCode/list", params: { dramaId, episodeCode: episode }, search: { view: surface === "lineage" ? "lineage" : undefined } });
  return surface === "lineage" ? linkOptions({ to: "/d/$dramaId/out-of-date", params: { dramaId } }) : linkOptions({ to: "/d/$dramaId/episodes", params: { dramaId } });
}
