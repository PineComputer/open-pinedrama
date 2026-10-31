// A component under test inside the studio's router at a URL, as a page renders in the app: the real route tree
// (routes.tsx) on a memory history, loaded, so its links resolve and it reads the place's params and search; the
// router is returned so a test can read where a click went.
import { createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { studioRouter } from "../routes.tsx";

export async function renderAt(ui: ReactElement, path = "/") {
  const router = studioRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  const view = render(ui, { wrapper: ({ children }: { children: ReactNode }) => <RouterContextProvider router={router}>{children}</RouterContextProvider> });
  return { router, ...view };
}

/** Where the router stands: its path and search, as the address bar shows them. */
export function href(router: { state: { location: { href: string } } }): string {
  return router.state.location.href;
}
