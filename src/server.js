import { env } from "./config/env.js";
import { connectMongo } from "./db/mongo.js";
import { createApp } from "./app.js";
import { startScheduler } from "./scheduler.js";
import http from "http";
import { initRealtime } from "./realtime/hub.js";

async function start() {
  await connectMongo();
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });
  startScheduler();
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
