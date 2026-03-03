import { Router } from "express";
import { VoiceRelayCall } from "../models/VoiceRelayCall.js";
import {
  buildVoiceRelayAwaitSpeechTwiml,
  buildVoiceRelayGoodbyeTwiml,
  buildVoiceRelayRepeatTwiml,
  buildVoiceRelayTurnTwiml,
  buildVoiceRelayTwiml,
  buildVoiceStreamUrl
} from "../services/voiceCallService.js";
import { generateVoiceCallConversationTurn, verifyVoiceReplySafety } from "../services/llm.js";
import { Contact } from "../models/Contact.js";
import { User } from "../models/User.js";
import { isRealtimeVoiceAgentEnabled } from "../services/realtimeVoiceAgent.js";
import { env } from "../config/env.js";
import { maybeExtractVoiceCallIntelligence, normalizeCallStatus } from "../services/voiceIntelligenceService.js";

const router = Router();
const MAX_VOICE_TURNS = 8;

function getSpeechText(req) {
  return String(req.body?.SpeechResult || req.body?.UnstableSpeechResult || "").trim();
}

router.post("/twiml/:relayCallId", async (req, res, next) => {
  try {
    const { relayCallId } = req.params;
    const token = String(req.query.t || "");
    const relayCall = await VoiceRelayCall.findById(relayCallId).lean();
    if (!relayCall || !token || token !== relayCall.token) {
      res.status(403).type("text/xml").send(buildVoiceRelayGoodbyeTwiml());
      return;
    }
    const actionUrl = `/api/voice/turn/${relayCallId}?t=${encodeURIComponent(token)}`;
    const streamUrl = buildVoiceStreamUrl({ relayCallId, token });
    await VoiceRelayCall.findByIdAndUpdate(relayCallId, {
      $set: { status: "ringing" },
      $push: {
        statusTimeline: { status: "ringing", source: "twiml", details: "Twilio requested TwiML.", at: new Date() }
      }
    });
    res
      .type("text/xml")
      .send(
        buildVoiceRelayTwiml({
          message: relayCall.message,
          gatherActionUrl: actionUrl,
          streamUrl,
          relayCallId,
          token,
          bidirectionalStream: isRealtimeVoiceAgentEnabled() && env.twilio.enableBidirectionalStream
        })
      );
  } catch (err) {
    next(err);
  }
});

router.post("/turn/:relayCallId", async (req, res, next) => {
  try {
    const { relayCallId } = req.params;
    const token = String(req.query.t || "");
    const relayCall = await VoiceRelayCall.findById(relayCallId);
    if (!relayCall || !token || token !== relayCall.token) {
      res.status(403).type("text/xml").send(buildVoiceRelayGoodbyeTwiml());
      return;
    }

    const digits = String(req.body?.Digits || "");
    const speech = getSpeechText(req);
    relayCall.lastDigits = digits;
    relayCall.lastSpeech = speech;
    if (String(relayCall.status || "") !== "in_progress") {
      relayCall.status = "in_progress";
      relayCall.statusTimeline = Array.isArray(relayCall.statusTimeline) ? relayCall.statusTimeline : [];
      relayCall.statusTimeline.push({
        status: "in_progress",
        source: "turn",
        details: "Contact started talking.",
        at: new Date()
      });
    }
    await relayCall.save();

    if (digits.includes("2")) {
      const actionUrl = `/api/voice/turn/${relayCallId}?t=${encodeURIComponent(token)}`;
      res.type("text/xml").send(buildVoiceRelayRepeatTwiml({ message: relayCall.message, gatherActionUrl: actionUrl }));
      return;
    }

    // Twilio trial/anti-robocall screening can require "press any key to accept".
    // If we receive non-control DTMF without speech, keep call alive and prompt to speak.
    if (!speech && digits && !digits.includes("2")) {
      const actionUrl = `/api/voice/turn/${relayCallId}?t=${encodeURIComponent(token)}`;
      res.type("text/xml").send(buildVoiceRelayAwaitSpeechTwiml({ gatherActionUrl: actionUrl }));
      return;
    }

    if (!speech) {
      await VoiceRelayCall.findByIdAndUpdate(relayCallId, {
        $set: { status: "completed", terminalStatus: "completed" },
        $push: {
          statusTimeline: { status: "completed", source: "turn", details: "No speech received. Call closed.", at: new Date() }
        }
      });
      await maybeExtractVoiceCallIntelligence(relayCallId);
      res.type("text/xml").send(buildVoiceRelayGoodbyeTwiml({ goodbyeText: "No speech received. Goodbye." }));
      return;
    }

    const [contact, user] = await Promise.all([
      Contact.findById(relayCall.contactId).lean(),
      User.findById(relayCall.userId).lean()
    ]);
    const priorTurns = Array.isArray(relayCall.turns) ? relayCall.turns : [];
    const turnCount = Number(relayCall.turnCount || 0);
    const turnDecision = await generateVoiceCallConversationTurn({
      relayMessage: relayCall.message,
      callerUtterance: speech,
      recentTurns: priorTurns,
      userName: user?.name || "",
      contactName: contact?.name || ""
    });
    const draftReply = String(turnDecision?.reply || "").trim();
    const verified = await verifyVoiceReplySafety({
      draftReply,
      relayMessage: relayCall.message,
      callerUtterance: speech,
      userName: user?.name || "",
      contactName: contact?.name || ""
    });
    const reply = String(verified?.safeReply || draftReply).trim();
    const shouldEnd = Boolean(turnDecision?.endCall);

    const updateDoc = {
      $set: {
        turnCount: turnCount + 1,
        status: shouldEnd || turnCount + 1 >= MAX_VOICE_TURNS ? "completed" : "in_progress",
        terminalStatus: shouldEnd || turnCount + 1 >= MAX_VOICE_TURNS ? "completed" : String(relayCall.terminalStatus || "")
      },
      $push: {
        turns: {
          $each: [
            { role: "caller", text: speech, at: new Date() },
            { role: "assistant", text: reply, at: new Date() }
          ],
          $slice: -40
        }
      }
    };
    if (shouldEnd || turnCount + 1 >= MAX_VOICE_TURNS) {
      updateDoc.$push.statusTimeline = {
        status: "completed",
        source: "turn",
        details: "Conversation ended.",
        at: new Date()
      };
    }
    await VoiceRelayCall.findByIdAndUpdate(relayCallId, updateDoc);

    if (shouldEnd || turnCount + 1 >= MAX_VOICE_TURNS) {
      await maybeExtractVoiceCallIntelligence(relayCallId);
      res
        .type("text/xml")
        .send(
          buildVoiceRelayGoodbyeTwiml({
            goodbyeText: reply || "Thank you for sharing. Ending the call now. Goodbye."
          })
        );
      return;
    }

    const actionUrl = `/api/voice/turn/${relayCallId}?t=${encodeURIComponent(token)}`;
    res.type("text/xml").send(buildVoiceRelayTurnTwiml({ reply, gatherActionUrl: actionUrl }));
  } catch (err) {
    next(err);
  }
});

