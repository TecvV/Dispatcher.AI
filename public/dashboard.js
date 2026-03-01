import { api, clearToken, requireSession } from "./client.js";

const hello = document.getElementById("hello");
const logoutBtn = document.getElementById("logoutBtn");
const changePasswordBtn = document.getElementById("changePasswordBtn");
const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const contactPhone = document.getElementById("contactPhone");
const contactTelegram = document.getElementById("contactTelegram");
const contactType = document.getElementById("contactType");
const contactTypeCustom = document.getElementById("contactTypeCustom");
const contactCrisis = document.getElementById("contactCrisis");
const addContactBtn = document.getElementById("addContactBtn");
const contactList = document.getElementById("contactList");
const discordChannelName = document.getElementById("discordChannelName");
const discordChannelWebhook = document.getElementById("discordChannelWebhook");
const discordChannelCrisis = document.getElementById("discordChannelCrisis");
const addDiscordChannelBtn = document.getElementById("addDiscordChannelBtn");
const discordChannelList = document.getElementById("discordChannelList");
const genReportsBtn = document.getElementById("genReportsBtn");
const connectGoogleBtn = document.getElementById("connectGoogleBtn");
const disconnectGoogleBtn = document.getElementById("disconnectGoogleBtn");
const googleStatus = document.getElementById("googleStatus");
const dailyReport = document.getElementById("dailyReport");
const weeklyReport = document.getElementById("weeklyReport");
const monthlyReport = document.getElementById("monthlyReport");
const dailyBars = document.getElementById("dailyBars");
const weeklyBars = document.getElementById("weeklyBars");
const monthlyBars = document.getElementById("monthlyBars");
const kpiContacts = document.getElementById("kpiContacts");
const kpiDiscord = document.getElementById("kpiDiscord");
const kpiCrisis = document.getElementById("kpiCrisis");
const kpiMood = document.getElementById("kpiMood");
const notifications = document.getElementById("notifications");
const uiStatus = (main, sub = "", tone = "info") => window.setUIStatus?.(main, sub, tone);
let outgoingBookingIndex = [];
let incomingBookingIndex = [];
let cachedContacts = [];
let cachedDiscordChannels = [];
let cachedReports = { daily: null, weekly: null, monthly: null };
let cachedDashboard = null;

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function moodCountsFromReport(report) {
  const moods = report?.details?.moodCounts || {};
  return {
    distressed: Number(moods.distressed || report?.distressedCount || 0),
    uplifted: Number(moods.uplifted || 0),
    neutral: Number(moods.neutral || 0),
    crisis: Number(moods.crisis || 0)
  };
}

