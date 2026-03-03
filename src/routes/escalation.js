import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { EscalationListener } from "../models/EscalationListener.js";
import { EscalationSession } from "../models/EscalationSession.js";
import { analyzeSessionEmpathy } from "../services/empathyAuditService.js";
import { EscalationBooking } from "../models/EscalationBooking.js";
import { EscalationSlot } from "../models/EscalationSlot.js";
import { EscalationChatSession } from "../models/EscalationChatSession.js";
import { EscalationChatMessage } from "../models/EscalationChatMessage.js";
import { WellnessLog } from "../models/WellnessLog.js";
import { getValidGoogleAccessToken } from "../services/googleTokenService.js";
import { createGoogleMeetAtDateTime } from "../services/calendarService.js";
import { auditListenerSupportQuality, summarizeEscalationTakeaways } from "../services/llm.js";
import { fetchMeetParticipantDwell } from "../services/googleMeetAuditService.js";
import { env } from "../config/env.js";
import { emitGlobal, emitToChat, emitToUsers } from "../realtime/hub.js";

const router = Router();
router.use(requireAuth);
const ESCALATION_SESSION_DURATION_MS = 30 * 60 * 1000;
const PREMIUM_MIN_RATED_SESSIONS = 10;

function clampRating(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1, Math.min(5, n));
}

const LISTENER_RATING_KEYS = ["empathy", "politeness", "patience", "engagement", "connection", "tipsQuality"];

function getWalletBalanceInr(userDoc) {
  const balance = Number(userDoc?.mockWallet?.balanceInr);
  if (!Number.isFinite(balance)) return 1000;
  return balance;
}

async function debitSpeakerAndHoldEscrow({ speakerUserId, listenerUserId, amountInr, booking }) {
  const safeAmount = Math.max(0, Number(amountInr || 0));
  if (!safeAmount) {
    booking.payment = {
      amountInr: 0,
      escrowAmountInr: 0,
      status: "UNPAID",
      refundedInr: 0,
      paidAt: null,
      releasedAt: null,
      refundedAt: null,
      settlementReason: ""
    };
    return;
  }
  const [speaker, listener] = await Promise.all([User.findById(speakerUserId), User.findById(listenerUserId)]);
  if (!speaker || !listener) throw new Error("Speaker or listener user not found for payment.");

  const current = getWalletBalanceInr(speaker);
  if (current < safeAmount) {
    const shortfall = Number((safeAmount - current).toFixed(2));
    throw new Error(`Insufficient mock wallet balance. Add Rs ${shortfall} and retry.`);
  }
  speaker.mockWallet = speaker.mockWallet || {};
  speaker.mockWallet.balanceInr = Number((current - safeAmount).toFixed(2));
  await speaker.save();

  booking.payment = {
    amountInr: safeAmount,
    escrowAmountInr: safeAmount,
    status: "PAID_HELD",
    refundedInr: 0,
    paidAt: new Date(),
    releasedAt: null,
    refundedAt: null,
    settlementReason: ""
  };
}

async function settleBookingPayment({ booking, mode, reason, commissionPct = 0, payoutPct = null }) {
  if (!booking?.payment || String(booking.payment.status) !== "PAID_HELD") return;
  const amount = Number(booking.payment.amountInr || 0);
  if (!amount) return;
  const speaker = await User.findById(booking.speakerUserId);
  const listener = await User.findById(booking.listenerUserId);
  if (!speaker || !listener) return;
  speaker.mockWallet = speaker.mockWallet || {};
  listener.mockWallet = listener.mockWallet || {};
  const speakerCurrent = getWalletBalanceInr(speaker);
  const listenerCurrent = getWalletBalanceInr(listener);

  if (mode === "RELEASE" || mode === "RELEASE_FULL") {
    listener.mockWallet.balanceInr = Number((listenerCurrent + amount).toFixed(2));
    booking.payment.escrowAmountInr = 0;
    booking.payment.status = "RELEASED";
    booking.payment.releasedAt = new Date();
    booking.payment.settlementReason = reason || "Session completed successfully.";
    await Promise.all([speaker.save(), listener.save()]);
    return;
  }

  if (mode === "RELEASE_WITH_COMMISSION") {
    const pct = Math.max(0, Math.min(100, Number(commissionPct || 0)));
    const listenerPayout = Number((amount * ((100 - pct) / 100)).toFixed(2));
    listener.mockWallet.balanceInr = Number((listenerCurrent + listenerPayout).toFixed(2));
    booking.payment.escrowAmountInr = 0;
    booking.payment.status = "RELEASED";
    booking.payment.releasedAt = new Date();
    booking.payment.refundedInr = 0;
    booking.payment.settlementReason =
      reason || `Session released to listener after ${pct}% platform commission.`;
    await Promise.all([speaker.save(), listener.save()]);
    return;
  }

  if (mode === "SPLIT_50") {
    const speakerRefund = Number((amount * 0.5).toFixed(2));
    const listenerPayout = Number((amount - speakerRefund).toFixed(2));
    speaker.mockWallet.balanceInr = Number((speakerCurrent + speakerRefund).toFixed(2));
    listener.mockWallet.balanceInr = Number((listenerCurrent + listenerPayout).toFixed(2));
    booking.payment.escrowAmountInr = 0;
    booking.payment.refundedInr = speakerRefund;
    booking.payment.refundedAt = new Date();
    booking.payment.releasedAt = new Date();
    booking.payment.status = "PARTIAL_REFUNDED";
    booking.payment.settlementReason = reason || "Split settlement: 50% refund to speaker, 50% payout to listener.";
    await Promise.all([speaker.save(), listener.save()]);
    return;
  }

  if (mode === "SPLIT_BY_SCORE") {
    const pct = Math.max(0, Math.min(1, Number(payoutPct || 0)));
    const listenerPayout = Number((amount * pct).toFixed(2));
    const speakerRefund = Number((amount - listenerPayout).toFixed(2));
    speaker.mockWallet.balanceInr = Number((speakerCurrent + speakerRefund).toFixed(2));
    listener.mockWallet.balanceInr = Number((listenerCurrent + listenerPayout).toFixed(2));
    booking.payment.escrowAmountInr = 0;
    booking.payment.refundedInr = speakerRefund;
    booking.payment.refundedAt = speakerRefund > 0 ? new Date() : booking.payment.refundedAt || null;
    booking.payment.releasedAt = listenerPayout > 0 ? new Date() : booking.payment.releasedAt || null;
    booking.payment.status = speakerRefund > 0 && listenerPayout > 0 ? "PARTIAL_REFUNDED" : listenerPayout > 0 ? "RELEASED" : "REFUNDED";
    booking.payment.settlementReason =
      reason ||
      `Score-proportional settlement: listener received ${Math.round(pct * 100)}%, speaker refunded ${Math.round(
        (1 - pct) * 100
      )}%.`;
    await Promise.all([speaker.save(), listener.save()]);
    return;
  }

  const refundAmount = mode === "REFUND_50" ? Number((amount * 0.5).toFixed(2)) : amount;
  speaker.mockWallet.balanceInr = Number((speakerCurrent + refundAmount).toFixed(2));
  booking.payment.escrowAmountInr = Number((amount - refundAmount).toFixed(2));
  booking.payment.refundedInr = refundAmount;
  booking.payment.refundedAt = new Date();
  booking.payment.status = mode === "REFUND_50" ? "PARTIAL_REFUNDED" : "REFUNDED";
  booking.payment.settlementReason = reason || "Refund applied.";
  await Promise.all([speaker.save(), listener.save()]);
}

function normalizeScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 10) return 10;
  return Number(n.toFixed(2));
}

function computeSessionRatingFromBreakdown(breakdown = {}) {
  const values = LISTENER_RATING_KEYS.map((k) => normalizeScore(breakdown[k])).filter((x) => x !== null);
  if (!values.length) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Number(avg.toFixed(2));
}

