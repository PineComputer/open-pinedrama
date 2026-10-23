// The engine: Pine (or the replay), the production line's clock, and the HTTP API on loopback.
import { serve } from "@hono/node-server";
import { DATA_DIR, PORT, mode } from "./config.ts";
import { setFleet } from "./computers.ts";
import { db } from "./db.ts";
import { app } from "./http.ts";
import { PineFleet } from "./pine-fleet.ts";
import { ReplayFleet } from "./replay-fleet.ts";
import { startClock } from "./scheduler.ts";

db();
setFleet(mode() === "pine" ? new PineFleet() : new ReplayFleet());
startClock();

serve({ fetch: app().fetch, port: PORT, hostname: "127.0.0.1" }, (info) => {
  console.log(`Pine Drama Studio engine on http://127.0.0.1:${info.port} — ${mode()} mode, data in ${DATA_DIR}`);
});
