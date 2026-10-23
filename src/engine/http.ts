// The engine's HTTP API for the UI: reads, the maker's actions, library files (with range
// requests, so video seeks), and one event stream that says what changed. Like the
// starter, it answers only on loopback and only to its own pages.
import { existsSync } from "node:fs";
import { Readable } from "node:stream";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppInfo, Decision, LiveMessage } from "../shared/types.ts";
import { DATA_DIR, UI_DIR, VERSION } from "./config.ts";
import { fleet } from "./computers.ts";
import { all } from "./db.ts";
import { chat, createDrama, desktop, resumeEpisode, retrySetup, updateDrama } from "./dramas.ts";
import { fileRow, openBlob } from "./library.ts";
import { subscribe } from "./live.ts";
import { drama as dramaRow, review as reviewRow, session as sessionRow, type SessionRow } from "./records.ts";
import { ReviewError, decide, resumeWithDecision } from "./reviews.ts";
import { castGroups, chatView, dramaCards, dramaFiles, dramaView, inbox, reviewView } from "./views.ts";

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

function fail(c: Context, error: unknown) {
  if (error instanceof ReviewError) return c.json({ error: error.message }, error.status as 400);
  console.error(error);
  return c.json({ error: (error as Error).message ?? "Something went wrong." }, 500);
}

export function app(): Hono {
  const api = new Hono();

  api.use("*", async (c, next) => {
    if (!LOOPBACK.test(c.req.header("host") ?? "")) return c.text("Not found", 404);
    const origin = c.req.header("origin");
    if (c.req.method !== "GET" && origin && !/^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?|app:\/\/.*)$/.test(origin)) {
      return c.json({ error: "Requests come only from the studio's own pages." }, 403);
    }
    await next();
  });

  api.get("/api/app", (c) => c.json<AppInfo>({ mode: fleet().mode, version: VERSION, dataDir: DATA_DIR }));

  api.get("/api/dramas", (c) => c.json(dramaCards()));

  api.post("/api/dramas", async (c) => {
    try {
      const body = await c.req.parseBody({ all: true });
      const field = (name: string) => String(body[name] ?? "");
      const uploads = ([] as unknown[]).concat(body.files ?? []).filter((value): value is File => value instanceof File);
      const id = await createDrama({
        title: field("title"),
        language: field("language"),
        look: field("look"),
        format: field("format"),
        budget: Number(field("budget")) || null,
        parallel: Number(field("parallel")) || 4,
        perComputer: Number(field("perComputer")) || 1,
        notes: field("notes"),
        files: await Promise.all(uploads.map(async (file) => ({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }))),
      });
      return c.json({ id });
    } catch (error) {
      return fail(c, error);
    }
  });

  api.get("/api/dramas/:id", (c) => {
    const drama = dramaRow(c.req.param("id"));
    return drama ? c.json(dramaView(drama)) : c.json({ error: "No such drama." }, 404);
  });

  api.patch("/api/dramas/:id", async (c) => {
    try {
      updateDrama(c.req.param("id"), await c.req.json());
      return c.json(dramaView(dramaRow(c.req.param("id"))!));
    } catch (error) {
      return fail(c, error);
    }
  });

  api.post("/api/dramas/:id/retry", (c) => {
    try {
      retrySetup(c.req.param("id"));
      return c.json({ ok: true });
    } catch (error) {
      return fail(c, error);
    }
  });

  api.get("/api/dramas/:id/cast", (c) => c.json(castGroups(c.req.param("id"))));
  api.get("/api/dramas/:id/files", (c) => c.json(dramaFiles(c.req.param("id"), c.req.query("episode") || undefined)));

  api.get("/api/dramas/:id/sessions", (c) => {
    const rows = all<SessionRow>("select * from sessions where drama_id = ? and state = 'open' order by created_at", c.req.param("id"));
    return c.json(rows.map(chatView));
  });

  api.post("/api/episodes/:id/resume", (c) => {
    try {
      resumeEpisode(c.req.param("id"));
      return c.json({ ok: true });
    } catch (error) {
      return fail(c, error);
    }
  });

  api.get("/api/inbox", (c) => c.json(inbox(c.req.query("drama") || undefined)));

  api.get("/api/reviews/:id", (c) => {
    const review = reviewRow(c.req.param("id"));
    return review ? c.json(reviewView(review)) : c.json({ error: "No such review." }, 404);
  });

  api.post("/api/reviews/:id/decision", async (c) => {
    try {
      const review = await decide(c.req.param("id"), (await c.req.json()) as Decision);
      return c.json(reviewView(review));
    } catch (error) {
      return fail(c, error);
    }
  });

  api.post("/api/reviews/:id/resume", (c) => {
    try {
      resumeWithDecision(c.req.param("id"));
      return c.json({ ok: true });
    } catch (error) {
      return fail(c, error);
    }
  });

  api.get("/api/sessions/:id/chat", (c) => {
    const session = sessionRow(c.req.param("id"));
    return session ? c.json(chatView(session)) : c.json({ error: "No such session." }, 404);
  });

  api.post("/api/sessions/:id/chat", async (c) => {
    try {
      const { text } = (await c.req.json()) as { text: string };
      await chat(c.req.param("id"), text);
      return c.json(chatView(sessionRow(c.req.param("id"))!));
    } catch (error) {
      return fail(c, error);
    }
  });

  api.post("/api/sessions/:id/desktop", async (c) => {
    try {
      const connection = await desktop(c.req.param("id"));
      if (!connection) return c.json({ error: "There is no desktop to show in replay mode." }, 404);
      c.header("Cache-Control", "no-store");
      return c.json(connection);
    } catch (error) {
      return fail(c, error);
    }
  });

  api.get("/api/files/:id", (c) => {
    const row = fileRow(Number(c.req.param("id")));
    if (!row) return c.json({ error: "No such file." }, 404);
    const headers: Record<string, string> = {
      "Content-Type": row.type,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
    };
    if (c.req.query("download")) headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`;
    const range = c.req.header("range")?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && row.size > 0) {
      const start = range[1] ? Number(range[1]) : Math.max(0, row.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), row.size - 1) : row.size - 1;
      if (start > end || start >= row.size) return c.body(null, 416, { "Content-Range": `bytes */${row.size}` });
      return c.body(Readable.toWeb(openBlob(row, { start, end })) as ReadableStream, 206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${row.size}`,
        "Content-Length": String(end - start + 1),
      });
    }
    return c.body(Readable.toWeb(openBlob(row)) as ReadableStream, 200, { ...headers, "Content-Length": String(row.size) });
  });

  api.get("/api/live", (c) =>
    streamSSE(c, async (stream) => {
      const send = (message: LiveMessage) => void stream.writeSSE({ data: JSON.stringify(message) }).catch(() => undefined);
      send({ type: "hello" });
      const stop = subscribe(send);
      const keepAlive = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }).catch(() => undefined), 20_000);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(keepAlive);
      stop();
    }),
  );

  api.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

  // The built UI, outside development (Vite serves it in development).
  if (existsSync(UI_DIR)) {
    api.use("/*", serveStatic({ root: UI_DIR }));
    api.get("*", serveStatic({ path: `${UI_DIR}/index.html` }));
  }

  return api;
}