async function recomputeListenerPremiumEligibility(listenerUserId) {
  const rated = await EscalationBooking.find({
    listenerUserId,
    speakerSessionRating: { $ne: null }
  })
    .select("speakerSessionRating")
    .lean();
  const count = rated.length;
  const avg = count
    ? Number((rated.reduce((a, r) => a + Number(r.speakerSessionRating || 0), 0) / count).toFixed(2))
    : 0;
  const premiumEligible = count >= PREMIUM_MIN_RATED_SESSIONS && avg >= 7;
  await EscalationListener.findOneAndUpdate(
    { userId: listenerUserId },
    {
      $set: {
        totalRatedSessions: count,
        averageSatisfaction: avg,
        walletUnlocked: premiumEligible
      }
    }
  );
  return { count, avg, premiumEligible };
}

function clampAuditScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Number(n.toFixed(2))));
}

async function reconcileCompletedChatSettlementsByScore() {
  const bookings = await EscalationBooking.find({
    mode: "chat",
    status: "completed",
    "payment.amountInr": { $gt: 0 }
  })
    .select("speakerUserId listenerUserId payment listenerAudit")
    .limit(2000);

  for (const booking of bookings) {
    const amount = Number(booking.payment?.amountInr || 0);
    if (!amount) continue;
    const reason = String(booking.payment?.settlementReason || "");

    const currentSpeaker = Number(booking.payment?.refundedInr || 0);
    const currentListener = Number((amount - currentSpeaker).toFixed(2));

    let score = clampAuditScore(booking.listenerAudit?.engagementScore);
    if (score === null) {
      // Backward-safe fallback for old records where audit score was not stored.
      score = clampAuditScore((currentListener / amount) * 10) ?? 0;
    }
    const payoutPct = score / 10;
    const targetListener = Number((amount * payoutPct).toFixed(2));
    const targetSpeaker = Number((amount - targetListener).toFixed(2));

    const deltaSpeaker = Number((targetSpeaker - currentSpeaker).toFixed(2));
    const deltaListener = Number((targetListener - currentListener).toFixed(2));
    if (deltaSpeaker !== 0 || deltaListener !== 0) {
      const [speaker, listener] = await Promise.all([
        User.findById(booking.speakerUserId),
        User.findById(booking.listenerUserId)
      ]);
      if (speaker && listener) {
        speaker.mockWallet = speaker.mockWallet || {};
        listener.mockWallet = listener.mockWallet || {};
        speaker.mockWallet.balanceInr = Number((getWalletBalanceInr(speaker) + deltaSpeaker).toFixed(2));
        listener.mockWallet.balanceInr = Number((getWalletBalanceInr(listener) + deltaListener).toFixed(2));
        await Promise.all([speaker.save(), listener.save()]);
      }
    }

    booking.listenerAudit = {
      engagementScore: score,
      intents: Array.isArray(booking.listenerAudit?.intents) ? booking.listenerAudit.intents : [],
      verdict: String(booking.listenerAudit?.verdict || "Chat settlement reconciled by score."),
      notes: String(booking.listenerAudit?.notes || ""),
      evaluatedAt: booking.listenerAudit?.evaluatedAt || new Date()
    };

    booking.payment.escrowAmountInr = 0;
    booking.payment.refundedInr = targetSpeaker;
    booking.payment.refundedAt = targetSpeaker > 0 ? booking.payment.refundedAt || new Date() : null;
    booking.payment.releasedAt = targetListener > 0 ? booking.payment.releasedAt || new Date() : null;
    booking.payment.status = targetSpeaker > 0 && targetListener > 0 ? "PARTIAL_REFUNDED" : targetListener > 0 ? "RELEASED" : "REFUNDED";
    booking.payment.settlementReason =
      `Chat settlement by AI audit score ${score.toFixed(2)}/10. ` +
      `Listener payout ${Math.round(payoutPct * 100)}% (Rs ${targetListener}) and speaker refund ${Math.round(
        (1 - payoutPct) * 100
      )}% (Rs ${targetSpeaker}).`;
    if (booking.payment.settlementReason.includes("[CHAT_SCORE_RULE]")) {
      booking.payment.settlementReason = booking.payment.settlementReason.replace("[CHAT_SCORE_RULE]", "").trim();
    }
    await booking.save();
  }
}

function canAccessChatSession(session, booking, userId) {
  const isSpeaker = String(booking.speakerUserId) === String(userId);
  const isListener = String(booking.listenerUserId) === String(userId);
  if (!isSpeaker && !isListener) return { ok: false, reason: "Not a participant." };
  const sessionEndAt = new Date(new Date(session.scheduledAt).getTime() + ESCALATION_SESSION_DURATION_MS);
  if (session.speakerPurgedAt) return { ok: false, reason: "Chat was purged by speaker." };
  if (session.status === "scheduled" && new Date() < new Date(session.scheduledAt)) {
    return { ok: false, reason: "Chat becomes active at scheduled time." };
  }
  if (new Date() >= sessionEndAt && session.status !== "ended" && session.status !== "purged") {
    return { ok: false, reason: "Chat session window is over." };
  }
  if (session.retentionExpiry && new Date() >= new Date(session.retentionExpiry)) {
    return { ok: false, reason: "Chat retention window has ended." };
  }
  return { ok: true, isSpeaker, isListener };
}

async function cleanupExpiredTranscript(chatSession) {
  if (!chatSession?.retentionExpiry) return;
  if (new Date() < new Date(chatSession.retentionExpiry)) return;
  await EscalationChatMessage.deleteMany({ chatSessionId: chatSession._id });
  if (!chatSession.listenerAccessRevokedAt) {
    chatSession.listenerAccessRevokedAt = chatSession.retentionExpiry;
    await chatSession.save();
  }
}

async function summarizeAndStoreTakeawayIfNeeded(booking, chat) {
  if (chat.takeawaySummary) return chat.takeawaySummary;
  const messages = await EscalationChatMessage.find({ bookingId: booking._id }).sort({ createdAt: 1 }).lean();
  const transcript = messages.map((m) => ({
    role: String(m.senderUserId) === String(booking.speakerUserId) ? "speaker" : "listener",
    text: m.text
  }));
  const speaker = await User.findById(booking.speakerUserId).lean();
  const listenerUser = await User.findById(booking.listenerUserId).lean();
  let summary = await summarizeEscalationTakeaways({
    transcript,
    speakerName: speaker?.name,
    listenerName: listenerUser?.name
  });
  if (booking?.listenerAudit?.engagementScore !== null && booking?.listenerAudit?.engagementScore !== undefined) {
    const score = Number(booking.listenerAudit.engagementScore);
    const intents = Array.isArray(booking.listenerAudit.intents) ? booking.listenerAudit.intents : [];
    const intentText = intents.length ? intents.join(", ") : "No clear support intents detected";
    summary += `\n- Listener support quality score (AI auditor): ${Number.isFinite(score) ? score.toFixed(2) : "0.00"}/10.`;
    summary += `\n- Listener support intents observed: ${intentText}.`;
  }
  chat.takeawaySummary = summary;
  await WellnessLog.create({
    userId: booking.speakerUserId,
    bookingId: booking._id,
    listenerName: listenerUser?.name || "",
    source: "listener_session",
    summary,
    createdBy: "ai"
  });
  return summary;
}

