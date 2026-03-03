import { WebSocketServer } from "ws";
import { verifyToken } from "../services/authService.js";
import { User } from "../models/User.js";
import { VoiceRelayCall } from "../models/VoiceRelayCall.js";
import { Contact } from "../models/Contact.js";
import { isRealtimeVoiceAgentEnabled, RealtimeVoiceAgentSession } from "../services/realtimeVoiceAgent.js";
import { env } from "../config/env.js";
import { maybeExtractVoiceCallIntelligence } from "../services/voiceIntelligenceService.js";

let wss = null;
let voiceWss = null;
const userSockets = new Map();
const chatSubscribers = new Map();
const voiceStreamState = new Map();
const voiceAgentSessions = new Map();

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // ignore send failure
  }
}

function addSocketToUser(userId, ws) {
  const key = String(userId);
  const set = userSockets.get(key) || new Set();
  set.add(ws);
  userSockets.set(key, set);
}

function removeSocketFromUser(userId, ws) {
  const key = String(userId);
  const set = userSockets.get(key);
  if (!set) return;
  set.delete(ws);
  if (!set.size) userSockets.delete(key);
}

function subscribeToChat(bookingId, ws) {
  const key = String(bookingId);
  const set = chatSubscribers.get(key) || new Set();
  set.add(ws);
  chatSubscribers.set(key, set);
}

function unsubscribeFromChat(bookingId, ws) {
  const key = String(bookingId);
  const set = chatSubscribers.get(key);
  if (!set) return;
  set.delete(ws);
  if (!set.size) chatSubscribers.delete(key);
}

function detachSocketEverywhere(ws) {
  for (const [, set] of chatSubscribers) {
    set.delete(ws);
  }
  for (const [key, set] of chatSubscribers) {
    if (!set.size) chatSubscribers.delete(key);
  }
}