function animateCount(el, target, { duration = 700, suffix = "", decimals = 0 } = {}) {
  if (!el) return;
  const startRaw = String(el.textContent || "0").replace(/[^\d.-]/g, "");
  const start = Number(startRaw || 0);
  const end = Number(target || 0);
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - (1 - p) * (1 - p);
    const val = start + (end - start) * eased;
    el.textContent = `${val.toFixed(decimals)}${suffix}`;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderMoodBars(targetEl, report) {
  if (!targetEl) return;
  if (!report) {
    targetEl.innerHTML = "";
    return;
  }
  const counts = moodCountsFromReport(report);
  const total = Math.max(1, counts.distressed + counts.uplifted + counts.neutral + counts.crisis);
  const items = [
    { key: "distressed", label: "Low", value: counts.distressed, cls: "mood-low" },
    { key: "uplifted", label: "Better", value: counts.uplifted, cls: "mood-better" },
    { key: "neutral", label: "Okay", value: counts.neutral, cls: "mood-okay" },
    { key: "crisis", label: "Urgent", value: counts.crisis, cls: "mood-urgent" }
  ];
  targetEl.innerHTML = items
    .map((it) => {
      const pct = Math.max(0, Math.min(100, Math.round((it.value / total) * 100)));
      return `
        <div class="mood-row">
          <span class="mood-label">${it.label}</span>
          <div class="mood-track">
            <span class="mood-fill ${it.cls}" style="--fill:${pct}%"></span>
          </div>
          <span class="mood-num">${it.value}</span>
        </div>
      `;
    })
    .join("");
}

function computeMoodStability() {
  const weekly = cachedReports?.weekly;
  const monthly = cachedReports?.monthly;
  const swingWeekly = Number(weekly?.details?.swingCount || 0);
  const swingMonthly = Number(monthly?.details?.swingCount || 0);
  const avg = Number(weekly?.avgSentiment ?? monthly?.avgSentiment ?? 0);
  const stabilityFromSwings = Math.max(0, 100 - swingWeekly * 12 - Math.round(swingMonthly * 2.5));
  const sentimentBoost = Math.round(clamp01((avg + 1) / 2) * 18);
  return Math.max(0, Math.min(100, stabilityFromSwings + sentimentBoost));
}

function renderSnapshotKpis() {
  const contactCount = cachedContacts.length;
  const channelCount = cachedDiscordChannels.length;
  const crisisCount =
    cachedContacts.filter((c) => Boolean(c.notifyOnCrisis)).length +
    cachedDiscordChannels.filter((c) => Boolean(c.notifyOnCrisis)).length;
  const moodStability = computeMoodStability();
  animateCount(kpiContacts, contactCount, { duration: 540, decimals: 0 });
  animateCount(kpiDiscord, channelCount, { duration: 620, decimals: 0 });
  animateCount(kpiCrisis, crisisCount, { duration: 700, decimals: 0 });
  animateCount(kpiMood, moodStability, { duration: 760, suffix: "%", decimals: 0 });
}

function renderDashboardVisuals() {
  renderSnapshotKpis();
  renderMoodBars(dailyBars, cachedReports?.daily || null);
  renderMoodBars(weeklyBars, cachedReports?.weekly || null);
  renderMoodBars(monthlyBars, cachedReports?.monthly || null);
}

function renderContacts(items) {
  contactList.innerHTML = "";
  if (!items.length) {
    contactList.innerHTML = '<p class="muted">No contacts yet.</p>';
    return;
  }
  for (const c of items) {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `
      <div class="contact-main">
        <div class="row">
          <strong>${c.name}</strong>
          <span class="pill">${c.type}</span>
          ${c.notifyOnCrisis ? '<span class="pill">crisis notify</span>' : ""}
        </div>
        <div class="muted">${c.email}</div>
        ${c.phone ? `<div class="muted">Phone: ${c.phone}</div>` : ""}
        ${c.telegramChatId ? `<div class="muted">Telegram: ${c.telegramChatId}</div>` : ""}
      </div>
      <button class="ghost" data-id="${c._id}">Remove</button>
    `;
    contactList.appendChild(div);
  }
  for (const btn of contactList.querySelectorAll("button[data-id]")) {
    btn.addEventListener("click", async () => {
      await api(`/api/contacts/${btn.dataset.id}`, { method: "DELETE" });
      await loadContacts();
    });
  }
}

function normalizeDateLabel(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWhenTextCandidates(whenText) {
  const t = String(whenText || "").trim();
  if (!t) return [];
  const direct = new Date(t);
  const candidates = [];
  if (!Number.isNaN(direct.getTime())) candidates.push(direct.getTime());

  const m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})\s*([ap]m)/i);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = Number(m[3]);
    let hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6]);
    const ampm = String(m[7] || "").toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;

    const ddmm = new Date(year, b - 1, a, hour, minute, second, 0);
    if (!Number.isNaN(ddmm.getTime())) candidates.push(ddmm.getTime());

    const mmdd = new Date(year, a - 1, b, hour, minute, second, 0);
    if (!Number.isNaN(mmdd.getTime())) candidates.push(mmdd.getTime());
  }

  return [...new Set(candidates)];
}

function resolveNameForWhen(bookingIndex, whenText) {
  if (!whenText || !Array.isArray(bookingIndex) || !bookingIndex.length) return "";

  const norm = normalizeDateLabel(whenText);
  const byNorm = bookingIndex.find((b) => normalizeDateLabel(b.whenText) === norm);
  if (byNorm?.peerName) return byNorm.peerName;

  const candidates = parseWhenTextCandidates(whenText);
  if (!candidates.length) return "";

  let best = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const ts of candidates) {
    for (const row of bookingIndex) {
      const diff = Math.abs(Number(row.scheduledAtMs || 0) - ts);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = row;
      }
    }
  }

  if (best && bestDiff <= 2 * 60 * 1000) return best.peerName || "";
  return "";
}