router.post("/status/:relayCallId", async (req, res, next) => {
  try {
    const { relayCallId } = req.params;
    const token = String(req.query.t || "");
    const relayCall = await VoiceRelayCall.findById(relayCallId).lean();
    if (!relayCall) {
      res.status(403).json({ ok: false });
      return;
    }
    const callbackSid = String(req.body?.CallSid || "").trim();
    const tokenOk = Boolean(token) && token === relayCall.token;
    const sidOk = Boolean(callbackSid) && callbackSid === String(relayCall.callSid || "");
    // Do not reject Twilio lifecycle callbacks just because token/sid mismatch.
    // We prefer eventual consistency for terminal state over strict callback auth here.
    if (!tokenOk && !sidOk) {
      console.warn(
        `[VOICE-STATUS] auth mismatch accepted relayCallId=${relayCallId} callSid=${callbackSid || "n/a"}`
      );
    }
    const twilioStatus = String(req.body?.CallStatus || "").trim();
    const normalized = normalizeCallStatus(twilioStatus);
    const terminal = ["completed", "rejected", "no_pickup", "cancelled", "failed"].includes(normalized);
    const existingTerminal = String(relayCall.terminalStatus || "");
    const existingIsTerminal = ["completed", "rejected", "no_pickup", "cancelled", "failed"].includes(existingTerminal);
    const finalStatus = existingIsTerminal && !terminal ? existingTerminal : normalized;
    const finalTerminalStatus = terminal
      ? normalized
      : existingIsTerminal
      ? existingTerminal
      : String(relayCall.terminalStatus || "");
    await VoiceRelayCall.findByIdAndUpdate(relayCallId, {
      $set: {
        status: finalStatus,
        terminalStatus: finalTerminalStatus
      },
      $push: {
        statusTimeline: {
          status: finalStatus,
          source: "twilio_status",
          details: `Twilio status: ${twilioStatus || "unknown"}`,
          at: new Date()
        }
      }
    });
    if (["completed", "rejected", "no_pickup", "cancelled", "failed"].includes(finalTerminalStatus)) {
      await maybeExtractVoiceCallIntelligence(relayCallId);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Backward compatibility for older Twilio callbacks that still hit /gather
router.post("/gather/:relayCallId", async (req, res, next) => {
  req.url = req.url.replace("/gather/", "/turn/");
  router.handle(req, res, next);
});

export default router;