export function initRealtime(server) {
  if (wss && voiceWss) return wss;
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const token = String(url.searchParams.get("token") || "");
      const payload = verifyToken(token);
      if (!payload?.sub) {
        ws.close(1008, "Unauthorized");
        return;
      }
      const user = await User.findById(payload.sub).select("_id").lean();
      if (!user?._id) {
        ws.close(1008, "Unauthorized");
        return;
      }

      ws.userId = String(user._id);
      addSocketToUser(ws.userId, ws);
      safeSend(ws, { type: "ws_ready", payload: { userId: ws.userId } });

      ws.on("message", (raw) => {
        let msg = null;
        try {
          msg = JSON.parse(String(raw || ""));
        } catch {
          msg = null;
        }
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "subscribe_chat" && msg.bookingId) {
          subscribeToChat(msg.bookingId, ws);
          safeSend(ws, { type: "chat_subscribed", payload: { bookingId: String(msg.bookingId) } });
          return;
        }
        if (msg.type === "unsubscribe_chat" && msg.bookingId) {
          unsubscribeFromChat(msg.bookingId, ws);
          safeSend(ws, { type: "chat_unsubscribed", payload: { bookingId: String(msg.bookingId) } });
          return;
        }
        if (msg.type === "ping") {
          safeSend(ws, { type: "pong", payload: { ts: Date.now() } });
        }
      });

      ws.on("close", () => {
        removeSocketFromUser(ws.userId, ws);
        detachSocketEverywhere(ws);
      });
    } catch {
      try {
        ws.close(1011, "Socket init error");
      } catch {
        // ignore
      }
    }
  });

  voiceWss = new WebSocketServer({ server, path: "/ws/voice-relay" });
  voiceWss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const preRelayCallId = String(url.searchParams.get("relayCallId") || "");
      const preToken = String(url.searchParams.get("t") || "");
      let preValidatedRelayCall = null;
      if (preRelayCallId && preToken) {
        const found = await VoiceRelayCall.findById(preRelayCallId).select("_id token userId contactId callSid message").lean();
        if (found?._id && preToken === found.token) {
          preValidatedRelayCall = found;
          ws.relayCallId = String(found._id);
        }
      }
      let relayCall = null;
      ws.relayCallId = ws.relayCallId || "";
      let realtimeSession = null;

      ws.on("message", async (raw) => {
        let evt = null;
        try {
          evt = JSON.parse(String(raw || ""));
        } catch {
          evt = null;
        }
        if (!evt || typeof evt !== "object") return;
        const state = voiceStreamState.get(ws.relayCallId || "__pending__") || {
          streamSid: "",
          mediaPacketCount: 0,
          startedAt: null,
          stoppedAt: null
        };

        if (evt.event === "start") {
          const params = evt.start?.customParameters || {};
          const relayCallId = String(params.relayCallId || "");
          const token = String(params.t || "");
          if (relayCallId && token) {
            relayCall = await VoiceRelayCall.findById(relayCallId).select("_id token userId contactId callSid message").lean();
          } else {
            relayCall = preValidatedRelayCall;
          }
          const isAuthorized =
            Boolean(relayCall?._id) &&
            ((token && token === relayCall.token) || (!token && Boolean(preValidatedRelayCall?._id)));
          if (!isAuthorized) {
            console.log("[VOICE-RT] unauthorized stream start, closing socket");
            ws.close(1008, "Unauthorized");
            return;
          }
          ws.relayCallId = String(relayCall._id || ws.relayCallId);
          state.streamSid = String(evt.start?.streamSid || "");
          state.startedAt = new Date();
          console.log(`[VOICE-RT] twilio stream start relayCallId=${ws.relayCallId} streamSid=${state.streamSid || "n/a"}`);
          voiceStreamState.set(ws.relayCallId, state);
          await VoiceRelayCall.findByIdAndUpdate(ws.relayCallId, {
            $set: {
              streamSid: state.streamSid,
              streamStartedAt: state.startedAt,
              status: "in_progress"
            },
            $push: {
              statusTimeline: {
                status: "in_progress",
                source: "realtime_start",
                details: "Bidirectional stream started.",
                at: new Date()
              }
            }
          });
          if (isRealtimeVoiceAgentEnabled() && env.twilio.enableBidirectionalStream) {
            const [freshRelay, contact, user] = await Promise.all([
              VoiceRelayCall.findById(ws.relayCallId).lean(),
              Contact.findById(relayCall.contactId).lean(),
              User.findById(relayCall.userId).lean()
            ]);
            realtimeSession = new RealtimeVoiceAgentSession({
              relayCall: freshRelay || relayCall,
              twilioWs: ws,
              streamSid: state.streamSid,
              userName: String(user?.name || ""),
              contactName: String(contact?.name || ""),
              onUpdate: async (patch) => {
                const setPatch = {};
                if (typeof patch.turnCount === "number") setPatch.turnCount = patch.turnCount;
                if (typeof patch.lastSpeech === "string") setPatch.lastSpeech = patch.lastSpeech;
                if (typeof patch.status === "string") setPatch.status = patch.status;
                if (Array.isArray(patch.turns)) setPatch.turns = patch.turns;
                await VoiceRelayCall.findByIdAndUpdate(ws.relayCallId, {
                  $set: setPatch
                });
              },
              onClose: () => {
                voiceAgentSessions.delete(ws.relayCallId);
              }
            });
            voiceAgentSessions.set(ws.relayCallId, realtimeSession);
            await realtimeSession.start();
            console.log(`[VOICE-RT] realtime agent attached relayCallId=${ws.relayCallId}`);
          }
          return;
        }

        if (evt.event === "media") {
          if (!ws.relayCallId) return;
          state.mediaPacketCount = Number(state.mediaPacketCount || 0) + 1;
          voiceStreamState.set(ws.relayCallId, state);
          if (realtimeSession && evt.media?.payload) {
            realtimeSession.ingestAudioBase64(evt.media.payload);
          }
          if (state.mediaPacketCount % 40 === 0) {
            console.log(`[VOICE-RT] media packets relayCallId=${ws.relayCallId} count=${state.mediaPacketCount}`);
            await VoiceRelayCall.findByIdAndUpdate(ws.relayCallId, {
              $set: {
                mediaPacketCount: state.mediaPacketCount
              }
            });
          }
          return;
        }

        if (evt.event === "stop") {
          if (!ws.relayCallId) return;
          state.stoppedAt = new Date();
          console.log(`[VOICE-RT] twilio stream stop relayCallId=${ws.relayCallId} packets=${state.mediaPacketCount}`);
          voiceStreamState.set(ws.relayCallId, state);
          if (realtimeSession) realtimeSession.close();
          await VoiceRelayCall.findByIdAndUpdate(ws.relayCallId, {
            $set: {
              streamStoppedAt: state.stoppedAt,
              mediaPacketCount: state.mediaPacketCount,
              status: "completed",
              terminalStatus: "completed"
            },
            $push: {
              statusTimeline: {
                status: "completed",
                source: "realtime_stop",
                details: "Bidirectional stream stopped.",
                at: new Date()
              }
            }
          });
          await maybeExtractVoiceCallIntelligence(ws.relayCallId);
          return;
        }
      });

      ws.on("close", async () => {
        console.log(`[VOICE-RT] ws close relayCallId=${ws.relayCallId}`);
        if (realtimeSession) realtimeSession.close();
        if (!ws.relayCallId) return;
        const state = voiceStreamState.get(ws.relayCallId);
        if (state) {
          const stoppedAt = state.stoppedAt || new Date();
          const existing = await VoiceRelayCall.findById(ws.relayCallId).select("terminalStatus").lean();
          const currentTerminal = String(existing?.terminalStatus || "");
          const isTerminal = ["completed", "rejected", "no_pickup", "cancelled", "failed"].includes(currentTerminal);
          await VoiceRelayCall.findByIdAndUpdate(ws.relayCallId, {
            $set: {
              mediaPacketCount: state.mediaPacketCount,
              streamStoppedAt: stoppedAt,
              ...(isTerminal ? {} : { status: "completed", terminalStatus: "completed" })
            },
            ...(isTerminal
              ? {}
              : {
                  $push: {
                    statusTimeline: {
                      status: "completed",
                      source: "realtime_close",
                      details: "Socket closed; marked completed.",
                      at: new Date()
                    }
                  }
                })
          });
          await maybeExtractVoiceCallIntelligence(ws.relayCallId);
          voiceStreamState.delete(ws.relayCallId);
        } else {
          // No in-memory stream state found, but socket closed for this relay call.
          // Mark terminal to avoid stale "in progress" status.
          const existing = await VoiceRelayCall.findById(ws.relayCallId).select("terminalStatus").lean();
          const currentTerminal = String(existing?.terminalStatus || "");
          const isTerminal = ["completed", "rejected", "no_pickup", "cancelled", "failed"].includes(currentTerminal);
          if (!isTerminal) {
            await VoiceRelayCall.findByIdAndUpdate(ws.relayCallId, {
              $set: { status: "completed", terminalStatus: "completed", streamStoppedAt: new Date() },
              $push: {
                statusTimeline: {
                  status: "completed",
                  source: "realtime_close",
                  details: "Socket closed without stream state; marked completed.",
                  at: new Date()
                }
              }
            });
          }
          await maybeExtractVoiceCallIntelligence(ws.relayCallId);
        }
        voiceAgentSessions.delete(ws.relayCallId);
      });
    } catch {
      try {
        ws.close(1011, "Voice socket init error");
      } catch {
        // ignore
      }
    }
  });

  return wss;
}

export function emitToUsers(userIds, event, payload = {}) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const uniq = [...new Set(ids.filter(Boolean).map((x) => String(x)))];
  for (const id of uniq) {
    const set = userSockets.get(id);
    if (!set || !set.size) continue;
    for (const ws of set) {
      safeSend(ws, { type: event, payload });
    }
  }
}

export function emitToChat(bookingId, event, payload = {}, userIds = []) {
  const key = String(bookingId);
  const set = chatSubscribers.get(key);
  if (set && set.size) {
    for (const ws of set) {
      safeSend(ws, { type: event, payload: { ...payload, bookingId: key } });
    }
  }
  if (Array.isArray(userIds) && userIds.length) {
    emitToUsers(
      userIds,
      event,
      { ...payload, bookingId: key }
    );
  }
}

export function emitGlobal(event, payload = {}) {
  for (const [, set] of userSockets) {
    for (const ws of set) {
      safeSend(ws, { type: event, payload });
    }
  }
}
