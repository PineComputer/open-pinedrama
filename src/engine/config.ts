// The engine's settings: from .env.local in development, from the environment the
// desktop app passes otherwise.
import { existsSync } from "node:fs";
import path from "node:path";
import type { Mode } from "../shared/types.ts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const VERSION = "0.1.0";
export const DATA_DIR = path.resolve(process.env.STUDIO_DATA_DIR ?? path.join(process.cwd(), ".data"));
export const PORT = Number(process.env.STUDIO_PORT ?? 4310);
/** The built UI, served by the engine outside development. */
export const UI_DIR = path.resolve(process.env.STUDIO_UI_DIR ?? path.join(process.cwd(), "dist/ui"));

/** Pine when a project key is set, replay otherwise; STUDIO_MODE forces one. */
export function mode(): Mode {
  const forced = process.env.STUDIO_MODE;
  if (forced === "pine" || forced === "replay") return forced;
  return process.env.PINE_SANDBOX_API_KEY ? "pine" : "replay";
}

/**
 * Idle timeouts (docs/IMPLEMENTATION_PLAN.md). Work keeps a Computer running; a question
 * waiting for the maker doesn't, so a Computer with a waiting session gets longer. The
 * working value covers a question that arrives while the app is closed.
 */
export const IDLE_WORKING_S = 60 * 60;
export const IDLE_WAITING_S = 3 * 60 * 60;

/** At most this many episodes wait for the maker before the line stops starting new ones. */
export const WAITING_CAP = 4;

/** Pine's limits on files given to a session and returned by a turn. */
export const MAX_ATTACHMENT = 64 * 1024 * 1024;

/** A turn that ends without a question or a finished episode gets this many "continue" runs. */
export const MAX_CONTINUES = 2;
