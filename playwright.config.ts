// End-to-end: the built studio served by its engine in replay, driven in a browser the way
// a maker uses it. Replay plays recorded turns with placeholder files, so nothing reaches
// Pine and nothing is spent (docs/TESTING.md).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

export const TOKEN = "e2e-launch-token";
const FIRST_PORT = Number(process.env.STUDIO_E2E_PORT ?? 4391);

/**
 * Each spec file gets an engine of its own, on its own port and an empty data folder, so no
 * spec sees another's dramas. The UI is built once before the run (npm run e2e).
 */
const SPECS = ["sample-drama", "project-state"];

function engine(port: number) {
  return {
    command: "npx tsx src/engine/main.ts",
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      STUDIO_MODE: "replay",
      STUDIO_PORT: String(port),
      STUDIO_TOKEN: TOKEN,
      STUDIO_DATA_DIR: mkdtempSync(path.join(tmpdir(), "studio-e2e-")),
      STUDIO_SECRET: Buffer.alloc(32, 7).toString("base64"),
      STUDIO_REPLAY_SPEED: "20",
    },
  };
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    // Locally the installed Chrome; CI installs Playwright's Chromium.
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    // Pages rise in on load; mid-fade text fails contrast checks and screenshots differ.
    reducedMotion: "reduce",
  },
  projects: SPECS.map((name, n) => ({ name, testMatch: `${name}.spec.ts`, use: { baseURL: `http://127.0.0.1:${FIRST_PORT + n}` } })),
  webServer: SPECS.map((_, n) => engine(FIRST_PORT + n)),
});