function rewriteNotificationText(title, message) {
  const t = String(title || "");
  const msg = String(message || "");
  if (t === "Booking Response") {
    const accepted = msg.match(/^Your booking on (.+?) was accepted\.(.*)$/i);
    if (accepted) {
      const whenText = accepted[1];
      const tail = accepted[2] || "";
      const listenerName = resolveNameForWhen(outgoingBookingIndex, whenText);
      if (listenerName) {
        return `Your booking on ${whenText} was accepted by ${listenerName}.${tail}`;
      }
    }
    const rejected = msg.match(/^Your booking on (.+?) was rejected\.(.*)$/i);
    if (rejected) {
      const whenText = rejected[1];
      const tail = rejected[2] || "";
      const listenerName = resolveNameForWhen(outgoingBookingIndex, whenText);
      if (listenerName) {
        return `Your booking on ${whenText} was rejected by ${listenerName}.${tail}`;
      }
    }
  }

  if (t === "Booking Updated") {
    const accepted = msg.match(/^You accepted booking on (.+?) via (.+?)\.(.*)$/i);
    if (accepted) {
      const whenText = accepted[1];
      const mode = accepted[2];
      const tail = accepted[3] || "";
      const speakerName = resolveNameForWhen(incomingBookingIndex, whenText);
      if (speakerName) {
        return `You accepted booking request from ${speakerName} on ${whenText} via ${mode}.${tail}`;
      }
    }
    const rejected = msg.match(/^You rejected booking on (.+?)\.(.*)$/i);
    if (rejected) {
      const whenText = rejected[1];
      const tail = rejected[2] || "";
      const speakerName = resolveNameForWhen(incomingBookingIndex, whenText);
      if (speakerName) {
        return `You rejected booking request from ${speakerName} on ${whenText}.${tail}`;
      }
    }
  }

  if (t === "Session Cancelled") {
    const selfCancel = msg.match(/^You cancelled the slot scheduled on (.+?)\.(.*)$/i);
    if (selfCancel) {
      const whenText = selfCancel[1];
      const tail = selfCancel[2] || "";
      const listenerName = resolveNameForWhen(outgoingBookingIndex, whenText);
      if (listenerName) {
        return `You cancelled the slot scheduled with ${listenerName} on ${whenText}.${tail}`;
      }
    }
  }
  return msg;
}

function renderNotifications(items) {
  notifications.innerHTML = "";
  if (!items.length) {
    notifications.innerHTML = "<li>None yet.</li>";
    return;
  }
  for (const n of items) {
    const li = document.createElement("li");
    li.textContent = `${n.title}: ${rewriteNotificationText(n.title, n.message)}`;
    notifications.appendChild(li);
  }
}

function renderDiscordChannels(items) {
  discordChannelList.innerHTML = "";
  if (!items.length) {
    discordChannelList.innerHTML = '<p class="muted">No Discord channels yet.</p>';
    return;
  }
  for (const c of items) {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `
      <div class="contact-main">
        <div class="row">
          <strong>${c.name}</strong>
          <span class="pill">discord</span>
          ${c.notifyOnCrisis ? '<span class="pill">crisis notify</span>' : ""}
        </div>
        <div class="muted">Webhook configured</div>
      </div>
      <button class="ghost" data-discord-id="${c._id}">Remove</button>
    `;
    discordChannelList.appendChild(div);
  }
  for (const btn of discordChannelList.querySelectorAll("button[data-discord-id]")) {
    btn.addEventListener("click", async () => {
      await api(`/api/discord-channels/${btn.dataset.discordId}`, { method: "DELETE" });
      await loadDiscordChannels();
    });
  }
}

async function loadContacts() {
  const items = await api("/api/contacts");
  cachedContacts = Array.isArray(items) ? items : [];
  renderContacts(items);
  renderDashboardVisuals();
}

async function loadDiscordChannels() {
  const items = await api("/api/discord-channels");
  cachedDiscordChannels = Array.isArray(items) ? items : [];
  renderDiscordChannels(items);
  renderDashboardVisuals();
}

