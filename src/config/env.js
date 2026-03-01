import dotenv from "dotenv";

dotenv.config();

const required = ["GROQ_API_KEY", "GROQ_MODEL", "MONGODB_URI", "MONGODB_DB"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT || 3000),
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL,
  mongoUri: process.env.MONGODB_URI,
  mongoDb: process.env.MONGODB_DB,
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    fromEmail: process.env.ALERT_FROM_EMAIL || ""
  },
  googleCalendarApiBase: process.env.GOOGLE_CALENDAR_API_BASE || "https://www.googleapis.com/calendar/v3",
  googleMeetApiBase: process.env.GOOGLE_MEET_API_BASE || "https://meet.googleapis.com/v2",
  gmailApiBase: process.env.GMAIL_API_BASE || "https://gmail.googleapis.com/gmail/v1",
  googleOAuth: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/oauth/google/callback",
    authRedirectUri:
      process.env.GOOGLE_AUTH_REDIRECT_URI ||
      `http://localhost:${Number(process.env.PORT || 3000)}/api/oauth/google/login/callback`
  },
  mem0: {
    apiKey: process.env.MEM0_API_KEY || "",
    enabled: String(process.env.MEM0_ENABLED || "true").toLowerCase() === "true"
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    defaultChatId: process.env.TELEGRAM_DEFAULT_CHAT_ID || "",
    apiBase: process.env.TELEGRAM_API_BASE || "https://api.telegram.org"
  },
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || "",
    defaultChannelId: process.env.DISCORD_DEFAULT_CHANNEL_ID || "",
    defaultWebhookUrl: process.env.DISCORD_DEFAULT_WEBHOOK_URL || "",
    apiBase: process.env.DISCORD_API_BASE || "https://discord.com/api/v10"
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    fromNumber: process.env.TWILIO_FROM_NUMBER || "",
    apiBase: process.env.TWILIO_API_BASE || "https://api.twilio.com/2010-04-01",
    webhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || ""
  },
  memory: {
    maxMessages: Number(process.env.MEMORY_MAX_MESSAGES || 300),
    maxChars: Number(process.env.MEMORY_MAX_CHARS || 18000)
  },
  escalation: {
    platformCommissionPct: Number(process.env.ESCALATION_PLATFORM_COMMISSION_PCT || 0)
  }
};
