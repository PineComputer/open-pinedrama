// The studio the end-to-end tests run (playwright.config.ts): the UI with the component gallery
// (VITE_GALLERY=1) and the replay's files, in .e2e/ as the engine's resources, apart from dist/,
// which a studio running in development or as the desktop app may be serving.
import { execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

rmSync(".e2e", { recursive: true, force: true });
execSync("npx vite build --outDir ../../.e2e/dist/ui --emptyOutDir", { stdio: "inherit", env: { ...process.env, VITE_GALLERY: "1" } });
cpSync("fixtures", ".e2e/fixtures", { recursive: true });
