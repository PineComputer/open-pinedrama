// Development: the engine (restarted on change) and Vite's UI server, side by side.
// Open http://127.0.0.1:5173.
import { spawn } from "node:child_process";

const children = [
  spawn("npx", ["tsx", "watch", "--clear-screen=false", "src/engine/main.ts"], { stdio: "inherit" }),
  spawn("npx", ["vite"], { stdio: "inherit" }),
];

function stop() {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => code && stop());