async function loadDashboard() {
  const [out, outgoingBookings, incomingBookings] = await Promise.all([
    api("/api/users/me/dashboard"),
    api("/api/escalation/booking/outgoing").catch(() => []),
    api("/api/escalation/booking/incoming").catch(() => [])
  ]);
  outgoingBookingIndex = Array.isArray(outgoingBookings)
    ? outgoingBookings.map((b) => ({
        whenText: new Date(b.scheduledAt).toLocaleString(),
        scheduledAtMs: new Date(b.scheduledAt).getTime(),
        peerName: String(b.listenerUserId?.name || "").trim()
      }))
    : [];
  incomingBookingIndex = Array.isArray(incomingBookings)
    ? incomingBookings.map((b) => ({
        whenText: new Date(b.scheduledAt).toLocaleString(),
        scheduledAtMs: new Date(b.scheduledAt).getTime(),
        peerName: String(b.speakerUserId?.name || "").trim()
      }))
    : [];
  renderNotifications(out.notifications || []);
  cachedDashboard = out;
  const connected = Boolean(out.integrations?.googleConnected);
  googleStatus.textContent = connected ? "Google Connected: Yes" : "Google Connected: No";
  renderDashboardVisuals();
}

function renderReportLine(report) {
  if (!report) return "No report yet.";
  const avg = Number(report.avgSentiment || 0);
  const moodWord =
    avg <= -0.35 ? "very low" :
    avg <= -0.15 ? "a bit low" :
    avg < 0.15 ? "mostly okay" :
    avg < 0.35 ? "better than usual" :
    "very positive";
  const details = report.details || {};
  const moods = details.moodCounts || {};
  const swings = Number(details.swingCount || 0);
  const distressed = Number(moods.distressed ?? report.distressedCount ?? 0);
  const uplifted = Number(moods.uplifted ?? 0);
  const neutral = Number(moods.neutral ?? 0);
  const crisis = Number(moods.crisis ?? 0);
  const count = Number(details.totalEntries || 0);

  const main = count
    ? `From ${count} check-ins, your overall mood looked ${moodWord}.`
    : `Overall, your mood looked ${moodWord}.`;
  const breakdown = `Low moments: ${distressed}, better moments: ${uplifted}, okay moments: ${neutral}, urgent moments: ${crisis}.`;
  const swingsText = swings > 0
    ? `Your mood changed ${swings} time${swings === 1 ? "" : "s"} in this period.`
    : "Your mood stayed fairly steady in this period.";
  const advice = String(report.consultAdvice || "")
    .replace(/No urgent escalation indicated\./gi, "No urgent action is needed right now.")
    .replace(/Consult doctor\/psychiatrist/gi, "Talk to your doctor or psychiatrist")
    .replace(/distress persists or worsens/gi, "low feelings continue or get worse")
    .replace(/Consult family\/friends first; escalate to doctor if no improvement\./gi, "Try talking to a trusted friend/family first. If things don’t improve, consult a doctor.");
  return `${main} ${breakdown} ${swingsText} ${advice}`.trim();
}

async function loadReports() {
  const out = await api("/api/agent/me/reports");
  cachedReports = {
    daily: out.daily || null,
    weekly: out.weekly || null,
    monthly: out.monthly || null
  };
  dailyReport.textContent = renderReportLine(out.daily);
  weeklyReport.textContent = renderReportLine(out.weekly);
  monthlyReport.textContent = renderReportLine(out.monthly);
  renderDashboardVisuals();
}

logoutBtn.addEventListener("click", () => {
  uiStatus("Logging out...", "Session cleared.", "ok");
  clearToken();
  window.location.href = "/login.html";
});

if (changePasswordBtn) {
  changePasswordBtn.addEventListener("click", async () => {
    try {
      uiStatus("Processing password change...", "Sending password reset link to your email.");
      const out = await api("/api/auth/change-password-email", { method: "POST", body: "{}" });
      uiStatus("Password reset email sent.", out.message || "Check your inbox for reset link.", "ok");
    } catch (err) {
      uiStatus("Password change failed.", err.message, "error");
    }
  });
}

