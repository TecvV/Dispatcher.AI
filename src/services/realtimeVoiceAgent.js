import { WebSocket } from "ws";
import { env } from "../config/env.js";
import { generateVoiceCallConversationTurn, verifyVoiceReplySafety } from "./llm.js";
import { terminateTwilioCall } from "./voiceCallService.js";

export function isRealtimeVoiceAgentEnabled() {
  return Boolean(
    env.twilio.enableRealtimeStream &&
      env.voiceAI.enabled &&
      env.voiceAI.deepgramApiKey &&
      env.voiceAI.elevenLabsApiKey &&
      env.voiceAI.elevenLabsVoiceId
  );
}

export class RealtimeVoiceAgentSession {
  constructor({ relayCall, twilioWs, streamSid, userName, contactName, onUpdate, onClose }) {
    this.relayCall = relayCall;
    this.twilioWs = twilioWs;
    this.streamSid = streamSid;
    this.userName = userName;
    this.contactName = contactName;
    this.onUpdate = onUpdate;
    this.onClose = onClose;
    this.deepgramWs = null;
    this.turns = [];
    this.turnCount = 0;
    this.closed = false;
    this.processingTranscript = false;
  }

  async start() {
    console.log(`[VOICE-RT] session start relayCallId=${this.relayCall?._id || "unknown"} streamSid=${this.streamSid || "pending"}`);
    this.deepgramWs = new WebSocket(env.voiceAI.deepgramWsUrl, {
      headers: {
        Authorization: `Token ${env.voiceAI.deepgramApiKey}`
      }
    });

    this.deepgramWs.on("open", async () => {
      console.log(`[VOICE-RT] deepgram connected relayCallId=${this.relayCall?._id || "unknown"}`);
      const greeting = `Hello. This is an automated call relay from Dispatcher A I. ${this.relayCall.message} You can speak now.`;
      await this.speak(greeting);
    });

    this.deepgramWs.on("message", async (raw) => {
      if (this.closed) return;
      let payload = null;
      try {
        payload = JSON.parse(String(raw || ""));
      } catch {
        payload = null;
      }
      if (!payload || payload.type !== "Results") return;
      const alt = payload.channel?.alternatives?.[0];
      const transcript = String(alt?.transcript || "").trim();
      const isFinal = Boolean(payload.is_final);
      if (!transcript || !isFinal) return;
      console.log(`[VOICE-RT] transcript relayCallId=${this.relayCall?._id || "unknown"} text="${transcript.slice(0, 140)}"`);
      await this.handleTranscript(transcript);
    });

    this.deepgramWs.on("close", () => {
      console.log(`[VOICE-RT] deepgram disconnected relayCallId=${this.relayCall?._id || "unknown"}`);
      this.deepgramWs = null;
    });
  }

  ingestAudioBase64(base64Payload) {
    if (this.closed || !this.deepgramWs || this.deepgramWs.readyState !== 1) return;
    try {
      const audio = Buffer.from(String(base64Payload || ""), "base64");
      if (!audio.length) return;
      this.deepgramWs.send(audio);
    } catch {
      // ignore malformed media frame
    }
  }

  async handleTranscript(transcript) {
    if (this.closed || this.processingTranscript) return;
    this.processingTranscript = true;
    try {
      const decision = await generateVoiceCallConversationTurn({
        relayMessage: this.relayCall.message,
        callerUtterance: transcript,
        recentTurns: this.turns,
        userName: this.userName,
        contactName: this.contactName
      });
      const draftReply = String(decision?.reply || "").trim() || "I heard you. Please continue if needed.";
      const verified = await verifyVoiceReplySafety({
        draftReply,
        relayMessage: this.relayCall.message,
        callerUtterance: transcript,
        userName: this.userName,
        contactName: this.contactName
      });
      const reply = String(verified?.safeReply || draftReply).trim() || "I heard you. Please continue if needed.";
      const endCall = Boolean(decision?.endCall);
      console.log(
        `[VOICE-RT] llm reply relayCallId=${this.relayCall?._id || "unknown"} endCall=${endCall} adjusted=${Boolean(
          verified?.isAdjusted
        )} text="${reply.slice(0, 140)}"`
      );

      this.turns.push(
        { role: "caller", text: transcript, at: new Date() },
        { role: "assistant", text: reply, at: new Date() }
      );
      this.turns = this.turns.slice(-40);
      this.turnCount += 1;
      await this.onUpdate?.({
        turnCount: this.turnCount,
        turns: this.turns,
        lastSpeech: transcript,
        status: endCall ? "completed" : "in_progress"
      });

      await this.speak(reply);
      if (endCall || this.turnCount >= 8) {
        console.log(`[VOICE-RT] ending call relayCallId=${this.relayCall?._id || "unknown"} reason=${endCall ? "semantic_end" : "max_turns"}`);
        await terminateTwilioCall(this.relayCall.callSid);
        this.close();
      }
    } finally {
      this.processingTranscript = false;
    }
  }

  async speak(text) {
    if (this.closed || !this.twilioWs || this.twilioWs.readyState !== 1) return;
    const audioUlaw = await synthesizeUlawAudio(text);
    if (!audioUlaw) {
      console.log(`[VOICE-RT] tts empty relayCallId=${this.relayCall?._id || "unknown"}`);
      return;
    }
    console.log(`[VOICE-RT] tts send relayCallId=${this.relayCall?._id || "unknown"} bytes=${audioUlaw.length}`);
    this.twilioWs.send(
      JSON.stringify({
        event: "media",
        streamSid: this.streamSid,
        media: { payload: audioUlaw.toString("base64") }
      })
    );
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    console.log(`[VOICE-RT] session close relayCallId=${this.relayCall?._id || "unknown"}`);
    try {
      if (this.deepgramWs && this.deepgramWs.readyState === 1) this.deepgramWs.close();
    } catch {
      // ignore
    }
    this.onClose?.();
  }
}

async function synthesizeUlawAudio(text) {
  const input = String(text || "").trim();
  if (!input) return null;
  const voiceId = env.voiceAI.elevenLabsVoiceId;
  const endpoint = `${env.voiceAI.elevenLabsBaseUrl}/text-to-speech/${encodeURIComponent(
    voiceId
  )}?output_format=ulaw_8000`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "xi-api-key": env.voiceAI.elevenLabsApiKey,
      "Content-Type": "application/json",
      Accept: "audio/basic"
    },
    body: JSON.stringify({
      text: input,
      model_id: env.voiceAI.elevenLabsModelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  });
  if (!res.ok) {
    console.log(`[VOICE-RT] tts request failed status=${res.status}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length ? buf : null;
}
