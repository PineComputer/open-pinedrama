import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The UI. In development Vite serves it on 127.0.0.1 and forwards /api to the engine;
// in production the engine serves the built files itself (src/engine/http.ts).
const ENGINE = `http://127.0.0.1:${process.env.STUDIO_PORT ?? 4310}`;

export default defineConfig({
  root: "src/ui",
  plugins: [react(), tailwindcss()],
  // shadcn/ui's import alias (components.json).
  resolve: { alias: { "@": fileURLToPath(new URL("./src/ui", import.meta.url)) } },
  build: { outDir: "../../dist/ui", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Anchored, so the UI's own modules (src/ui/api.ts) aren't sent to the engine.
    proxy: { "^/api/": { target: ENGINE, changeOrigin: false } },
  },
});
