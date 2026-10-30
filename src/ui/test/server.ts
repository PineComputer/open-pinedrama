// The engine as a component test sees it: MSW answers /api/... with the shared types, and
// keeps every request a test made, so it can say which calls a click sent and how many.
import { http, HttpResponse, type JsonBodyType } from "msw";
import { setupServer } from "msw/node";

export interface Sent {
  method: string;
  path: string;
  body: unknown;
}

export const sent: Sent[] = [];

export const server = setupServer();

server.events.on("request:start", async ({ request }) => {
  const body = request.method === "GET" ? undefined : await request.clone().json().catch(() => undefined);
  sent.push({ method: request.method, path: new URL(request.url).pathname, body });
});

/** Answers GET path with value, for as long as the test runs. */
export function answer(path: string, value: JsonBodyType): void {
  server.use(http.get(path, () => HttpResponse.json(value)));
}

/** Answers POST path with value (an empty object by default). */
export function accept(path: string, value: JsonBodyType = {}): void {
  server.use(http.post(path, () => HttpResponse.json(value)));
}

/** The requests sent with this method to this path, in order. */
export function calls(method: string, path: string): Sent[] {
  return sent.filter((request) => request.method === method && request.path === path);
}
