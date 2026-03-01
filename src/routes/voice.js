import { Router } from "express";
import { VoiceRelayCall } from "../models/VoiceRelayCall.js";
import {
  buildVoiceRelayGoodbyeTwiml,
  buildVoiceRelayRepeatTwiml,
  buildVoiceRelayTwiml
} from "../services/voiceCallService.js";

const router = Router();

router.post("/twiml/:relayCallId", async (req, res, next) => {
  try {
    const { relayCallId } = req.params;
    const token = String(req.query.t || "");
    const relayCall = await VoiceRelayCall.findById(relayCallId).lean();
    if (!relayCall || !token || token !== relayCall.token) {
      res.status(403).type("text/xml").send(buildVoiceRelayGoodbyeTwiml());
      return;
    }
    const actionUrl = `/api/voice/gather/${relayCallId}?t=${encodeURIComponent(token)}`;
    res.type("text/xml").send(buildVoiceRelayTwiml({ message: relayCall.message, gatherActionUrl: actionUrl }));
  } catch (err) {
    next(err);
  }
});

router.post("/gather/:relayCallId", async (req, res, next) => {
  try {
    const { relayCallId } = req.params;
    const token = String(req.query.t || "");
    const relayCall = await VoiceRelayCall.findById(relayCallId);
    if (!relayCall || !token || token !== relayCall.token) {
      res.status(403).type("text/xml").send(buildVoiceRelayGoodbyeTwiml());
      return;
    }

    const digits = String(req.body?.Digits || "");
    relayCall.lastDigits = digits;
    await relayCall.save();

    if (digits.includes("2")) {
      const actionUrl = `/api/voice/gather/${relayCallId}?t=${encodeURIComponent(token)}`;
      res.type("text/xml").send(buildVoiceRelayRepeatTwiml({ message: relayCall.message, gatherActionUrl: actionUrl }));
      return;
    }

    res.type("text/xml").send(buildVoiceRelayGoodbyeTwiml());
  } catch (err) {
    next(err);
  }
});

export default router;

