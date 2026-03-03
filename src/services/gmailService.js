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

export async function sendGmailMessage({ accessToken, toEmails, subject, body, attachments = [] }) {
  if (!accessToken) return { sent: false, reason: "Missing Google access token for Gmail send." };
  if (!Array.isArray(toEmails) || !toEmails.length) return { sent: false, reason: "Missing recipient email(s)." };
  const hasAttachments = attachments.length > 0;
  const boundary = `boundary_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const headerLines = [`To: ${toEmails.join(", ")}`, `Subject: ${subject}`, "MIME-Version: 1.0"];
  let mime = "";
  if (!hasAttachments) {
    mime = [
      ...headerLines,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body
    ].join("\r\n");
  } else {
    const parts = [];
    parts.push(`--${boundary}`);
    parts.push("Content-Type: text/plain; charset=utf-8");
    parts.push("Content-Transfer-Encoding: 7bit");
    parts.push("");
    parts.push(String(body || ""));
    for (const file of attachments) {
      const fileName = String(file?.fileName || file?.filename || "attachment").replace(/[\r\n"]/g, "_");
      const mimeType = String(file?.mimeType || "application/octet-stream");
      const content = file?.content;
      if (!content || !Buffer.isBuffer(content)) continue;
      const base64 = content.toString("base64").replace(/(.{76})/g, "$1\r\n");
      parts.push(`--${boundary}`);
      parts.push(`Content-Type: ${mimeType}; name="${fileName}"`);
      parts.push(`Content-Disposition: attachment; filename="${fileName}"`);
      parts.push("Content-Transfer-Encoding: base64");
      parts.push("");
      parts.push(base64);
    }
    parts.push(`--${boundary}--`);
    mime = [
      ...headerLines,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      ...parts
    ].join("\r\n");
  }

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
