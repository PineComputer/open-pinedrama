// The browser a component test runs in: jsdom, plus the few things the studio uses that
// jsdom lacks, and the engine answered by MSW (server.ts). Nothing reaches the network.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { sent, server } from "./server.ts";

// The live stream (api.ts): a test refreshes data by answering again, not through events.
class QuietEventSource {
  static readonly CLOSED = 2;
  readyState = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close() {
    this.readyState = QuietEventSource.CLOSED;
  }
}

// The review stage measures itself to fit a picture (viewing.tsx); jsdom has no layout.
class StillResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// The UI calls the engine by path, as a page does; Node's fetch needs a whole URL.
const nodeFetch = globalThis.fetch;
const pageFetch: typeof fetch = (input, init) => nodeFetch(typeof input === "string" ? new URL(input, location.href) : input, init);

Object.assign(globalThis, { EventSource: QuietEventSource, ResizeObserver: StillResizeObserver, fetch: pageFetch });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sent.length = 0;
  localStorage.clear();
});
afterAll(() => server.close());
