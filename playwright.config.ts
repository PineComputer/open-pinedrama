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
 * Each project runs one spec file on an engine of its own, on its own port and an empty data
 * folder, so no run sees another's dramas. The maker's walk runs in both themes. The UI is built
 * once before the run (npm run e2e).
 */
const PROJECTS: { name: string; spec: string; colorScheme: "light" | "dark" }[] = [
  { name: "sample-drama", spec: "sample-drama", colorScheme: "light" },
  { name: "sample-drama-dark", spec: "sample-drama", colorScheme: "dark" },
  { name: "project-state", spec: "project-state", colorScheme: "light" },
  { name: "gallery", spec: "gallery", colorScheme: "light" },
  { name: "gallery-dark", spec: "gallery", colorScheme: "dark" },
];

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
  projects: PROJECTS.map((project, n) => ({ name: project.name, testMatch: `${project.spec}.spec.ts`, use: { baseURL: `http://127.0.0.1:${FIRST_PORT + n}`, colorScheme: project.colorScheme } })),
  webServer: PROJECTS.map((_, n) => engine(FIRST_PORT + n)),
});
