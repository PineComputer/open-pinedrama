// End-to-end: the built studio served by its engine in replay, driven in a browser the way
// a maker uses it. Replay plays recorded turns with placeholder files, so nothing reaches
// Pine and nothing is spent (docs/TESTING.md). Each run starts from an empty data folder.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.STUDIO_E2E_PORT ?? 4391);
export const TOKEN = "e2e-launch-token";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Locally the installed Chrome; CI installs Playwright's Chromium.
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    // Pages rise in on load; mid-fade text fails contrast checks and screenshots differ.
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npm run build && npx tsx src/engine/main.ts",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      STUDIO_MODE: "replay",
      STUDIO_PORT: String(PORT),
      STUDIO_TOKEN: TOKEN,
      STUDIO_DATA_DIR: mkdtempSync(path.join(tmpdir(), "studio-e2e-")),
      STUDIO_SECRET: Buffer.alloc(32, 7).toString("base64"),
      STUDIO_REPLAY_SPEED: "20",
    },
  },
});
