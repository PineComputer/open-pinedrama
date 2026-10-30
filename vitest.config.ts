import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Two projects: the engine's and shared logic in Node, and the UI's components rendered in
// jsdom with the engine's HTTP answered by MSW (docs/TESTING.md).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src/ui", import.meta.url)) } },
  test: {
    projects: [
      { extends: true, test: { name: "logic", include: ["src/**/*.test.ts"], environment: "node" } },
      { extends: true, test: { name: "ui", include: ["src/ui/**/*.test.tsx"], environment: "jsdom", setupFiles: ["src/ui/test/setup.ts"] } },
    ],
  },
});
