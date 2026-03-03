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
    webhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || "",
    voice: process.env.TWILIO_VOICE || "Polly.Aditi",
    voiceLanguage: process.env.TWILIO_VOICE_LANGUAGE || "en-IN",
    enableRealtimeStream: String(process.env.TWILIO_ENABLE_REALTIME_STREAM || "false").toLowerCase() === "true",
    enableBidirectionalStream: String(process.env.TWILIO_ENABLE_BIDIRECTIONAL_STREAM || "false").toLowerCase() === "true"
  },
  voiceAI: {
    enabled: String(process.env.VOICE_AI_ENABLED || "false").toLowerCase() === "true",
    deepgramApiKey: process.env.DEEPGRAM_API_KEY || "",
    deepgramWsUrl:
      process.env.DEEPGRAM_WS_URL ||
      "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1&interim_results=false&punctuate=true&endpointing=300",
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || "",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || "",
    elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5",
    elevenLabsBaseUrl: process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io/v1"
  },
  memory: {
    maxMessages: Number(process.env.MEMORY_MAX_MESSAGES || 300),
    maxChars: Number(process.env.MEMORY_MAX_CHARS || 18000)
  },
  escalation: {
    platformCommissionPct: Number(process.env.ESCALATION_PLATFORM_COMMISSION_PCT || 0)
  }
};

export function getRealtimeVoiceConfigReport() {
  const isTwilioStreamEnabled = Boolean(env.twilio.enableRealtimeStream);
  const isVoiceAiEnabled = Boolean(env.voiceAI.enabled);
  const wantsRealtime = isTwilioStreamEnabled || isVoiceAiEnabled;
  const missing = [];
  const warnings = [];

  if (!isTwilioStreamEnabled) missing.push("TWILIO_ENABLE_REALTIME_STREAM=true");
  if (!isVoiceAiEnabled) missing.push("VOICE_AI_ENABLED=true");

  if (!env.twilio.accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if (!env.twilio.authToken) missing.push("TWILIO_AUTH_TOKEN");
  if (!env.twilio.fromNumber) missing.push("TWILIO_FROM_NUMBER");
  if (!env.twilio.webhookBaseUrl) missing.push("TWILIO_WEBHOOK_BASE_URL");
  if (!env.voiceAI.deepgramApiKey) missing.push("DEEPGRAM_API_KEY");
  if (!env.voiceAI.elevenLabsApiKey) missing.push("ELEVENLABS_API_KEY");
  if (!env.voiceAI.elevenLabsVoiceId) missing.push("ELEVENLABS_VOICE_ID");
  if (isTwilioStreamEnabled && !env.twilio.enableBidirectionalStream) {
    warnings.push("TWILIO_ENABLE_BIDIRECTIONAL_STREAM=false (safe mode). This improves call stability; Twilio voice may handle prompts.");
  }

  if (env.twilio.webhookBaseUrl && !/^https:\/\//i.test(env.twilio.webhookBaseUrl)) {
    warnings.push("TWILIO_WEBHOOK_BASE_URL should be public HTTPS (ngrok/deployed URL).");
  }
  if (env.voiceAI.deepgramWsUrl && !/^wss:\/\//i.test(env.voiceAI.deepgramWsUrl)) {
    warnings.push("DEEPGRAM_WS_URL should be WSS endpoint.");
  }

  const suspiciousSpacedKeys = [
    "TWILIO_ACCOUNT_SID =",
    "TWILIO_AUTH_TOKEN =",
    "TWILIO_FROM_NUMBER =",
    "TWILIO_WEBHOOK_BASE_URL ="
  ];
  for (const rawKey of suspiciousSpacedKeys) {
    if (Object.prototype.hasOwnProperty.call(process.env, rawKey)) {
      warnings.push(`Detected malformed env key "${rawKey}". Remove spaces around '=' in .env.`);
    }
  }

  return {
    wantsRealtime,
    ready:
      isTwilioStreamEnabled &&
      isVoiceAiEnabled &&
      !missing.includes("TWILIO_ACCOUNT_SID") &&
      !missing.includes("TWILIO_AUTH_TOKEN") &&
      !missing.includes("TWILIO_FROM_NUMBER") &&
      !missing.includes("TWILIO_WEBHOOK_BASE_URL") &&
      !missing.includes("DEEPGRAM_API_KEY") &&
      !missing.includes("ELEVENLABS_API_KEY") &&
      !missing.includes("ELEVENLABS_VOICE_ID"),
    missing: [...new Set(missing)],
    warnings
  };
}
