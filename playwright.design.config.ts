// `npm run design:diff`: the prototype in design/ against the product, screen by screen (scripts/design-diff.spec.ts).
// An on-demand tool, not a gate: it compares with Playwright's own screenshot comparison and writes each pair and its diff.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "scripts",
  testMatch: "design-diff.spec.ts",
  outputDir: ".design-diff/results",
  snapshotPathTemplate: ".design-diff/baseline/{arg}{ext}",
  timeout: 300_000,
  workers: 1,
  reporter: "line",
  // Installed Chrome locally, as the e2e config does; Playwright's own Chromium on CI.
  use: { viewport: { width: 1440, height: 900 }, channel: process.env.CI ? undefined : "chrome" },
});
