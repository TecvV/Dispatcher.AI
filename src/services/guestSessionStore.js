import crypto from "crypto";

const guestSessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function buildDefaultGuestSession({ guestId, name = "Guest User", email = "" } = {}) {
  return {
    id: guestId,
    createdAt: nowIso(),
    user: {
      id: guestId,
      name: String(name || "Guest User"),
      email: String(email || `${guestId}@guest.dispatcher.ai`)
    },
    contacts: [],
    discordChannels: [],
    notifications: [],
    chatHistory: [],
    reports: {
      daily: null,
      weekly: null,
      monthly: null
    },
    callLogs: [],
    escalation: {
      listenerProfile: null,
      wallet: { balanceInr: 0 },
      openSlots: [],
      discoverySlots: [],
      incomingBookings: [],
      outgoingBookings: [],
      chatByBookingId: {},
      wellnessLogs: []
    }
  };
}

export function createGuestSession({ name = "Guest User", email = "" } = {}) {
  const guestId = uid("guest");
  const session = buildDefaultGuestSession({ guestId, name, email });
  guestSessions.set(guestId, session);
  return session;
}

export function getGuestSession(guestId) {
  if (!guestId) return null;
  return guestSessions.get(String(guestId)) || null;
}

export function ensureGuestSession(guestId, fallback = {}) {
  const existing = getGuestSession(guestId);
  if (existing) return existing;
  const session = buildDefaultGuestSession({
    guestId: String(guestId),
    name: fallback?.name || "Guest User",
    email: fallback?.email || ""
  });
  guestSessions.set(String(guestId), session);
  return session;
}

export function clearGuestSession(guestId) {
  if (!guestId) return false;
  return guestSessions.delete(String(guestId));
}

export function appendGuestNotification(guestId, title, message) {
  const session = ensureGuestSession(guestId);
  session.notifications.push({
    _id: uid("notif"),
    title: String(title || "Notification"),
    message: String(message || ""),
    createdAt: nowIso()
  });
  if (session.notifications.length > 100) {
    session.notifications = session.notifications.slice(-100);
  }
}

export function addGuestContact(guestId, payload = {}) {
  const session = ensureGuestSession(guestId);
  const item = {
    _id: uid("contact"),
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    phone: String(payload.phone || "").trim(),
    type: String(payload.type || "other").trim().toLowerCase() || "other",
    notifyOnCrisis: Boolean(payload.notifyOnCrisis),
    telegramChatId: String(payload.telegramChatId || "").trim(),
    discordWebhookUrl: String(payload.discordWebhookUrl || "").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  session.contacts.unshift(item);
  return item;
}

export function updateGuestContact(guestId, contactId, patch = {}) {
  const session = ensureGuestSession(guestId);
  const idx = session.contacts.findIndex((x) => String(x._id) === String(contactId));
  if (idx < 0) return null;
  const current = session.contacts[idx];
  const next = {
    ...current,
    ...patch,
    _id: current._id,
    updatedAt: nowIso()
  };
  if (Object.prototype.hasOwnProperty.call(patch, "email")) {
    next.email = String(patch.email || "").trim().toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "type")) {
    next.type = String(patch.type || "other").trim().toLowerCase() || "other";
  }
  session.contacts[idx] = next;
  return next;
}

export function deleteGuestContact(guestId, contactId) {
  const session = ensureGuestSession(guestId);
  const before = session.contacts.length;
  session.contacts = session.contacts.filter((x) => String(x._id) !== String(contactId));
  return before !== session.contacts.length;
}

export function addGuestDiscordChannel(guestId, payload = {}) {
  const session = ensureGuestSession(guestId);
  const item = {
    _id: uid("channel"),
    name: String(payload.name || "").trim(),
    webhookUrl: String(payload.webhookUrl || "").trim(),
    notifyOnCrisis: Boolean(payload.notifyOnCrisis),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  session.discordChannels.unshift(item);
  return item;
}

export function updateGuestDiscordChannel(guestId, channelId, patch = {}) {
  const session = ensureGuestSession(guestId);
  const idx = session.discordChannels.findIndex((x) => String(x._id) === String(channelId));
  if (idx < 0) return null;
  const current = session.discordChannels[idx];
  const next = {
    ...current,
    ...patch,
    _id: current._id,
    updatedAt: nowIso()
  };
  session.discordChannels[idx] = next;
  return next;
}

export function deleteGuestDiscordChannel(guestId, channelId) {
  const session = ensureGuestSession(guestId);
  const before = session.discordChannels.length;
  session.discordChannels = session.discordChannels.filter((x) => String(x._id) !== String(channelId));
  return before !== session.discordChannels.length;
}

export function pushGuestChatMessage(guestId, role, text, mode = "companion") {
  const session = ensureGuestSession(guestId);
  const item = {
    _id: uid("msg"),
    role: String(role || "assistant"),
    text: String(text || ""),
    mode: String(mode || "companion"),
    createdAt: nowIso()
  };
  session.chatHistory.push(item);
  if (session.chatHistory.length > 2000) {
    session.chatHistory = session.chatHistory.slice(-2000);
  }
  return item;
}

export function clearGuestChatHistory(guestId) {
  const session = ensureGuestSession(guestId);
  session.chatHistory = [];
  session.reports = { daily: null, weekly: null, monthly: null };
  session.callLogs = [];
  return true;
}

export function upsertGuestReports(guestId, reports = {}) {
  const session = ensureGuestSession(guestId);
  session.reports = {
    daily: reports.daily || null,
    weekly: reports.weekly || null,
    monthly: reports.monthly || null
  };
  return session.reports;
}

export function getAllGuestSessions() {
  return guestSessions;
}

