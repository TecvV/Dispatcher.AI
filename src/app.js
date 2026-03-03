import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import oauthRoutes from "./routes/oauth.js";
import chatRoutes from "./routes/chat.js";
import userRoutes from "./routes/users.js";
import contactsRoutes from "./routes/contacts.js";
import discordChannelsRoutes from "./routes/discordChannels.js";
import listenerRoutes from "./routes/listeners.js";
import escalationRoutes from "./routes/escalation.js";
import agentRoutes from "./routes/agent.js";
import voiceRoutes from "./routes/voice.js";

export function createApp() {
  const app = express();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const publicDir = path.join(__dirname, "..", "public");

  app.use(cors());
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: false, limit: "20mb" }));
  app.use(express.static(publicDir, { index: false }));

  app.get("/health", (req, res) => {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    res.json({
      ok: true,
      service: "wca-ai-agentic-backend",
      serverTime: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      db: {
        readyState: mongoose.connection.readyState,
        status: states[mongoose.connection.readyState] || "unknown"
      }
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/oauth", oauthRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/contacts", contactsRoutes);
  app.use("/api/discord-channels", discordChannelsRoutes);
  app.use("/api/listeners", listenerRoutes);
  app.use("/api/escalation", escalationRoutes);
  app.use("/api/agent", agentRoutes);
  app.use("/api/voice", voiceRoutes);

  app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "landing.html"));
  });

  app.get("/login", (req, res) => {
    res.sendFile(path.join(publicDir, "login.html"));
  });

  app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(publicDir, "dashboard.html"));
  });

  app.get("/reset-password", (req, res) => {
    res.sendFile(path.join(publicDir, "reset-password.html"));
  });

  app.get("/chat", (req, res) => {
    res.sendFile(path.join(publicDir, "chat.html"));
  });

  app.get("/escalation", (req, res) => {
    res.sendFile(path.join(publicDir, "escalation.html"));
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  return app;
}
