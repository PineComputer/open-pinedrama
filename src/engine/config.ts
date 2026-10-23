// The engine's settings. The maker's Pine project is chosen in the app (settings.ts);
// these are the process's own: where its data lives, its port, and the limits it keeps.
// .env.local is read in development only, for a developer's overrides.
import { existsSync } from "node:fs";
import path from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const VERSION = "0.1.0";
export const DATA_DIR = path.resolve(process.env.STUDIO_DATA_DIR ?? path.join(process.cwd(), ".data"));
export const PORT = Number(process.env.STUDIO_PORT ?? 4310);
/** The built UI, served by the engine outside development. */
export const UI_DIR = path.resolve(process.env.STUDIO_UI_DIR ?? path.join(process.cwd(), "dist/ui"));

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
