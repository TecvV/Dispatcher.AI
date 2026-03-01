import { CrisisEvent } from "../models/CrisisEvent.js";
import { User } from "../models/User.js";
import { Contact } from "../models/Contact.js";
import { DiscordChannel } from "../models/DiscordChannel.js";
import { sendTrustedContactAlertEmail } from "./emailService.js";
import { sendTelegramMessage } from "./telegramService.js";
import { sendDiscordMessage } from "./discordService.js";
import { VoiceRelayCall } from "../models/VoiceRelayCall.js";
import { createVoiceRelayToken, startTwilioVoiceCall } from "./voiceCallService.js";
import { buildCrisisBroadcast } from "./llm.js";
import { env } from "../config/env.js";

const US_988 = "988 Suicide & Crisis Lifeline";

export async function handlePotentialCrisis({ userId, message, crisisScore, preferredContactId = null }) {
  if (crisisScore <= 0) return null;

  const user = await User.findById(userId);
  if (!user) return null;

  const crisisContactsRaw = await Contact.find({ userId, notifyOnCrisis: true }).sort({ createdAt: 1 }).lean();
  const crisisContacts = [...crisisContactsRaw];
  if (preferredContactId && crisisContacts.length > 1) {
    const idx = crisisContacts.findIndex((c) => String(c._id) === String(preferredContactId));
    if (idx > 0) {
      const picked = crisisContacts[idx];
      crisisContacts.splice(idx, 1);
      crisisContacts.unshift(picked);
    }
  }
  const primaryContact = crisisContacts[0] || null;
  const severity = Math.min(10, 7 + crisisScore);
  const alertPackage = await buildCrisisBroadcast({
    userName: user.name,
    message
  });
  const commonAlertText = `${alertPackage.message}\n\nNote: This is an auto-generated crisis alert from Wellness Bot. Do not reply here; replies will not be delivered.`;

  const emailResultsSettled = await Promise.allSettled(
    crisisContacts.map(async (c) => {
      if (!c?.email) {
        return {
          contactId: c._id,
          contactName: c.name,
          sent: false,
          reason: "No email configured."
        };
      }
      const out = await sendTrustedContactAlertEmail({
        to: c.email,
        userName: user.name,
        subject: alertPackage.subject,
        text: commonAlertText
      });
      return {
        contactId: c._id,
        contactName: c.name,
        email: c.email,
        sent: Boolean(out?.sent),
        reason: out?.reason || ""
      };
    })
  );
  const emailAttempts = emailResultsSettled.map((r, idx) =>
    r.status === "fulfilled"
      ? r.value
      : {
          contactId: crisisContacts[idx]?._id,
          contactName: crisisContacts[idx]?.name,
          email: crisisContacts[idx]?.email || "",
          sent: false,
          reason: String(r.reason?.message || "Email send failed")
        }
  );
  const emailSentCount = emailAttempts.filter((x) => x.sent).length;
  const emailResult = emailAttempts.find((x) => x.sent) || null;

  const telegramResultsSettled = await Promise.allSettled(
    crisisContacts.map(async (c) => {
      if (!c?.telegramChatId) {
        return {
          contactId: c._id,
          contactName: c.name,
          sent: false,
          reason: "No Telegram chat ID configured."
        };
      }
      const out = await sendTelegramMessage({
        chatId: c.telegramChatId,
        text: commonAlertText
      });
      return {
        contactId: c._id,
        contactName: c.name,
        telegramChatId: c.telegramChatId,
        sent: Boolean(out?.sent),
        reason: out?.reason || ""
      };
    })
  );
  const telegramAttempts = telegramResultsSettled.map((r, idx) =>
    r.status === "fulfilled"
      ? r.value
      : {
          contactId: crisisContacts[idx]?._id,
          contactName: crisisContacts[idx]?.name,
          telegramChatId: crisisContacts[idx]?.telegramChatId || "",
          sent: false,
          reason: String(r.reason?.message || "Telegram send failed")
        }
  );
  let telegramResult = telegramAttempts.find((x) => x.sent) || {
    sent: false,
    reason: "No Telegram chat ID configured for crisis contacts."
  };
  const telegramSentCount = telegramAttempts.filter((x) => x.sent).length;
  if (!telegramResult.sent && env.telegram.defaultChatId) {
    const fallback = await sendTelegramMessage({
      chatId: env.telegram.defaultChatId,
      text: `${commonAlertText}\n\nFallback delivery because contact chats failed.${primaryContact?.name ? ` Primary contact: ${primaryContact.name}` : ""}`
    });
    if (fallback.sent) {
      telegramResult = { ...fallback, usedFallbackDefaultChatId: true };
    } else {
      telegramResult = {
        sent: false,
        reason: `${telegramResult.reason} | Fallback failed: ${fallback.reason}`
      };
    }
  }

  const crisisDiscordChannels = await DiscordChannel.find({ userId, notifyOnCrisis: true }).sort({ createdAt: 1 }).lean();
  const discordResultsSettled = await Promise.allSettled(
    crisisDiscordChannels.map(async (channel) => {
      const result = await sendDiscordMessage({
        webhookUrl: channel.webhookUrl,
        text: `${commonAlertText}\n\nChannel: ${channel.name}`
      });
      return {
        channelId: channel._id,
        channelName: channel.name,
        ...result
      };
    })
  );
  const discordResults = discordResultsSettled.map((r, idx) =>
    r.status === "fulfilled"
      ? r.value
      : {
          channelId: crisisDiscordChannels[idx]?._id || "unknown",
          channelName: crisisDiscordChannels[idx]?.name || "unknown",
          sent: false,
          reason: String(r.reason?.message || "Discord send failed")
        }
  );
  if (!discordResults.some((r) => r.sent) && env.discord.defaultWebhookUrl) {
    const fallback = await sendDiscordMessage({
      webhookUrl: env.discord.defaultWebhookUrl,
      text: `${commonAlertText}\n\nFallback delivery because no crisis-notify Discord channels were reachable.`
    });
    discordResults.push({
      channelId: "default",
      channelName: "default-webhook",
      usedFallbackDefaultWebhook: true,
      ...fallback
    });
  }
  const discordDeliveredCount = discordResults.filter((r) => r.sent).length;
  const discordSummaryReason =
    discordResults.length && !discordDeliveredCount
      ? discordResults.map((r) => `${r.channelName}: ${r.reason || "failed"}`).join(" | ")
      : "";

  // Crisis auto-voice-calls: call all crisis-notify contacts that have phone numbers.
  // Dispatch in parallel for near-simultaneous ringing.
  const phoneContacts = crisisContacts.filter((c) => String(c.phone || "").trim());
  const voiceCallResultsSettled = await Promise.allSettled(
    phoneContacts.map(async (c) => {
      const toNumber = String(c.phone || "").trim();
      const token = createVoiceRelayToken();
      const relayCall = await VoiceRelayCall.create({
        userId,
        contactId: c._id,
        toNumber,
        message: commonAlertText,
        token,
        status: "queued"
      });
      const twilioOut = await startTwilioVoiceCall({
        toNumber,
        relayCallId: relayCall._id,
        token
      });
      await VoiceRelayCall.findByIdAndUpdate(relayCall._id, {
        $set: {
          callSid: String(twilioOut?.sid || ""),
          status: String(twilioOut?.status || "queued")
        }
      });
      return {
        contactId: c._id,
        contactName: c.name,
        phone: toNumber,
        started: true,
        callSid: String(twilioOut?.sid || ""),
        status: String(twilioOut?.status || "queued")
      };
    })
  );
  const voiceCallAttempts = voiceCallResultsSettled.map((r, idx) =>
    r.status === "fulfilled"
      ? r.value
      : {
          contactId: phoneContacts[idx]?._id,
          contactName: phoneContacts[idx]?.name,
          phone: phoneContacts[idx]?.phone || "",
          started: false,
          reason: String(r.reason?.message || "Voice call failed")
        }
  );
  const voiceCallsStartedCount = voiceCallAttempts.filter((x) => x.started).length;

  const event = await CrisisEvent.create({
    userId,
    triggerText: message,
    severity,
    trustedContactNotified: Boolean(
      emailSentCount > 0 || telegramSentCount > 0 || telegramResult?.usedFallbackDefaultChatId || discordDeliveredCount > 0 || voiceCallsStartedCount > 0
    ),
    crisisLineOffered: true
  });

  if (emailSentCount > 0 || telegramSentCount > 0 || telegramResult?.usedFallbackDefaultChatId || discordDeliveredCount > 0 || voiceCallsStartedCount > 0) {
    await User.findByIdAndUpdate(userId, {
      $push: {
        notifications: {
          title: "Trusted contact outreach",
          message: `Crisis outreach sent. Emails: ${emailSentCount}, Telegram: ${telegramSentCount}, Discord channels: ${discordDeliveredCount}, Voice calls: ${voiceCallsStartedCount}.`
        }
      }
    });
  }

  return {
    eventId: event._id,
    uiAction: "LOCK_TO_SOOTHING_VIEW",
    trustedContactAlert: emailSentCount > 0 || telegramSentCount > 0 || telegramResult?.usedFallbackDefaultChatId || discordDeliveredCount > 0 || voiceCallsStartedCount > 0
      ? `Crisis outreach sent. Email: ${emailSentCount}/${crisisContacts.length} contacts, Telegram: ${telegramSentCount}/${crisisContacts.length} contacts${discordDeliveredCount > 0 ? `, Discord channels: ${discordDeliveredCount}` : ""}${voiceCallsStartedCount > 0 ? `, Voice calls started: ${voiceCallsStartedCount}` : ""}.`
      : `No crisis alert delivered. ${telegramResult.reason || "No crisis-notify contacts configured for outreach."} ${discordSummaryReason}`.trim(),
    trustedContactTransport: emailResult,
    trustedContactEmail: {
      sent: emailSentCount > 0,
      sentCount: emailSentCount,
      totalContacts: crisisContacts.length,
      attempts: emailAttempts
    },
    trustedContactTelegram: {
      sent: telegramSentCount > 0 || Boolean(telegramResult?.usedFallbackDefaultChatId),
      sentCount: telegramSentCount,
      totalContacts: crisisContacts.length,
      attempts: telegramAttempts,
      fallback: telegramResult?.usedFallbackDefaultChatId ? telegramResult : null
    },
    trustedContactDiscord: {
      sent: discordDeliveredCount > 0,
      deliveredCount: discordDeliveredCount,
      totalChannels: discordResults.filter((r) => r.channelId !== "default").length,
      attempts: discordResults
    },
    trustedContactVoiceCalls: {
      sent: voiceCallsStartedCount > 0,
      startedCount: voiceCallsStartedCount,
      totalContactsWithPhone: phoneContacts.length,
      attempts: voiceCallAttempts
    },
    crisisClassification: {
      type: alertPackage.crisisType,
      subject: alertPackage.subject
    },
    crisisBridge: `Offer one-tap call/chat to ${US_988}.`
  };
}
