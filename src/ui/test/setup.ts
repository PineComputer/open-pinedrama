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

// The UI calls the engine by path, as a page does; Node's fetch needs a whole URL.
const nodeFetch = globalThis.fetch;
const pageFetch: typeof fetch = (input, init) => nodeFetch(typeof input === "string" ? new URL(input, location.href) : input, init);

Object.assign(globalThis, { EventSource: TestEventSource, ResizeObserver: StillResizeObserver, fetch: pageFetch });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sent.length = 0;
  localStorage.clear();
});
afterAll(() => server.close());
