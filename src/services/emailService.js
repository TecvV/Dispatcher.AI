import nodemailer from "nodemailer";
import { env } from "../config/env.js";

function getMailer() {
  const { host, port, secure, user, pass, fromEmail } = env.smtp;
  if (!host || !port || !user || !pass || !fromEmail) return null;
  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    }),
    fromEmail
  };
}

export async function sendTrustedContactAlertEmail({ to, userName, subject, text }) {
  const finalSubject = String(subject || "").trim() || "Urgent check-in requested";
  const finalText =
    String(text || "").trim() ||
    `Hi, your friend ${userName || "someone"} might need a check-in right now.`;

  return sendSystemEmail({
    to,
    subject: finalSubject,
    text: finalText
  });
}

export async function sendSystemEmail({ to, subject, text }) {
  const cfg = getMailer();
  const finalSubject = String(subject || "").trim() || "Dispatcher.AI notification";
  const finalText = String(text || "").trim();

  if (!cfg) {
    return {
      sent: false,
      provider: "smtp",
      reason: "SMTP env not configured",
      preview: `${finalSubject}: ${finalText}`
    };
  }

  const result = await cfg.transporter.sendMail({
    from: cfg.fromEmail,
    to,
    subject: finalSubject,
    text: finalText
  });

  return {
    sent: true,
    provider: "smtp",
    messageId: result.messageId
  };
}