async function resolveChatSettlementMode(booking) {
  const [speaker, listener] = await Promise.all([
    User.findById(booking.speakerUserId).select("name").lean(),
    User.findById(booking.listenerUserId).select("name").lean()
  ]);
  const messages = await EscalationChatMessage.find({ bookingId: booking._id }).sort({ createdAt: 1 }).lean();
  const transcript = messages.map((m) => ({
    role: String(m.senderUserId) === String(booking.speakerUserId) ? "speaker" : "listener",
    text: String(m.text || "")
  }));
  const audit = await auditListenerSupportQuality({
    transcript,
    speakerName: speaker?.name,
    listenerName: listener?.name
  });
  const score = Number(audit?.engagementScore || 0);
  const payoutPct = Math.max(0, Math.min(1, score / 10));
  const listenerPct = Math.round(payoutPct * 100);
  const speakerPct = 100 - listenerPct;
  const countByRole = transcript.reduce(
    (acc, m) => {
      if (m.role === "listener") acc.listener += 1;
      else if (m.role === "speaker") acc.speaker += 1;
      return acc;
    },
    { speaker: 0, listener: 0 }
  );
  return {
    mode: "SPLIT_BY_SCORE",
    payoutPct,
    reason:
      `Chat settlement by AI audit score ${score.toFixed(2)}/10. ` +
      `Listener payout ${listenerPct}% and speaker refund ${speakerPct}%. ` +
      `Transcript activity: speaker messages ${countByRole.speaker}, listener messages ${countByRole.listener}.`,
    audit
  };
}

async function autoCompleteChatIfExpired(booking, chat) {
  if (!booking || !chat || String(booking.mode) !== "chat") return;
  if (chat.status === "ended" || chat.status === "purged") return;
  const sessionEndAt = new Date(new Date(chat.scheduledAt).getTime() + ESCALATION_SESSION_DURATION_MS);
  if (new Date() < sessionEndAt) return;

  const retentionExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
  chat.status = "ended";
  chat.startedAt = chat.startedAt || chat.scheduledAt;
  chat.endedAt = chat.endedAt || sessionEndAt;
  chat.retentionExpiry = retentionExpiry;
  chat.listenerAccessRevokedAt = retentionExpiry;
  const settlement = await resolveChatSettlementMode(booking);
  booking.listenerAudit = {
    engagementScore: Number(settlement?.audit?.engagementScore ?? 0),
    intents: Array.isArray(settlement?.audit?.intents) ? settlement.audit.intents : [],
    verdict: String(settlement?.audit?.verdict || ""),
    notes: String(settlement?.audit?.notes || ""),
    evaluatedAt: new Date()
  };
  await settleBookingPayment({
    booking,
    mode: settlement.mode,
    reason: settlement.reason,
    payoutPct: settlement.payoutPct
  });
  await summarizeAndStoreTakeawayIfNeeded(booking, chat);
  booking.status = "completed";

  await Promise.all([
    chat.save(),
    booking.save(),
    EscalationChatMessage.updateMany({ bookingId: booking._id }, { $set: { expiresAt: retentionExpiry } })
  ]);
  emitToChat(
    booking._id,
    "chat_ended",
    {
      retentionExpiry,
      status: chat.status
    },
    [booking.speakerUserId, booking.listenerUserId]
  );
  emitToUsers([booking.speakerUserId, booking.listenerUserId], "booking_updated", {
    bookingId: String(booking._id),
    status: booking.status
  });
}

async function createMeetTakeawayIfMissing(booking) {
  const exists = await WellnessLog.findOne({
    userId: booking.speakerUserId,
    bookingId: booking._id
  }).lean();
  if (exists) return;
  const listenerUser = await User.findById(booking.listenerUserId).select("name").lean();
  const summaryLines = [
    "Session completed (Google Meet).",
    `Scheduled at: ${new Date(booking.scheduledAt).toLocaleString()}.`
  ];
  if (booking.meet?.meetLink) {
    summaryLines.push("Meet link was generated and shared.");
  }
  if (booking.meet?.listenerDwellMinutes !== null && booking.meet?.listenerDwellMinutes !== undefined) {
    summaryLines.push(`Listener dwell time: ${Number(booking.meet.listenerDwellMinutes).toFixed(2)} minutes.`);
  }
  if (booking.meet?.speakerJoined !== null && booking.meet?.speakerJoined !== undefined) {
    summaryLines.push(`Speaker joined: ${booking.meet.speakerJoined ? "Yes" : "No"}.`);
  }
  if (booking.payment?.settlementReason) {
    summaryLines.push(`Settlement: ${booking.payment.settlementReason}`);
  }
  summaryLines.push("No transcript was stored for this session.");
  await WellnessLog.create({
    userId: booking.speakerUserId,
    bookingId: booking._id,
    listenerName: listenerUser?.name || "",
    source: "listener_session",
    summary: summaryLines.join("\n- ").replace(/^/, "- "),
    createdBy: "ai"
  });
}

async function autoCompleteMeetBookingsForUser(userId) {
  void userId;
  return;
}

router.get("/overview", async (req, res, next) => {
  try {
    const userId = req.user._id;
    await autoCompleteMeetBookingsForUser(userId);
    await reconcileCompletedChatSettlementsByScore();
    let myProfile = await EscalationListener.findOne({ userId }).lean();
    if (myProfile) {
      await recomputeListenerPremiumEligibility(userId);
      myProfile = await EscalationListener.findOne({ userId }).lean();
    }
    const listeners = await EscalationListener.find({ active: true, isListeningEnabled: true })
      .sort({ tier: -1, averageSatisfaction: -1 })
      .limit(50)
      .lean();
    const sessions = await EscalationSession.find({ userId }).sort({ createdAt: -1 }).limit(30).lean();
    const incomingBookings = await EscalationBooking.find({ listenerUserId: userId })
      .populate("speakerUserId", "name email")
      .populate("listenerProfileId", "displayName qualificationAnswers averageSatisfaction walletUnlocked")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const outgoingBookings = await EscalationBooking.find({ speakerUserId: userId })
      .populate("listenerUserId", "name email")
      .populate("listenerProfileId", "displayName qualificationAnswers averageSatisfaction walletUnlocked")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const myChatSessions = await EscalationChatSession.find({
      $or: [{ speakerUserId: userId }, { listenerUserId: userId }]
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    const myOpenSlots = await EscalationSlot.find({
      listenerUserId: userId,
      status: "open",
      startAt: { $gte: new Date() }
    })
      .sort({ startAt: 1 })
      .limit(100)
      .lean();
    const openSlots = await EscalationSlot.find({
      status: "open",
      startAt: { $gte: new Date() }
    })
      .populate("listenerProfileId", "displayName qualificationAnswers averageSatisfaction walletUnlocked isListeningEnabled active")
      .sort({ startAt: 1 })
      .limit(200)
      .lean();
    const wellnessLogs = await WellnessLog.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();
    const missingNameLogs = wellnessLogs.filter((x) => !String(x.listenerName || "").trim() && x.bookingId);
    if (missingNameLogs.length) {
      const ids = [...new Set(missingNameLogs.map((x) => String(x.bookingId)))];
      const bookingsForLogs = await EscalationBooking.find({ _id: { $in: ids } })
        .populate("listenerUserId", "name")
        .select("_id listenerUserId")
        .lean();
      const listenerNameByBookingId = new Map(
        bookingsForLogs.map((b) => [String(b._id), String(b.listenerUserId?.name || "").trim()])
      );
      for (const log of wellnessLogs) {
        if (!String(log.listenerName || "").trim() && log.bookingId) {
          log.listenerName = listenerNameByBookingId.get(String(log.bookingId)) || "";
        }
      }
    }
    const walletSummary = {
      held: sessions.filter((s) => s.escrow?.status === "held").reduce((a, s) => a + Number(s.escrow?.amount || 0), 0),
      released: sessions.filter((s) => s.escrow?.status === "released").reduce((a, s) => a + Number(s.escrow?.amount || 0), 0),
      refunded: sessions.filter((s) => s.escrow?.status === "refunded").reduce((a, s) => a + Number(s.escrow?.amount || 0), 0)
    };
    const walletOwner = await User.findById(userId).select("mockWallet").lean();
    res.json({
      myProfile,
      myWallet: {
        balanceInr: getWalletBalanceInr(walletOwner),
        currency: String(walletOwner?.mockWallet?.currency || "INR")
      },
      listeners,
      sessions,
      walletSummary,
      incomingBookings,
      outgoingBookings,
      myChatSessions,
      wellnessLogs,
      myOpenSlots,
      openSlots
    });
  } catch (err) {
    next(err);
  }
});

router.post("/listener/apply", async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).lean();
    const interests = Array.isArray(req.body.interests) ? req.body.interests.map((x) => String(x).trim()).filter(Boolean) : [];
    const answers = Array.isArray(req.body.qualificationAnswers)
      ? req.body.qualificationAnswers.map((x) => String(x).trim()).filter(Boolean)
      : [];
    if (!interests.length || answers.length < 2) {
      return res.status(400).json({ error: "Please provide interests and at least 2 qualification answers." });
    }
    const profile = await EscalationListener.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          displayName: user?.name || "Listener",
          interests,
          qualificationAnswers: answers,
          active: true
        },
        $setOnInsert: {
          tier: "novice",
          probationRequired: 5,
          probationCompleted: 0,
          highSatisfactionCount: 0,
          averageSatisfaction: 0,
          aiAuditAverage: 0,
          strikeCount: 0,
          walletUnlocked: false,
          payoutHoldHours: 24
        }
      },
      { new: true, upsert: true }
    );
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

