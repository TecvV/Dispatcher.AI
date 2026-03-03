import { env } from "../config/env.js";
import { Contact } from "../models/Contact.js";

function normalizeWebhookUrl(url) {
  return String(url || "").trim();
}

export async function sendDiscordMessage({ webhookUrl, channelId, text, attachments = [] }) {
  const content = String(text || "").trim();
  if (!content) {
    return { sent: false, reason: "Discord message text is empty." };
  }

  const targetWebhook = normalizeWebhookUrl(webhookUrl || env.discord.defaultWebhookUrl);
  if (targetWebhook) {
    let res;
    if (Array.isArray(attachments) && attachments.length) {
      const form = new FormData();
      form.append(
        "payload_json",
        JSON.stringify({
          content: content.slice(0, 1900)
        })
      );
      let i = 0;
      for (const file of attachments) {
        const fileName = String(file?.fileName || "attachment").trim() || "attachment";
        const mimeType = String(file?.mimeType || "application/octet-stream");
        const contentBuffer = file?.content;
        if (!Buffer.isBuffer(contentBuffer) || !contentBuffer.length) continue;
        form.append(`files[${i}]`, new Blob([contentBuffer], { type: mimeType }), fileName);
        i += 1;
      }
      res = await fetch(targetWebhook, {
        method: "POST",
        body: form
      });
    } else {
      res = await fetch(targetWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.slice(0, 1900)
        })
      });
    }
    const body = await res.text();
    if (!res.ok) {
      return { sent: false, reason: `Discord webhook error ${res.status}: ${body}` };
    }
    return { sent: true, via: "webhook", response: body || "ok" };
  }

  if (!env.discord.botToken) {
    return { sent: false, reason: "Discord bot token missing." };
  }
  const targetChannelId = String(channelId || env.discord.defaultChannelId || "").trim();
  if (!targetChannelId) {
    return { sent: false, reason: "Discord channel ID missing." };
  }

  const url = `${env.discord.apiBase}/channels/${targetChannelId}/messages`;
  if (Array.isArray(attachments) && attachments.length) {
    return {
      sent: false,
      reason: "Discord bot-channel mode does not support attachments in this build. Use webhook channel dispatch."
    };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${env.discord.botToken}`
    },
    body: JSON.stringify({
      content: content.slice(0, 1900)
    })
  });
  const body = await res.text();
  if (!res.ok) {
    return { sent: false, reason: `Discord API error ${res.status}: ${body}` };
  }
  return { sent: true, via: "bot", response: body || "ok" };
}

export async function relayToDiscordContact(contactId, userName, userMessage) {
  if (!contactId) {
    return { sent: false, reason: "No contact selected. Please set up/select a contact first." };
  }

  const contact = await Contact.findById(contactId).lean();
  if (!contact) {
    return { sent: false, reason: "Selected contact was not found." };
  }
  if (!contact.discordWebhookUrl) {
    return { sent: false, reason: `Contact ${contact.name} has no Discord webhook configured.` };
  }

  const relayBody = String(userMessage || "").trim() || "needs support right now";
  const messageText = `${userName} has shared this message via Wellness Bot for ${contact.name}:\n"${relayBody}"\n\nNote: This is an auto-generated message. Do not reply here; replies will not be delivered.`;

  const sent = await sendDiscordMessage({
    webhookUrl: contact.discordWebhookUrl,
    text: messageText
  });

  return {
    ...sent,
    contact: {
      id: contact._id,
      name: contact.name
    }
  };
}
