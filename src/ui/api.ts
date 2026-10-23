// Talking to the engine: JSON calls, and data that refreshes itself when the engine says
// its scope changed (one shared event stream; after a reconnect everything refetches).
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveMessage } from "../shared/types.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json", ...init?.headers } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? `Request failed (${response.status}).`, response.status);
  return body;
}

type Listener = (scope: string) => void;
const listeners = new Set<Listener>();
let source: EventSource | undefined;

function connect() {
  if (source) return;
  source = new EventSource("/api/live");
  source.onmessage = (event) => {
    const message = JSON.parse(event.data) as LiveMessage;
    // "hello" arrives on every (re)connect: refetch everything, nothing is replayed.
    const scope = message.type === "changed" ? message.scope : "*";
    for (const listener of listeners) listener(scope);
  };
}

export function onLive(listener: Listener): () => void {
  connect();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * GETs a path, and again whenever one of its scopes changes. Refetches are coalesced, so
 * a burst of changes costs one request.
 */
export function useResource<T>(path: string | null, scopes: string[]): { data: T | undefined; error: string | undefined; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const scopeKey = scopes.join("|");
  const pending = useRef<number | undefined>(undefined);
  const load = useCallback(() => {
    if (!path) return;
    api<T>(path)
      .then((value) => {
        setData(value);
        setError(undefined);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [path]);

  useEffect(() => {
    setData(undefined);
    load();
    const wanted = scopeKey.split("|");
    return onLive((scope) => {
      if (scope !== "*" && !wanted.includes(scope)) return;
      window.clearTimeout(pending.current);
      pending.current = window.setTimeout(load, 120);
    });
  }, [load, scopeKey]);

  return { data, error, reload: load };
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value < 100 ? 2 : 0 })}`;
}

export function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
