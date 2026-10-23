// The engine: the maker's Pine project (or the replay), the production line's clock, and
// the HTTP API on loopback.
import { serve } from "@hono/node-server";
import { DATA_DIR, PORT } from "./config.ts";
import { setFleet } from "./computers.ts";
import { appInfo, initialFleet } from "./connection.ts";
import { db } from "./db.ts";
import { app } from "./http.ts";
import { startClock } from "./scheduler.ts";

db();
setFleet(initialFleet());
startClock();

serve({ fetch: app().fetch, port: PORT, hostname: "127.0.0.1" }, (info) => {
  console.log(`Pine Drama Studio engine on http://127.0.0.1:${info.port} — ${appInfo().mode}, data in ${DATA_DIR}`);
});
