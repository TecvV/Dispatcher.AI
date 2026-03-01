import { env } from "../config/env.js";
import { Contact } from "../models/Contact.js";

export async function sendTelegramMessage({ chatId, text }) {
  if (!env.telegram.botToken) {
    return { sent: false, reason: "Telegram bot token missing." };
  }
  const targetChatId = String(chatId || env.telegram.defaultChatId || "").trim();
  if (!targetChatId) {
    return { sent: false, reason: "Telegram chat ID missing." };
  }

  const url = `${env.telegram.apiBase}/bot${env.telegram.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      text: String(text || "").slice(0, 3500)
    })
  });

  const body = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const desc = parsed?.description ? ` (${parsed.description})` : "";
    return { sent: false, reason: `Telegram API error ${res.status}${desc}: ${body}` };
  }
  if (parsed && parsed.ok === false) {
    return { sent: false, reason: `Telegram API rejected request: ${parsed.description || body}` };
  }

  return { sent: true, response: parsed || body };
}

function sanitizePhone(phone) {
  const p = String(phone || "").trim().replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("+")) return p;
  return `+${p}`;
}

export async function relayToContact(contactId, userName, userMessage, options = {}) {
  if (!contactId) {
    return {
      sent: false,
      reason: "No contact selected. Please set up/select a contact first."
    };
  }

  const contact = await Contact.findById(contactId).lean();
  if (!contact) {
    return {
      sent: false,
      reason: "Selected contact was not found."
    };
  }
  if (!contact.telegramChatId) {
    return {
      sent: false,
      reason: `Contact ${contact.name} has no Telegram Chat ID configured.`
    };
  }

  if (!env.telegram.botToken) {
    return { sent: false, reason: "Telegram bot token missing." };
  }

  const relayBody = String(userMessage || "").trim() || "needs support right now";
  const messageText = `Hello ${contact.name}, ${userName} sent you a message via Wellness Bot:\n"${relayBody}"\n\nPlease check on them.\n\nNote: This is an auto-generated message. Do not reply here; replies will not be delivered.`;
  const userPhone = sanitizePhone(options.userPhone);
  const reply_markup = userPhone
    ? {
        inline_keyboard: [[{ text: "Call User", url: `tel:${userPhone}` }]]
      }
    : {
        inline_keyboard: [[{ text: "Call User", callback_data: "call_user_number_missing" }]]
      };

  const url = `${env.telegram.apiBase}/bot${env.telegram.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(contact.telegramChatId).trim(),
      text: messageText.slice(0, 3500),
      reply_markup
    })
  });

  const body = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }

  if (!res.ok || (parsed && parsed.ok === false)) {
    const desc = parsed?.description ? ` (${parsed.description})` : "";
    return {
      sent: false,
      reason: `Telegram relay failed${desc}: ${body}`
    };
  }

  return {
    sent: true,
    contact: {
      id: contact._id,
      name: contact.name
    },
    usedCallButton: Boolean(userPhone),
    reason: userPhone ? "" : "Relay sent, but user's phone is missing so call shortcut is disabled."
  };
}
