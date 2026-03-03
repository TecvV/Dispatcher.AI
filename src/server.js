import { env, getRealtimeVoiceConfigReport } from "./config/env.js";
import { connectMongo } from "./db/mongo.js";
import { createApp } from "./app.js";
import { startScheduler } from "./scheduler.js";
import http from "http";
import { initRealtime } from "./realtime/hub.js";

async function start() {
  const voiceReport = getRealtimeVoiceConfigReport();
  if (voiceReport.wantsRealtime) {
    if (voiceReport.ready) {
      console.log("[VOICE-RT-CONFIG] Ready: realtime Twilio + STT/TTS pipeline is enabled.");
    } else {
      console.warn("[VOICE-RT-CONFIG] Not ready. Missing required env keys/flags:");
      for (const m of voiceReport.missing) {
        console.warn(`  - ${m}`);
      }
      for (const w of voiceReport.warnings) {
        console.warn(`  ! ${w}`);
      }
      console.warn("[VOICE-RT-CONFIG] Fallback call flow will be used until config is fixed.");
    }
  } else {
    console.log("[VOICE-RT-CONFIG] Realtime voice disabled (set TWILIO_ENABLE_REALTIME_STREAM=true and VOICE_AI_ENABLED=true to enable).");
  }

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
