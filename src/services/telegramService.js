import { env } from "../config/env.js";
import { Contact } from "../models/Contact.js";

export async function sendTelegramMessage({ chatId, text, attachments = [] }) {
  if (!env.telegram.botToken) {
    return { sent: false, reason: "Telegram bot token missing." };
  }
  const targetChatId = String(chatId || env.telegram.defaultChatId || "").trim();
  if (!targetChatId) {
    return { sent: false, reason: "Telegram chat ID missing." };
  }

  const sendTextUrl = `${env.telegram.apiBase}/bot${env.telegram.botToken}/sendMessage`;
  const baseText = String(text || "").slice(0, 3500);
  const res = await fetch(sendTextUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      text: baseText
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

  if (Array.isArray(attachments) && attachments.length) {
    for (const file of attachments) {
      const fileName = String(file?.fileName || "attachment").trim() || "attachment";
      const mimeType = String(file?.mimeType || "application/octet-stream");
      const content = file?.content;
      if (!Buffer.isBuffer(content) || !content.length) continue;
      const form = new FormData();
      form.append("chat_id", targetChatId);
      form.append("caption", `Attachment: ${fileName}`);
      form.append("document", new Blob([content], { type: mimeType }), fileName);
      const docUrl = `${env.telegram.apiBase}/bot${env.telegram.botToken}/sendDocument`;
      const docRes = await fetch(docUrl, { method: "POST", body: form });
      if (!docRes.ok) {
        const docBody = await docRes.text();
        return { sent: false, reason: `Telegram attachment error ${docRes.status}: ${docBody}` };
      }
    }
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