router.patch("/listener/toggle-listening", async (req, res, next) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const profile = await EscalationListener.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { isListeningEnabled: enabled, active: true } },
      { new: true }
    );
    if (!profile) return res.status(404).json({ error: "Listener profile not found. Apply as listener first." });
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

router.get("/discovery/listeners", async (req, res, next) => {
  try {
    const listeners = await EscalationListener.find({ active: true, isListeningEnabled: true })
      .sort({ averageSatisfaction: -1, aiAuditAverage: -1 })
      .limit(100)
      .lean();
    res.json(
      listeners.map((l) => ({
        id: l._id,
        userId: l.userId,
        name: l.displayName,
        averageRating: Number(l.averageSatisfaction || 0).toFixed(2),
        tier: l.tier
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/slots/open", async (req, res, next) => {
  try {
    const listener = await EscalationListener.findOne({
      userId: req.user._id,
      active: true
    });
    if (!listener) return res.status(404).json({ error: "Listener profile not found. Apply as listener first." });
    const { date, time, feeInr } = req.body;
    if (!date || !time) return res.status(400).json({ error: "Date and time are required." });
    const startAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startAt.getTime())) return res.status(400).json({ error: "Invalid date/time." });
    if (startAt <= new Date()) return res.status(400).json({ error: "Open a future slot only." });
    const safeFeeInr = Math.max(0, Number(feeInr || 0));
    const premiumEligibleNow =
      Number(listener.totalRatedSessions || 0) >= PREMIUM_MIN_RATED_SESSIONS &&
      Number(listener.averageSatisfaction || 0) >= 7;
    if (safeFeeInr > 0 && !premiumEligibleNow) {
      if (listener.walletUnlocked) {
        listener.walletUnlocked = false;
        await listener.save();
      }
      return res.status(400).json({
        error:
          `Premium charging is not enabled yet. Requirement: at least ${PREMIUM_MIN_RATED_SESSIONS} rated sessions with overall average rating >= 7.`
      });
    }

    const slot = await EscalationSlot.findOneAndUpdate(
      { listenerUserId: req.user._id, startAt },
      {
        $set: {
          listenerProfileId: listener._id,
          feeInr: safeFeeInr,
          status: "open",
          bookingId: null,
          bookedAt: null
        },
        $setOnInsert: {
          listenerUserId: req.user._id
        }
      },
      { upsert: true, new: true }
    );
    emitGlobal("slot_updated", { slotId: String(slot._id), status: slot.status, startAt: slot.startAt });
    res.status(201).json(slot);
  } catch (err) {
    next(err);
  }
});

router.get("/slots/my", async (req, res, next) => {
  try {
    const slots = await EscalationSlot.find({
      listenerUserId: req.user._id,
      startAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
    })
      .sort({ startAt: 1 })
      .limit(200)
      .lean();
    res.json(slots);
  } catch (err) {
    next(err);
  }
});

router.delete("/slots/:slotId", async (req, res, next) => {
  try {
    const slot = await EscalationSlot.findOne({
      _id: req.params.slotId,
      listenerUserId: req.user._id
    });
    if (!slot) return res.status(404).json({ error: "Slot not found." });
    if (slot.status === "booked") return res.status(400).json({ error: "Booked slot cannot be removed." });
    slot.status = "closed";
    await slot.save();
    emitGlobal("slot_updated", { slotId: String(slot._id), status: slot.status, startAt: slot.startAt });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/discovery/slots", async (req, res, next) => {
  try {
    const slots = await EscalationSlot.find({
      status: "open",
      startAt: { $gt: new Date() }
    })
      .populate("listenerProfileId", "displayName interests qualificationAnswers averageSatisfaction walletUnlocked isListeningEnabled active")
      .sort({ startAt: 1 })
      .limit(300)
      .lean();

    const listenerUserIds = [...new Set(slots.filter((s) => s.listenerProfileId?.active).map((s) => String(s.listenerUserId)))];
    const ratedBookings = listenerUserIds.length
      ? await EscalationBooking.find({
          listenerUserId: { $in: listenerUserIds },
          speakerSessionRating: { $ne: null }
        })
          .select("listenerUserId speakerRatingBreakdown")
          .lean()
      : [];
    const paramStatsByListener = {};
    for (const b of ratedBookings) {
      const lid = String(b.listenerUserId);
      if (!paramStatsByListener[lid]) {
        paramStatsByListener[lid] = {
          count: 0,
          sums: {
            empathy: 0,
            politeness: 0,
            patience: 0,
            engagement: 0,
            connection: 0,
            tipsQuality: 0
          }
        };
      }
      paramStatsByListener[lid].count += 1;
      for (const key of LISTENER_RATING_KEYS) {
        paramStatsByListener[lid].sums[key] += Number(b.speakerRatingBreakdown?.[key] || 0);
      }
    }

    const mapped = slots.filter((s) => s.listenerProfileId?.active).map((s) => {
        const lid = String(s.listenerUserId);
        const stats = paramStatsByListener[lid];
        const paramAverages = {};
        for (const key of LISTENER_RATING_KEYS) {
          paramAverages[key] = stats?.count ? Number((stats.sums[key] / stats.count).toFixed(2)) : null;
        }
        return {
          slotId: s._id,
          listenerId: s.listenerProfileId?._id,
          listenerUserId: s.listenerUserId,
          listenerName: s.listenerProfileId?.displayName || "Listener",
          averageRating: Number(s.listenerProfileId?.averageSatisfaction || 0).toFixed(2),
          feeInr: Number(s.feeInr || 0),
          freeAvailability: Number(s.feeInr || 0) > 0 ? `Premium (Rs ${Number(s.feeInr || 0)})` : "Free only",
          interests: Array.isArray(s.listenerProfileId?.interests) ? s.listenerProfileId.interests : [],
          qualifications: Array.isArray(s.listenerProfileId?.qualificationAnswers)
            ? s.listenerProfileId.qualificationAnswers
            : [],
          parameterAverages: paramAverages,
          dateTime: s.startAt
        };
      });
    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

router.post("/booking/create", async (req, res, next) => {
  let slot = null;
  let booking = null;
  try {
    const speakerUserId = req.user._id;
    const { slotId, mode } = req.body;
    if (!slotId) return res.status(400).json({ error: "slotId is required." });
    const safeMode = mode === "google_meet" ? "google_meet" : "chat";
    slot = await EscalationSlot.findOneAndUpdate(
      { _id: slotId, status: "open", startAt: { $gt: new Date() } },
      { $set: { status: "booked", bookedAt: new Date() } },
      { new: true }
    );
    if (!slot) return res.status(404).json({ error: "Slot not available. Choose another open slot." });
    const listener = await EscalationListener.findOne({
      _id: slot.listenerProfileId,
      active: true
    });
    if (!listener) {
      slot.status = "open";
      slot.bookedAt = null;
      await slot.save();
      return res.status(404).json({ error: "Listener not available for this slot." });
    }
    if (String(listener.userId) === String(speakerUserId)) {
      slot.status = "open";
      slot.bookedAt = null;
      await slot.save();
      return res.status(400).json({ error: "You cannot book your own slot." });
    }

    const feeInr = Number(slot.feeInr || 0);
    booking = await EscalationBooking.create({
      speakerUserId,
      listenerUserId: listener.userId,
      listenerProfileId: listener._id,
      listenerSlotId: slot._id,
      scheduledAt: slot.startAt,
      feeInr,
      mode: safeMode,
      status: "pending"
    });
    await debitSpeakerAndHoldEscrow({
      speakerUserId,
      listenerUserId: listener.userId,
      amountInr: feeInr,
      booking
    });
    await booking.save();
    slot.bookingId = booking._id;
    await slot.save();

    const speaker = await User.findById(speakerUserId).lean();
    const dateStr = slot.startAt.toLocaleDateString();
    const timeStr = slot.startAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    await User.findByIdAndUpdate(listener.userId, {
      $push: {
        notifications: {
          title: "New Slot Booking",
          message: `Slot booking from ${speaker?.name || "user"} on ${dateStr} at ${timeStr} via ${safeMode}.${Number(slot.feeInr || 0) > 0 ? ` Session fee: Rs ${Number(slot.feeInr || 0)}.` : " Free session."}`
        }
      }
    });
    emitToUsers([listener.userId, speakerUserId], "booking_created", {
      bookingId: String(booking._id),
      mode: booking.mode,
      scheduledAt: booking.scheduledAt,
      paymentStatus: booking.payment?.status || "UNPAID"
    });
    emitGlobal("slot_updated", { slotId: String(slot._id), status: slot.status, startAt: slot.startAt });

    res.status(201).json({
      ...booking.toObject(),
      paymentMessage:
        feeInr > 0
          ? `Rs ${feeInr} paid by speaker and held in platform escrow until session settlement.`
          : "Free session booking created."
    });
  } catch (err) {
    if (slot) {
      await EscalationSlot.findByIdAndUpdate(slot._id, {
        $set: { status: "open", bookingId: null, bookedAt: null }
      }).catch(() => null);
      emitGlobal("slot_updated", { slotId: String(slot._id), status: "open", startAt: slot.startAt });
    }
    if (booking) {
      const paidHeld = String(booking?.payment?.status || "") === "PAID_HELD";
      if (paidHeld) {
        await settleBookingPayment({
          booking,
          mode: "REFUND_FULL",
          reason: "Booking creation failed; payment fully refunded."
        }).catch(() => null);
      }
      await EscalationBooking.deleteOne({ _id: booking._id }).catch(() => null);
    }
    next(err);
  }
});

router.get("/booking/incoming", async (req, res, next) => {
  try {
    const items = await EscalationBooking.find({ listenerUserId: req.user._id })
      .populate("speakerUserId", "name email")
      .populate("listenerProfileId", "displayName qualificationAnswers averageSatisfaction walletUnlocked")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get("/booking/outgoing", async (req, res, next) => {
  try {
    const items = await EscalationBooking.find({ speakerUserId: req.user._id })
      .populate("listenerUserId", "name email")
      .populate("listenerProfileId", "displayName qualificationAnswers averageSatisfaction walletUnlocked")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.post("/booking/respond", async (req, res, next) => {
  try {
    const listenerUserId = req.user._id;
    const { bookingId, decision, reason = "" } = req.body;
    const booking = await EscalationBooking.findOne({ _id: bookingId, listenerUserId, status: "pending" });
    if (!booking) return res.status(404).json({ error: "Booking not found or already handled." });
    const accept = String(decision || "").toLowerCase() === "accept";
    if (accept && Number(booking.feeInr || 0) > 0 && String(booking.payment?.status || "") !== "PAID_HELD") {
      return res.status(400).json({
        error: "Cannot accept this premium booking because payment is not held in escrow."
      });
    }
    booking.status = accept ? "accepted" : "rejected";
    booking.responseAt = new Date();
    booking.responseReason = String(reason || "");

    if (accept && booking.mode === "google_meet") {
      const speaker = await User.findById(booking.speakerUserId);
      const listenerUser = await User.findById(booking.listenerUserId);
      const host = speaker?.integrations?.googleCalendar?.accessToken ? speaker : listenerUser;
      if (host?.integrations?.googleCalendar?.accessToken) {
        const accessToken = await getValidGoogleAccessToken(host);
        const startAt = booking.scheduledAt;
        const endAt = new Date(new Date(startAt).getTime() + ESCALATION_SESSION_DURATION_MS);
        const event = await createGoogleMeetAtDateTime({
          accessToken,
          calendarId: host.integrations?.googleCalendar?.calendarId || "primary",
          timezone: host.timezone || "UTC",
          startAt,
          endAt,
          attendeeEmails: [speaker?.email, listenerUser?.email].filter(Boolean),
          summary: "Dispatcher.AI Escalation Session",
          description: "Listener session generated from Escalation Hub."
        });
        if (event?.created) {
          booking.meet = {
            eventId: event.eventId || "",
            htmlLink: event.htmlLink || "",
            meetLink: event.meetLink || "",
            conferenceId: event.conferenceId || ""
          };
        }
      }
    }

    if (accept && booking.mode === "chat") {
      await EscalationChatSession.findOneAndUpdate(
        { bookingId: booking._id },
        {
          $setOnInsert: {
            bookingId: booking._id,
            speakerUserId: booking.speakerUserId,
            listenerUserId: booking.listenerUserId,
            scheduledAt: booking.scheduledAt,
            status: "scheduled"
          }
        },
        { upsert: true, new: true }
      );
    }

    await booking.save();
    if (!accept && booking.listenerSlotId) {
      await settleBookingPayment({
        booking,
        mode: "REFUND_FULL",
        reason: "Listener rejected booking; full refund to speaker."
      });
      await booking.save();
      const reopened = await EscalationSlot.findByIdAndUpdate(
        booking.listenerSlotId,
        { $set: { status: "open", bookingId: null, bookedAt: null } },
        { new: true }
      );
      if (reopened) {
        emitGlobal("slot_updated", {
          slotId: String(reopened._id),
          status: reopened.status,
          startAt: reopened.startAt
        });
      }
    }
    const speakerMsg = accept
      ? `Your booking on ${new Date(booking.scheduledAt).toLocaleString()} was accepted.${booking.mode === "google_meet" && booking.meet?.meetLink ? ` Meet link: ${booking.meet.meetLink}` : ""}`
      : `Your booking on ${new Date(booking.scheduledAt).toLocaleString()} was rejected.${booking.responseReason ? ` Reason: ${booking.responseReason}` : ""}`;
    const listenerMsg = accept
      ? `You accepted booking on ${new Date(booking.scheduledAt).toLocaleString()} via ${booking.mode}.${booking.mode === "google_meet" && booking.meet?.meetLink ? ` Meet link: ${booking.meet.meetLink}` : ""}`
      : `You rejected booking on ${new Date(booking.scheduledAt).toLocaleString()}.`;
    await Promise.all([
      User.findByIdAndUpdate(booking.speakerUserId, {
        $push: {
          notifications: {
            title: "Booking Response",
            message: speakerMsg
          }
        }
      }),
      User.findByIdAndUpdate(booking.listenerUserId, {
        $push: {
          notifications: {
            title: "Booking Updated",
            message: listenerMsg
          }
        }
      })
    ]);
    emitToUsers([booking.speakerUserId, booking.listenerUserId], "booking_updated", {
      bookingId: String(booking._id),
      status: booking.status,
      mode: booking.mode,
      scheduledAt: booking.scheduledAt,
      meetLink: booking.meet?.meetLink || "",
      paymentStatus: booking.payment?.status || "UNPAID"
    });
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

router.post("/booking/cancel", async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ error: "bookingId is required." });

    const booking = await EscalationBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const isSpeaker = String(booking.speakerUserId) === String(userId);
    const isListener = String(booking.listenerUserId) === String(userId);
    if (!isSpeaker && !isListener) return res.status(403).json({ error: "Not authorized." });
    if (String(booking.status) !== "accepted") {
      return res.status(400).json({ error: "Only accepted bookings can be cancelled." });
    }

    const actor = await User.findById(userId).select("name").lean();
    const actorName = actor?.name || "A participant";
    const cancelledBy = isSpeaker ? "speaker" : "listener";
    const peerUserId = isSpeaker ? booking.listenerUserId : booking.speakerUserId;

    booking.status = "cancelled";
    booking.responseReason = `Cancelled by ${cancelledBy}.`;
    booking.responseAt = new Date();
    await settleBookingPayment({
      booking,
      mode: isListener ? "REFUND_FULL" : "REFUND_50",
      reason: isListener
        ? "Listener did not arrive/cancelled; full refund to speaker."
        : "Speaker cancelled/no-show; 50% refund to speaker."
    });
    await booking.save();

    if (String(booking.mode) === "chat") {
      await Promise.all([
        EscalationChatMessage.deleteMany({ bookingId: booking._id }),
        EscalationChatSession.deleteMany({ bookingId: booking._id })
      ]);
    }

    if (booking.listenerSlotId) {
      const slot = await EscalationSlot.findById(booking.listenerSlotId);
      if (slot && new Date(slot.startAt).getTime() > Date.now()) {
        slot.status = "open";
        slot.bookingId = null;
        slot.bookedAt = null;
        await slot.save();
        emitGlobal("slot_updated", { slotId: String(slot._id), status: slot.status, startAt: slot.startAt });
      }
    }

    const whenText = new Date(booking.scheduledAt).toLocaleString();
    await Promise.all([
      User.findByIdAndUpdate(peerUserId, {
        $push: {
          notifications: {
            title: "Session Cancelled",
            message: `${actorName} cancelled the slot scheduled on ${whenText}.`
          }
        }
      }),
      User.findByIdAndUpdate(userId, {
        $push: {
          notifications: {
            title: "Session Cancelled",
            message: `You cancelled the slot scheduled on ${whenText}.`
          }
        }
      })
    ]);

    emitToUsers([booking.speakerUserId, booking.listenerUserId], "booking_updated", {
      bookingId: String(booking._id),
      status: booking.status,
      mode: booking.mode,
      scheduledAt: booking.scheduledAt,
      paymentStatus: booking.payment?.status || "UNPAID"
    });

    res.json({ ok: true, booking });
  } catch (err) {
    next(err);
  }
});

router.post("/booking/complete/:bookingId", async (req, res, next) => {
  try {
    const booking = await EscalationBooking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const isSpeaker = String(booking.speakerUserId) === String(req.user._id);
    const isListener = String(booking.listenerUserId) === String(req.user._id);
    if (!isSpeaker && !isListener) return res.status(403).json({ error: "Not authorized." });
    if (String(booking.mode) !== "google_meet") {
      return res.status(400).json({ error: "Only Google Meet bookings are supported by this endpoint." });
    }
    if (String(booking.status) === "completed") {
      return res.json({ booking, alreadyCompleted: true });
    }
    if (String(booking.status) !== "accepted") {
      return res.status(400).json({ error: "Only accepted bookings can be completed." });
    }

    const [speaker, listener] = await Promise.all([
      User.findById(booking.speakerUserId),
      User.findById(booking.listenerUserId)
    ]);
    let attendance = {
      available: false,
      listenerMinutes: Number(req.body?.listenerDwellMinutes || 0),
      speakerMinutes: Number(req.body?.speakerDwellMinutes || 0),
      speakerJoined: Boolean(req.body?.speakerJoined),
      source: "request_fallback"
    };

    if (speaker?.integrations?.googleCalendar?.accessToken) {
      const accessToken = await getValidGoogleAccessToken(speaker);
      attendance = await fetchMeetParticipantDwell({
        accessToken,
        meetLink: booking.meet?.meetLink || "",
        speakerUser: speaker,
        listenerUser: listener
      });
    } else if (listener?.integrations?.googleCalendar?.accessToken) {
      const accessToken = await getValidGoogleAccessToken(listener);
      attendance = await fetchMeetParticipantDwell({
        accessToken,
        meetLink: booking.meet?.meetLink || "",
        speakerUser: speaker,
        listenerUser: listener
      });
    }

    const listenerMinutes = Number(attendance.listenerMinutes || 0);
    const speakerJoined = Boolean(attendance.speakerJoined);
    const speakerNoShowAfter15 = listenerMinutes >= 15 && !speakerJoined;
    let settleMode = "REFUND_FULL";
    let settleReason = "Google Meet SLA: listener dwell < 15 mins, full refund to speaker.";
    let commissionPct = 0;

    if (speakerNoShowAfter15) {
      settleMode = "RELEASE_WITH_COMMISSION";
      commissionPct = Math.max(0, Number(env.escalation?.platformCommissionPct || 0));
      settleReason =
        "Google Meet SLA: speaker no-show after listener met minimum 15 mins; payout released to listener minus platform commission.";
    } else if (listenerMinutes < 15) {
      settleMode = "REFUND_FULL";
      settleReason = "Google Meet SLA: listener dwell < 15 mins; full refund to speaker.";
    } else if (listenerMinutes < 30) {
      settleMode = "SPLIT_50";
      settleReason = "Google Meet SLA: listener dwell in [15, 30) mins; 50% payout and 50% refund.";
    } else {
      settleMode = "RELEASE_FULL";
      settleReason = "Google Meet SLA: listener dwell >= 30 mins; full payout to listener.";
    }

    booking.meet = booking.meet || {};
    booking.meet.listenerDwellMinutes = Number(listenerMinutes.toFixed(2));
    booking.meet.speakerDwellMinutes = Number(Number(attendance.speakerMinutes || 0).toFixed(2));
    booking.meet.speakerJoined = speakerJoined;
    booking.meet.attendanceSource = attendance.available ? attendance.source || "google_meet_api" : "fallback";
    booking.status = "completed";
    await settleBookingPayment({
      booking,
      mode: settleMode,
      reason: settleReason,
      commissionPct
    });
    await booking.save();
    await createMeetTakeawayIfMissing(booking);
    emitToUsers([booking.speakerUserId, booking.listenerUserId], "booking_updated", {
      bookingId: String(booking._id),
      status: booking.status,
      mode: booking.mode,
      scheduledAt: booking.scheduledAt,
      meetLink: booking.meet?.meetLink || "",
      paymentStatus: booking.payment?.status || "UNPAID"
    });
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.post("/booking/rate", async (req, res, next) => {
  try {
    const speakerUserId = req.user._id;
    const { bookingId, ratingBreakdown = {}, notes = "" } = req.body;
    const booking = await EscalationBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (String(booking.speakerUserId) !== String(speakerUserId)) {
      return res.status(403).json({ error: "Only the speaker can submit listener rating." });
    }
    if (String(booking.status || "") !== "completed") {
      return res.status(400).json({ error: "Rating can be submitted only after the session is completed." });
    }

    const normalized = {};
    for (const key of LISTENER_RATING_KEYS) {
      const n = normalizeScore(ratingBreakdown[key]);
      if (n === null) return res.status(400).json({ error: `Missing or invalid rating for '${key}'. Use 0-10.` });
      normalized[key] = n;
    }

    const sessionRating = computeSessionRatingFromBreakdown(normalized);
    if (sessionRating === null) {
      return res.status(400).json({ error: "Unable to compute session rating. Please provide all rating fields." });
    }

    booking.speakerRatingBreakdown = normalized;
    booking.speakerSessionRating = sessionRating;
    booking.speakerRatingNotes = String(notes || "");
    await booking.save();

    if (String(booking.mode) === "chat") {
      await Promise.all([
        EscalationChatMessage.deleteMany({ bookingId: booking._id }),
        EscalationChatSession.deleteOne({ bookingId: booking._id })
      ]);
      emitToChat(
        booking._id,
        "chat_deleted_after_rating",
        { bookingId: String(booking._id) },
        [booking.speakerUserId, booking.listenerUserId]
      );
    }

    const stats = await recomputeListenerPremiumEligibility(booking.listenerUserId);
    emitToUsers([booking.listenerUserId, booking.speakerUserId], "listener_rating_updated", {
      bookingId: String(booking._id),
      speakerSessionRating: sessionRating,
      averageRating: stats.avg,
      totalRatedSessions: stats.count,
      premiumEligible: stats.premiumEligible
    });

    res.json({
      bookingId: booking._id,
      sessionRating,
      averageRating: stats.avg,
      totalRatedSessions: stats.count,
      premiumEligible: stats.premiumEligible
    });
  } catch (err) {
    next(err);
  }
});

router.post("/session/start", async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { listenerId, mode = "volunteer", amount = 0, currency = "INR" } = req.body;
    if (!listenerId) return res.status(400).json({ error: "listenerId is required." });
    const listener = await EscalationListener.findOne({ _id: listenerId, active: true });
    if (!listener) return res.status(404).json({ error: "Listener not found or inactive." });
    const premiumEligible =
      Number(listener.totalRatedSessions || 0) >= PREMIUM_MIN_RATED_SESSIONS &&
      Number(listener.averageSatisfaction || 0) >= 7;
    if (mode === "paid" && !premiumEligible) {
      return res.status(400).json({
        error: `This listener is not premium-eligible yet. Requirement: at least ${PREMIUM_MIN_RATED_SESSIONS} rated sessions and average rating >= 7.`
      });
    }

    const secretShopper = mode === "paid" && Math.random() < 0.12;
    const escrowStatus = mode === "paid" ? "held" : "none";
    const releaseAt = mode === "paid" ? new Date(Date.now() + listener.payoutHoldHours * 60 * 60 * 1000) : undefined;

    const session = await EscalationSession.create({
      userId,
      listenerId: listener._id,
      mode,
      secretShopper,
      status: "in_progress",
      startedAt: new Date(),
      escrow: {
        amount: mode === "paid" ? Number(amount || 0) : 0,
        currency: String(currency || "INR"),
        releaseAt,
        status: escrowStatus
      }
    });
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

router.post("/session/message", async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { sessionId, text, role = "user" } = req.body;
    if (!sessionId || !String(text || "").trim()) return res.status(400).json({ error: "sessionId and text are required." });
    const session = await EscalationSession.findOne({ _id: sessionId, userId, status: "in_progress" });
    if (!session) return res.status(404).json({ error: "Session not found or not active." });
    const safeRole = role === "listener" ? "listener" : "user";
    session.transcript.push({ role: safeRole, text: String(text).trim(), at: new Date() });
    await session.save();
    res.json({ ok: true, transcriptCount: session.transcript.length });
  } catch (err) {
    next(err);
  }
});

router.post("/session/end", async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      sessionId,
      userRating,
      userFeedback = "",
      listenerRating,
      listenerFeedback = "",
      reportLowEffort = false
    } = req.body;
    const session = await EscalationSession.findOne({ _id: sessionId, userId, status: "in_progress" });
    if (!session) return res.status(404).json({ error: "Session not found or not active." });
    const listener = await EscalationListener.findById(session.listenerId);
    if (!listener) return res.status(404).json({ error: "Listener not found." });

    const audit = await analyzeSessionEmpathy({ transcript: session.transcript || [] });
    session.aiAudit = {
      empathyScore: audit.empathyScore,
      flagged: audit.flagged,
      lowEffortSignals: audit.lowEffortSignals,
      summary: audit.summary
    };
    session.userRating = clampRating(userRating);
    session.listenerRating = clampRating(listenerRating);
    session.userFeedback = String(userFeedback || "");
    session.listenerFeedback = String(listenerFeedback || "");
    session.endedAt = new Date();

    const userMarkedLowEffort = Boolean(reportLowEffort) || clampRating(userRating) <= 2;
    const refundable = session.mode === "paid" && userMarkedLowEffort && audit.flagged;

    if (refundable) {
      session.status = "refunded";
      session.escrow.status = "refunded";
      listener.strikeCount += 1;
    } else {
      session.status = "completed";
      if (session.mode === "paid" && session.escrow.status === "held") {
        // Release remains held for 24h+ until payout processing route.
        session.escrow.status = "held";
      }
    }

    if (session.secretShopper && audit.flagged) {
      listener.active = false;
      listener.strikeCount += 2;
      session.status = "blocked";
      if (session.mode === "paid") {
        session.escrow.status = "refunded";
      }
    }

    const highSatisfaction = (session.userRating || 0) >= 4 && !audit.flagged;
    if (session.mode === "volunteer" && highSatisfaction) {
      listener.probationCompleted += 1;
      listener.highSatisfactionCount += 1;
    }

    const completedSessions = await EscalationSession.find({
      listenerId: listener._id,
      userRating: { $exists: true, $ne: null }
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    if (completedSessions.length) {
      listener.aiAuditAverage =
        completedSessions.reduce((a, s) => a + Number(s.aiAudit?.empathyScore || 0), 0) / completedSessions.length;
    }

    await Promise.all([session.save(), listener.save()]);

    res.json({
      session,
      listener,
      policy: {
        escrowHours: listener.payoutHoldHours,
        probationRequired: listener.probationRequired
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post("/session/report", async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { sessionId, reason = "" } = req.body;
    const session = await EscalationSession.findOne({ _id: sessionId, userId });
    if (!session) return res.status(404).json({ error: "Session not found." });
    session.status = "disputed";
    session.userFeedback = [session.userFeedback, `REPORT: ${String(reason || "").trim()}`].filter(Boolean).join("\n");
    if (session.mode === "paid" && session.escrow.status === "held") {
      session.escrow.status = "refunded";
    }
    await session.save();
    res.json({ ok: true, session });
  } catch (err) {
    next(err);
  }
});

router.post("/community/review", async (req, res, next) => {
  try {
    const reviewer = await EscalationListener.findOne({ userId: req.user._id, active: true });
    if (!reviewer || reviewer.tier !== "master") {
      return res.status(403).json({ error: "Only Master-tier listeners can perform shadow approvals." });
    }
    const { sessionId, approved, note = "" } = req.body;
    const session = await EscalationSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found." });
    session.communityReview = {
      shadowedByListenerId: reviewer._id,
      approved: Boolean(approved),
      note: String(note || "")
    };
    await session.save();

    const targetListener = await EscalationListener.findById(session.listenerId);
    if (targetListener) {
      if (!approved) {
        targetListener.strikeCount += 1;
      }
      if (approved && targetListener.tier === "novice" && targetListener.averageSatisfaction >= 4.4) {
        targetListener.tier = "guide";
      } else if (approved && targetListener.tier === "guide" && targetListener.averageSatisfaction >= 4.7) {
        targetListener.tier = "master";
      }
      await targetListener.save();
    }
    res.json({ ok: true, session });
  } catch (err) {
    next(err);
  }
});

router.post("/wallet/release-due", async (req, res, next) => {
  try {
    const now = new Date();
    const due = await EscalationSession.find({
      mode: "paid",
      "escrow.status": "held",
      "escrow.releaseAt": { $lte: now },
      status: "completed"
    });
    let released = 0;
    for (const s of due) {
      s.escrow.status = "released";
      s.status = "released";
      await s.save();
      released += 1;
    }
    res.json({ released });
  } catch (err) {
    next(err);
  }
});

router.post("/wallet/mock/topup", async (req, res, next) => {
  try {
    const userId = req.user._id;
    const amountInr = Number(req.body?.amountInr || 0);
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return res.status(400).json({ error: "amountInr must be a positive number." });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    user.mockWallet = user.mockWallet || {};
    const current = getWalletBalanceInr(user);
    user.mockWallet.balanceInr = Number((current + amountInr).toFixed(2));
    if (!user.mockWallet.currency) user.mockWallet.currency = "INR";
    await user.save();
    res.json({
      ok: true,
      wallet: {
        balanceInr: user.mockWallet.balanceInr,
        currency: user.mockWallet.currency
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get("/chat/session/:bookingId", async (req, res, next) => {
  try {
    const booking = await EscalationBooking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const chat = await EscalationChatSession.findOne({ bookingId: booking._id });
    if (!chat) return res.status(404).json({ error: "Chat session not found." });
    await autoCompleteChatIfExpired(booking, chat);
    await cleanupExpiredTranscript(chat);
    const access = canAccessChatSession(chat, booking, req.user._id);
    if (!access.ok) return res.status(403).json({ error: access.reason });
    res.json(chat);
  } catch (err) {
    next(err);
  }
});

router.get("/chat/messages/:bookingId", async (req, res, next) => {
  try {
    const booking = await EscalationBooking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const chat = await EscalationChatSession.findOne({ bookingId: booking._id });
    if (!chat) return res.status(404).json({ error: "Chat session not found." });
    await autoCompleteChatIfExpired(booking, chat);
    await cleanupExpiredTranscript(chat);
    const access = canAccessChatSession(chat, booking, req.user._id);
    if (!access.ok) return res.status(403).json({ error: access.reason });
    const items = await EscalationChatMessage.find({ bookingId: booking._id }).sort({ createdAt: 1 }).limit(1000).lean();
    const [speaker, listener] = await Promise.all([
      User.findById(booking.speakerUserId).select("name").lean(),
      User.findById(booking.listenerUserId).select("name").lean()
    ]);
    res.json({
      chat,
      messages: items,
      participants: {
        speakerId: String(booking.speakerUserId),
        listenerId: String(booking.listenerUserId),
        speakerName: speaker?.name || "Speaker",
        listenerName: listener?.name || "Listener"
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post("/chat/message/:bookingId", async (req, res, next) => {
  try {
    const booking = await EscalationBooking.findById(req.params.bookingId);
    if (!booking || booking.status !== "accepted" || booking.mode !== "chat") {
      return res.status(400).json({ error: "Accepted chat booking not found." });
    }
    let chat = await EscalationChatSession.findOne({ bookingId: booking._id });
    if (!chat) return res.status(404).json({ error: "Chat session not found." });
    await autoCompleteChatIfExpired(booking, chat);
    await cleanupExpiredTranscript(chat);
    const access = canAccessChatSession(chat, booking, req.user._id);
    if (!access.ok) return res.status(403).json({ error: access.reason });
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ error: "Message text is required." });

    if (chat.status === "scheduled" && new Date() >= new Date(chat.scheduledAt)) {
      chat.status = "active";
      chat.startedAt = chat.startedAt || new Date();
      await chat.save();
    }
    if (chat.status !== "active") {
      return res.status(403).json({ error: "Chat is not active yet." });
    }

    const msg = await EscalationChatMessage.create({
      bookingId: booking._id,
      chatSessionId: chat._id,
      senderUserId: req.user._id,
      text
    });
    emitToChat(
      booking._id,
      "chat_message",
      {
        message: {
          _id: String(msg._id),
          senderUserId: String(msg.senderUserId),
          text: msg.text,
          createdAt: msg.createdAt
        }
      },
      [booking.speakerUserId, booking.listenerUserId]
    );
    res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
});

router.post("/chat/end/:bookingId", async (req, res, next) => {
  try {
    const booking = await EscalationBooking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    let chat = await EscalationChatSession.findOne({ bookingId: booking._id });
    if (!chat) return res.status(404).json({ error: "Chat session not found." });

    const isSpeaker = String(booking.speakerUserId) === String(req.user._id);
    const isListener = String(booking.listenerUserId) === String(req.user._id);
    if (!isSpeaker && !isListener) return res.status(403).json({ error: "Not authorized." });

    const retentionExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    chat.status = "ended";
    chat.endedAt = chat.endedAt || new Date();
    chat.retentionExpiry = retentionExpiry;
    chat.listenerAccessRevokedAt = retentionExpiry;

    const settlement = await resolveChatSettlementMode(booking);
    booking.listenerAudit = {
      engagementScore: Number(settlement?.audit?.engagementScore ?? 0),
      intents: Array.isArray(settlement?.audit?.intents) ? settlement.audit.intents : [],
      verdict: String(settlement?.audit?.verdict || ""),
      notes: String(settlement?.audit?.notes || ""),
      evaluatedAt: new Date()
    };
    await settleBookingPayment({
      booking,
      mode: settlement.mode,
      reason: settlement.reason,
      payoutPct: settlement.payoutPct
    });
    await summarizeAndStoreTakeawayIfNeeded(booking, chat);

    booking.status = "completed";
    await Promise.all([
      chat.save(),
      booking.save(),
      EscalationChatMessage.updateMany({ bookingId: booking._id }, { $set: { expiresAt: retentionExpiry } })
    ]);
    emitToChat(
      booking._id,
      "chat_ended",
      {
        retentionExpiry,
        status: chat.status
      },
      [booking.speakerUserId, booking.listenerUserId]
    );
    emitToUsers([booking.speakerUserId, booking.listenerUserId], "booking_updated", {
      bookingId: String(booking._id),
      status: booking.status
    });

    res.json({ chat });
  } catch (err) {
    next(err);
  }
});

router.post("/chat/purge/:bookingId", async (req, res, next) => {
  try {
    const booking = await EscalationBooking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const isSpeaker = String(booking.speakerUserId) === String(req.user._id);
    if (!isSpeaker) return res.status(403).json({ error: "Only the speaker can purge chat." });
    const chat = await EscalationChatSession.findOne({ bookingId: booking._id });
    if (!chat) return res.status(404).json({ error: "Chat session not found." });

    const settlement = await resolveChatSettlementMode(booking);
    booking.listenerAudit = {
      engagementScore: Number(settlement?.audit?.engagementScore ?? 0),
      intents: Array.isArray(settlement?.audit?.intents) ? settlement.audit.intents : [],
      verdict: String(settlement?.audit?.verdict || ""),
      notes: String(settlement?.audit?.notes || ""),
      evaluatedAt: new Date()
    };
    await settleBookingPayment({
      booking,
      mode: settlement.mode,
      reason: settlement.reason,
      payoutPct: settlement.payoutPct
    });
    await summarizeAndStoreTakeawayIfNeeded(booking, chat);

    chat.status = "purged";
    chat.speakerPurgedAt = new Date();
    chat.listenerAccessRevokedAt = new Date();
    chat.retentionExpiry = new Date();
    booking.status = "completed";
    await Promise.all([chat.save(), booking.save(), EscalationChatMessage.deleteMany({ bookingId: booking._id })]);
    emitToChat(
      booking._id,
      "chat_purged",
      {
        status: chat.status
      },
      [booking.speakerUserId, booking.listenerUserId]
    );
    emitToUsers([booking.speakerUserId, booking.listenerUserId], "booking_updated", {
      bookingId: String(booking._id),
      status: booking.status
    });
    res.json({ ok: true, message: "Chat purged immediately by speaker." });
  } catch (err) {
    next(err);
  }
});

export default router;

