// The browser a component test runs in: jsdom, plus the few things the studio uses that
// jsdom lacks, and the engine answered by MSW (server.ts). Nothing reaches the network.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { TestEventSource } from "./live.ts";
import { sent, server } from "./server.ts";

// The review stage measures itself to fit a picture (viewing.tsx); jsdom has no layout.
class StillResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// The theme follows the system on the maker's choice (theme/theme.ts); jsdom has no media queries, so the system says light.
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });

// The UI calls the engine by path, as a page does; Node's fetch needs a whole URL.
const nodeFetch = globalThis.fetch;
const pageFetch: typeof fetch = (input, init) => nodeFetch(typeof input === "string" ? new URL(input, location.href) : input, init);

Object.assign(globalThis, { EventSource: TestEventSource, ResizeObserver: StillResizeObserver, fetch: pageFetch, matchMedia });

// The cut viewer's player, media-chrome, listens on a video's track lists (TextTrackList,
// AudioTrackList, VideoTrackList), which are EventTargets in browsers (HTML, "Media resources with
// multiple media tracks"); jsdom's are plain lists. Each video gets empty ones that take listeners and iterate.
for (const name of ["textTracks", "audioTracks", "videoTracks"]) {
  const lists = new WeakMap<HTMLMediaElement, EventTarget>();
  Object.defineProperty(HTMLMediaElement.prototype, name, {
    configurable: true,
    get(this: HTMLMediaElement) {
      if (!lists.has(this)) lists.set(this, Object.assign(new EventTarget(), { length: 0, *[Symbol.iterator]() {} }));
      return lists.get(this);
    },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sent.length = 0;
  localStorage.clear();
});
afterAll(() => server.close());
