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
  { name: "shell", spec: "shell", colorScheme: "light" },
  { name: "stop-episode", spec: "stop-episode", colorScheme: "light" },
  { name: "graph", spec: "graph", colorScheme: "light" },
  { name: "graph-dark", spec: "graph", colorScheme: "dark" },
  { name: "cut-review", spec: "cut-review", colorScheme: "light" },
  { name: "cut-review-dark", spec: "cut-review", colorScheme: "dark" },
  { name: "gallery", spec: "gallery", colorScheme: "light" },
  { name: "gallery-dark", spec: "gallery", colorScheme: "dark" },
  { name: "upload", spec: "upload", colorScheme: "light" },
  { name: "upload-dark", spec: "upload", colorScheme: "dark" },
  { name: "screenshots", spec: "screenshots", colorScheme: "light" },
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
      // The UI and replay files scripts/e2e-build.mjs puts apart from dist/, which a running studio may be serving.
      STUDIO_RESOURCES: path.resolve(".e2e"),
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
  projects: PROJECTS.map((project, n) => {
    const baseURL = `http://127.0.0.1:${FIRST_PORT + n}`;
    // The studio's theme follows the system here (src/ui/theme/theme.ts), so each project's scheme is the one shown.
    const storageState = { cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: "studio.theme", value: "system" }] }] };
    return { name: project.name, testMatch: `${project.spec}.spec.ts`, use: { baseURL, colorScheme: project.colorScheme, storageState } };
  }),
  webServer: PROJECTS.map((_, n) => engine(FIRST_PORT + n)),
});
