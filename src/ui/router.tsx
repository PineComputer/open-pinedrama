// A small router: the studio has a handful of screens, addressed by path.
import { type AnchorHTMLAttributes, type MouseEvent, useEffect, useState } from "react";

const listeners = new Set<() => void>();

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === location.pathname + location.search) return;
  if (options.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  for (const listener of listeners) listener();
  window.scrollTo(0, 0);
}

export function usePath(): { path: string; query: URLSearchParams } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const update = () => setTick((n) => n + 1);
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return { path: location.pathname, query: new URLSearchParams(location.search) };
}

/** Matches "/d/:id/:tab?" style patterns; returns the named parts or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split("/").filter(Boolean);
  const have = path.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const part = want[i];
    const optional = part.endsWith("?");
    const name = part.replace(/^:|\?$/g, "");
    if (part.startsWith(":")) {
      if (have[i] === undefined) {
        if (optional) continue;
        return null;
      }
      params[name] = decodeURIComponent(have[i]);
    } else if (part !== have[i]) return null;
  }
  return have.length <= want.length ? params : null;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={to}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}

export type Surface = "studio" | "canvas" | "graph";

/**
 * What a drama's page shows (Codex's IA review, 7.2): the drama, the surface, the episode in view and the item picked
 * on it, a lineage stage's id (drama-cli's stage folder, as shared/lineage.ts gives it). One reader and one builder, so
 * an item is never taken for an episode: the episode travels as ?episode=, the item as ?item=.
 */
export interface Place {
  dramaId: string;
  surface: Surface;
  episode?: string;
  item?: string;
}

export function placeOf(path: string, query: URLSearchParams): Place | null {
  const episodePage = match("/d/:id/e/:code", path);
  if (episodePage) return { dramaId: episodePage.id, surface: "studio", episode: episodePage.code };
  const page = match("/d/:id/:tab?", path);
  if (!page) return null;
  if (page.tab === "canvas" || page.tab === "graph") return { dramaId: page.id, surface: page.tab, episode: query.get("episode") ?? undefined, item: query.get("item") ?? undefined };
  return { dramaId: page.id, surface: "studio" };
}

export function placeHref({ dramaId, surface, episode, item }: Place): string {
  const base = `/d/${encodeURIComponent(dramaId)}`;
  // Studio shows an episode on its page; a shared asset (drama-cli's assets/ folders) in Story; else the episodes.
  if (surface === "studio") return episode ? `${base}/e/${encodeURIComponent(episode)}` : item?.startsWith("assets/") ? `${base}/story` : base;
  const query = new URLSearchParams();
  if (episode) query.set("episode", episode);
  if (item) query.set("item", item);
  return `${base}/${surface}${query.size ? `?${query}` : ""}`;
}
