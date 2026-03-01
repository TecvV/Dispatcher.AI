import { env } from "../config/env.js";

function toBase64Url(s) {
  return Buffer.from(s, "utf8").toString("base64url");
}

export async function createGmailDraft({ accessToken, toEmail, subject, body }) {
  if (!accessToken) {
    return {
      created: false,
      reason: "Missing Google access token for Gmail draft creation."
    };
  }
  if (!toEmail || !subject || !body) {
    return {
      created: false,
      reason: "Missing email draft fields (to, subject, body)."
    };
  }

  const mime = [
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body
  ].join("\r\n");

  const res = await fetch(`${env.gmailApiBase}/users/me/drafts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      message: { raw: toBase64Url(mime) }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      created: false,
      reason: `Gmail API error ${res.status}: ${text}`
    };
  }

  const data = await res.json();
  return {
    created: true,
    draftId: data.id,
    messageId: data.message?.id || null,
    hint: "Draft saved to Gmail. Open Gmail Drafts to send with one click."
  };
}

export async function sendGmailDraft({ accessToken, draftId }) {
  if (!accessToken) {
    return {
      sent: false,
      reason: "Missing Google access token for Gmail send."
    };
  }
  if (!draftId) {
    return {
      sent: false,
      reason: "Missing draftId."
    };
  }

  const res = await fetch(`${env.gmailApiBase}/users/me/drafts/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      id: draftId
    })
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      sent: false,
      reason: `Gmail API error ${res.status}: ${text}`
    };
  }

  const data = await res.json();
  return {
    sent: true,
    id: data.id,
    threadId: data.threadId
  };
}

export async function sendGmailMessage({ accessToken, toEmails, subject, body }) {
  if (!accessToken) return { sent: false, reason: "Missing Google access token for Gmail send." };
  if (!Array.isArray(toEmails) || !toEmails.length) return { sent: false, reason: "Missing recipient email(s)." };
  const mime = [
    `To: ${toEmails.join(", ")}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body
  ].join("\r\n");

  const res = await fetch(`${env.gmailApiBase}/users/me/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ raw: toBase64Url(mime) })
  });

  if (!res.ok) {
    const text = await res.text();
    return { sent: false, reason: `Gmail API error ${res.status}: ${text}` };
  }
  const data = await res.json();
  return { sent: true, id: data.id, threadId: data.threadId };
}