addContactBtn.addEventListener("click", async () => {
  try {
    if (!contactName.value.trim() || !contactEmail.value.trim()) {
      uiStatus("Contact details missing.", "Please fill name and email.", "error");
      return;
    }
    const selectedType = String(contactType.value || "other").trim().toLowerCase();
    const finalType =
      selectedType === "other"
        ? String(contactTypeCustom.value || "").trim().toLowerCase()
        : selectedType;
    if (selectedType === "other" && !finalType) {
      uiStatus("Custom type missing.", "Please enter the contact type for 'Other'.", "error");
      return;
    }
    uiStatus("Adding contact...", "Saving trusted contact.");
    await api("/api/contacts", {
      method: "POST",
      body: JSON.stringify({
        name: contactName.value.trim(),
        email: contactEmail.value.trim(),
        phone: contactPhone.value.trim(),
        telegramChatId: contactTelegram.value.trim(),
        type: finalType || "other",
        notifyOnCrisis: contactCrisis.checked
      })
    });
    contactName.value = "";
    contactEmail.value = "";
    contactTelegram.value = "";
    contactPhone.value = "";
    contactType.value = "doctor";
    contactTypeCustom.value = "";
    contactTypeCustom.style.display = "none";
    contactCrisis.checked = false;
    await loadContacts();
    uiStatus("Contact added.", "Trusted contact saved successfully.", "ok");
  } catch (err) {
    uiStatus("Failed to add contact.", err.message, "error");
  }
});

contactType.addEventListener("change", () => {
  const selectedType = String(contactType.value || "").toLowerCase();
  const showCustom = selectedType === "other";
  contactTypeCustom.style.display = showCustom ? "block" : "none";
  if (!showCustom) contactTypeCustom.value = "";
});

addDiscordChannelBtn.addEventListener("click", async () => {
  try {
    if (!discordChannelName.value.trim() || !discordChannelWebhook.value.trim()) {
      uiStatus("Discord channel details missing.", "Please fill channel label and webhook URL.", "error");
      return;
    }
    uiStatus("Adding Discord channel...", "Saving webhook.");
    await api("/api/discord-channels", {
      method: "POST",
      body: JSON.stringify({
        name: discordChannelName.value.trim(),
        webhookUrl: discordChannelWebhook.value.trim(),
        notifyOnCrisis: discordChannelCrisis.checked
      })
    });
    discordChannelName.value = "";
    discordChannelWebhook.value = "";
    discordChannelCrisis.checked = false;
    await loadDiscordChannels();
    uiStatus("Discord channel added.", "Webhook saved successfully.", "ok");
  } catch (err) {
    uiStatus("Failed to add Discord channel.", err.message, "error");
  }
});

genReportsBtn.addEventListener("click", async () => {
  try {
    uiStatus("Generating mood reports...", "Building 24h, weekly, and monthly behavior summaries.");
    await api("/api/agent/me/reports/generate", { method: "POST", body: "{}" });
    await loadReports();
    uiStatus("Mood reports updated.", "24h, weekly, and monthly reports are ready.", "ok");
  } catch (err) {
    uiStatus("Mood report generation failed.", err.message, "error");
  }
});

connectGoogleBtn.addEventListener("click", async () => {
  try {
    uiStatus("Connecting Google account...", "Redirecting to Google consent.");
    const out = await api("/api/oauth/google/url");
    window.location.href = out.authUrl;
  } catch (err) {
    uiStatus("Google connect failed.", err.message, "error");
  }
});

disconnectGoogleBtn.addEventListener("click", async () => {
  try {
    uiStatus("Disconnecting Google account...", "Clearing saved Google tokens.");
    await api("/api/oauth/google/disconnect", { method: "POST", body: "{}" });
    await loadDashboard();
    uiStatus("Google disconnected.", "You can reconnect using Connect Google Account.", "ok");
  } catch (err) {
    uiStatus("Google disconnect failed.", err.message, "error");
  }
});

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const oauthState = params.get("google_oauth");
  const oauthReason = params.get("reason");
  if (oauthState === "success") {
    uiStatus("Google account connected.", "Gmail + Calendar actions are now enabled.", "ok");
    window.history.replaceState({}, "", "/dashboard");
  } else if (oauthState === "error") {
    uiStatus("Google OAuth failed.", oauthReason || "Unknown OAuth error.", "error");
    window.history.replaceState({}, "", "/dashboard");
  }

  const user = await requireSession();
  if (!user) return;
  hello.textContent = `Welcome, ${user.name}`;
  try {
    uiStatus("Loading dashboard...", "Fetching contacts and notifications.");
    await Promise.all([loadContacts(), loadDiscordChannels(), loadDashboard()]);
    uiStatus("Dashboard ready.", "You can manage contacts and integrations.", "ok");
  } catch (err) {
    uiStatus("Dashboard load failed.", err.message, "error");
  }
})();
