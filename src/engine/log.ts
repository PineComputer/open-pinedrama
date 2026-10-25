// The engine's log, kept in the data folder so a maker can send it (diagnostics.ts): what the
// engine says on its console, timed, in a file that starts again past a few MB with the one
// before kept beside it. The console prints as it always did.
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { format } from "node:util";
import { DATA_DIR } from "./config.ts";

export const LOG_FILE = path.join(DATA_DIR, "logs", "engine.log");
const LIMIT = 5 * 1024 * 1024;

function write(level: string, text: string): void {
  try {
    if ((statSync(LOG_FILE, { throwIfNoEntry: false })?.size ?? 0) > LIMIT) renameSync(LOG_FILE, `${LOG_FILE}.1`);
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${level} ${text}\n`);
  } catch {
    // A log that can't be written mustn't stop the engine.
  }
}

/** From now on, what the engine says goes to its log too, and so does a crash. */
export function keepLog(): void {
  mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  for (const level of ["log", "info", "warn", "error"] as const) {
    const print = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      print(...args);
      write(level, format(...args));
    };
  }
  process.on("uncaughtExceptionMonitor", (error) => write("crash", error.stack ?? String(error)));
}

/** The log's last lines, the file before it included when this one is short. */
export function logTail(lines: number): string[] {
  const read = (file: string) => {
    try {
      return readFileSync(file, "utf8").split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  return [...read(`${LOG_FILE}.1`), ...read(LOG_FILE)].slice(-lines);
}
