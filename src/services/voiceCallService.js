import crypto from "crypto";
import { env } from "../config/env.js";

function twilioAuthHeader() {
  const sid = env.twilio.accountSid;
  const token = env.twilio.authToken;
  const basic = Buffer.from(`${sid}:${token}`).toString("base64");
  return `Basic ${basic}`;
}

export function hasVoiceCallConfig() {
  return Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.fromNumber && env.twilio.webhookBaseUrl);
}

export function createVoiceRelayToken() {
  return crypto.randomBytes(16).toString("hex");
}

export async function startTwilioVoiceCall({ toNumber, relayCallId, token }) {
  if (!hasVoiceCallConfig()) {
    throw new Error("Voice calling is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and TWILIO_WEBHOOK_BASE_URL.");
  }
  const endpoint = `${env.twilio.apiBase}/Accounts/${env.twilio.accountSid}/Calls.json`;
  const voiceUrl = `${env.twilio.webhookBaseUrl.replace(/\/$/, "")}/api/voice/twiml/${relayCallId}?t=${encodeURIComponent(token)}`;

  const body = new URLSearchParams({
    To: toNumber,
    From: env.twilio.fromNumber,
    Url: voiceUrl,
    Method: "POST"
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const raw = await res.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  if (!res.ok) {
    throw new Error(`Twilio call failed ${res.status}: ${raw}`);
  }
  return data;
}

export function buildVoiceRelayTwiml({ message, gatherActionUrl }) {
  const safeMessage = String(message || "").trim();
  const safeAction = String(gatherActionUrl || "").trim();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="2" finishOnKey="" timeout="8" action="${safeAction}" method="POST">
    <Say voice="alice">This is an automated voice relay from W C A. ${escapeXml(
      safeMessage
    )} To hear this message again, press pound 2.</Say>
  </Gather>
  <Say voice="alice">No input received. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

export function buildVoiceRelayRepeatTwiml({ message, gatherActionUrl }) {
  const safeMessage = String(message || "").trim();
  const safeAction = String(gatherActionUrl || "").trim();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="2" finishOnKey="" timeout="8" action="${safeAction}" method="POST">
    <Say voice="alice">Repeating the message. ${escapeXml(
      safeMessage
    )} Press pound 2 again to repeat, or stay on the line to end.</Say>
  </Gather>
  <Say voice="alice">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

export function buildVoiceRelayGoodbyeTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

