import { defineConfig } from "vitest/config";

// Two projects: the engine's and shared logic in Node, and the UI's components rendered in
// jsdom with the engine's HTTP answered by MSW (docs/TESTING.md).
export default defineConfig({
  test: {
    projects: [
      { test: { name: "logic", include: ["src/**/*.test.ts"], environment: "node" } },
      { test: { name: "ui", include: ["src/ui/**/*.test.tsx"], environment: "jsdom", setupFiles: ["src/ui/test/setup.ts"] } },
    ],
  },
});
