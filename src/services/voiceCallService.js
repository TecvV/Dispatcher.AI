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
  const statusCallbackUrl = `${env.twilio.webhookBaseUrl.replace(/\/$/, "")}/api/voice/status/${relayCallId}?t=${encodeURIComponent(
    token
  )}`;

  const body = new URLSearchParams({
    To: toNumber,
    From: env.twilio.fromNumber,
    Url: voiceUrl,
    Method: "POST",
    StatusCallback: statusCallbackUrl,
    StatusCallbackMethod: "POST",
    StatusCallbackEvent: "initiated ringing answered completed"
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

export async function terminateTwilioCall(callSid) {
  const sid = String(callSid || "").trim();
  if (!sid) return { ok: false, reason: "missing_call_sid" };
  if (!hasVoiceCallConfig()) return { ok: false, reason: "twilio_not_configured" };
  const endpoint = `${env.twilio.apiBase}/Accounts/${env.twilio.accountSid}/Calls/${encodeURIComponent(sid)}.json`;
  const body = new URLSearchParams({ Status: "completed" });
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!res.ok) {
    return { ok: false, reason: await res.text() };
  }
  return { ok: true };
}

export async function fetchTwilioCallStatus(callSid) {
  const sid = String(callSid || "").trim();
  if (!sid) return { ok: false, reason: "missing_call_sid" };
  if (!hasVoiceCallConfig()) return { ok: false, reason: "twilio_not_configured" };
  const endpoint = `${env.twilio.apiBase}/Accounts/${env.twilio.accountSid}/Calls/${encodeURIComponent(sid)}.json`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: twilioAuthHeader()
    }
  });
  const raw = await res.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  if (!res.ok) {
    return { ok: false, reason: `Twilio status fetch failed ${res.status}: ${raw}` };
  }
  return {
    ok: true,
    status: String(data?.status || "").trim(),
    raw: data
  };
}

export function buildVoiceStreamUrl({ relayCallId, token } = {}) {
  const base = String(env.twilio.webhookBaseUrl || "").trim().replace(/\/$/, "");
  if (!base) return "";
  const wsBase = base.startsWith("https://") ? `wss://${base.slice("https://".length)}` : base;
  const id = encodeURIComponent(String(relayCallId || "").trim());
  const t = encodeURIComponent(String(token || "").trim());
  if (id && t) {
    return `${wsBase}/ws/voice-relay?relayCallId=${id}&t=${t}`;
  }
  return `${wsBase}/ws/voice-relay`;
}

export function buildVoiceRelayTwiml({
  message,
  gatherActionUrl,
  streamUrl,
  bidirectionalStream = false,
  relayCallId = "",
  token = ""
}) {
  const safeMessage = String(message || "").trim();
  const safeAction = escapeXml(String(gatherActionUrl || "").trim());
  const safeStream = escapeXml(String(streamUrl || "").trim());
  const safeRelayCallId = escapeXml(String(relayCallId || "").trim());
  const safeToken = escapeXml(String(token || "").trim());
  const paramsBlock =
    safeRelayCallId || safeToken
      ? `
      <Parameter name="relayCallId" value="${safeRelayCallId}" />
      <Parameter name="t" value="${safeToken}" />`
      : "";
  const streamBlock = safeStream && !bidirectionalStream
    ? `  <Start>
    <Stream url="${safeStream}" track="inbound_track">${paramsBlock}
    </Stream>
  </Start>
`
    : "";
  const sayAttrs = getTwilioSayAttrs();
  if (safeStream && bidirectionalStream) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${safeStream}">${paramsBlock}
    </Stream>
  </Connect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${streamBlock}  <Pause length="1"/>
  <Gather input="speech dtmf" speechTimeout="auto" timeout="6" action="${safeAction}" method="POST">
    <Say ${sayAttrs}>This is an automated voice relay from Dispatcher A I.</Say>
    <Say ${sayAttrs}>${escapeXml(safeMessage)}</Say>
    <Say ${sayAttrs}>You can now speak after the beep to respond. To hear the relay message again, press 2.</Say>
  </Gather>
  <Say ${sayAttrs}>I did not catch that. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

export function buildVoiceRelayRepeatTwiml({ message, gatherActionUrl }) {
  const safeMessage = String(message || "").trim();
  const safeAction = escapeXml(String(gatherActionUrl || "").trim());
  const sayAttrs = getTwilioSayAttrs();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" speechTimeout="auto" timeout="6" action="${safeAction}" method="POST">
    <Say ${sayAttrs}>Repeating the relay message. ${escapeXml(
      safeMessage
    )}</Say>
    <Say ${sayAttrs}>You may continue speaking after the beep. Press 2 to repeat again.</Say>
  </Gather>
  <Say ${sayAttrs}>Goodbye.</Say>
  <Hangup/>
</Response>`;
}

export function buildVoiceRelayTurnTwiml({ reply, gatherActionUrl }) {
  const safeReply = String(reply || "").trim();
  const safeAction = escapeXml(String(gatherActionUrl || "").trim());
  const sayAttrs = getTwilioSayAttrs();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" speechTimeout="auto" timeout="6" action="${safeAction}" method="POST">
    <Say ${sayAttrs}>${escapeXml(safeReply || "I am here and listening.")}</Say>
    <Say ${sayAttrs}>You can continue speaking. Press 2 to repeat the original relay message.</Say>
  </Gather>
  <Say ${sayAttrs}>No further input received. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

export function buildVoiceRelayAwaitSpeechTwiml({ gatherActionUrl }) {
  const safeAction = escapeXml(String(gatherActionUrl || "").trim());
  const sayAttrs = getTwilioSayAttrs();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" speechTimeout="auto" timeout="7" action="${safeAction}" method="POST">
    <Say ${sayAttrs}>Connection confirmed. Please speak now.</Say>
    <Say ${sayAttrs}>You can press 2 to repeat the original relay message.</Say>
  </Gather>
  <Say ${sayAttrs}>No further input received. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

export function buildVoiceRelayGoodbyeTwiml({ goodbyeText } = {}) {
  const safeGoodbye = String(goodbyeText || "").trim();
  const sayAttrs = getTwilioSayAttrs();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say ${sayAttrs}>${escapeXml(safeGoodbye || "Thank you. Goodbye.")}</Say>
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

function getTwilioSayAttrs() {
  const rawVoice = String(env.twilio.voice || "Polly.Aditi").trim();
  const rawLang = String(env.twilio.voiceLanguage || "en-IN").trim();
  const safeVoice = /^[a-z0-9._-]+$/i.test(rawVoice) ? rawVoice : "Polly.Aditi";
  const safeLang = /^[a-z]{2}-[A-Z]{2}$/.test(rawLang) ? rawLang : "en-IN";
  return `voice="${safeVoice}" language="${safeLang}"`;
}

