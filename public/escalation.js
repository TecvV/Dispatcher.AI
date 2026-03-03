import { api, clearToken, getToken, requireSession } from "./client.js";

const logoutBtn = document.getElementById("logoutBtn");
const changePasswordBtn = document.getElementById("changePasswordBtn");
const interestsInput = document.getElementById("interestsInput");
const answersInput = document.getElementById("answersInput");
const applyListenerBtn = document.getElementById("applyListenerBtn");
const editProfileBtn = document.getElementById("editProfileBtn");
const viewPerformanceBtn = document.getElementById("viewPerformanceBtn");
const profileHintText = document.getElementById("profileHintText");
const isListeningEnabled = document.getElementById("isListeningEnabled");
const myProfileText = document.getElementById("myProfileText");
const walletText = document.getElementById("walletText");
const walletTopupInput = document.getElementById("walletTopupInput");
const walletTopupBtn = document.getElementById("walletTopupBtn");
const slotDate = document.getElementById("slotDate");
const slotTime = document.getElementById("slotTime");
const slotFeeInr = document.getElementById("slotFeeInr");
const openSlotBtn = document.getElementById("openSlotBtn");
const myOpenSlotsBox = document.getElementById("myOpenSlotsBox");
const incomingBookingsBox = document.getElementById("incomingBookingsBox");
const outgoingBookingsBox = document.getElementById("outgoingBookingsBox");
const chatBookingSelect = document.getElementById("chatBookingSelect");
const chatSessionStatus = document.getElementById("chatSessionStatus");
const meetSessionStatus = document.getElementById("meetSessionStatus");
const chatMessagesBox = document.getElementById("chatMessagesBox");
const chatMessageInput = document.getElementById("chatMessageInput");
const sendChatMessageBtn = document.getElementById("sendChatMessageBtn");
const purgeChatBtn = document.getElementById("purgeChatBtn");
const listenerMarketplaceBox = document.getElementById("listenerMarketplaceBox");
const speakingSessionsBox = document.getElementById("speakingSessionsBox");
const listeningSessionsBox = document.getElementById("listeningSessionsBox");
const wellnessLogsBox = document.getElementById("wellnessLogsBox");

const listenerDetailDialog = document.getElementById("listenerDetailDialog");
const listenerDetailContent = document.getElementById("listenerDetailContent");
const closeListenerDetailBtn = document.getElementById("closeListenerDetailBtn");
const closeListenerDetailX = document.getElementById("closeListenerDetailX");

const ratingDialog = document.getElementById("ratingDialog");
const ratingDialogContext = document.getElementById("ratingDialogContext");
const rateEmpathy = document.getElementById("rateEmpathy");
const ratePoliteness = document.getElementById("ratePoliteness");
const ratePatience = document.getElementById("ratePatience");
const rateEngagement = document.getElementById("rateEngagement");
const rateConnection = document.getElementById("rateConnection");
const rateTipsQuality = document.getElementById("rateTipsQuality");
const ratingNotes = document.getElementById("ratingNotes");
const submitRatingBtn = document.getElementById("submitRatingBtn");
const closeRatingDialogX = document.getElementById("closeRatingDialogX");
const profileDialog = document.getElementById("profileDialog");
const profileDialogInterests = document.getElementById("profileDialogInterests");
const profileDialogAnswers = document.getElementById("profileDialogAnswers");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const cancelProfileBtn = document.getElementById("cancelProfileBtn");
const closeProfileDialogX = document.getElementById("closeProfileDialogX");
const performanceDialog = document.getElementById("performanceDialog");
const performanceDialogContent = document.getElementById("performanceDialogContent");
const closePerformanceDialogBtn = document.getElementById("closePerformanceDialogBtn");
const closePerformanceDialogX = document.getElementById("closePerformanceDialogX");
const openHubSnapshotBtn = document.getElementById("openHubSnapshotBtn");
const openSessionVisualsBtn = document.getElementById("openSessionVisualsBtn");
const hubSnapshotDialog = document.getElementById("hubSnapshotDialog");
const closeHubSnapshotDialogX = document.getElementById("closeHubSnapshotDialogX");
const hubSnapshotContent = document.getElementById("hubSnapshotContent");
const sessionVisualsDialog = document.getElementById("sessionVisualsDialog");
const closeSessionVisualsDialogX = document.getElementById("closeSessionVisualsDialogX");
const sessionVisualsContent = document.getElementById("sessionVisualsContent");

const uiStatus = (main, sub = "", tone = "info") => window.setUIStatus?.(main, sub, tone);

let currentUser = null;
let discoverySlots = [];
let myOpenSlots = [];
let incomingBookings = [];
let outgoingBookings = [];
let chatBookingMap = new Map();
let selectedSlotId = "";
let selectedSlot = null;
let pendingRatingBookingId = "";
let ws = null;
let wsReconnectTimer = null;
let activeChatSubscription = "";
let currentParticipants = null;
let chatCountdownTimer = null;
let countdownAutoEndInProgress = false;
let meetCountdownTimer = null;
const meetCompletionInProgress = new Set();
let ratingSubmitInProgress = false;
let currentWalletBalance = 0;

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtDateTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function parseApiError(err, fallback) {
  const text = String(err?.message || "");
  return text || fallback;
}

function formatQualifications(items, max = 2) {
  const arr = Array.isArray(items) ? items.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!arr.length) return "Not provided";
  if (arr.length <= max) return arr.join(", ");
  return `${arr.slice(0, max).join(", ")} +${arr.length - max} more`;
}

function getBookingById(id) {
  return [...incomingBookings, ...outgoingBookings].find((b) => String(b._id) === String(id)) || null;
}

function resolveUserName(userRef, fallbackRole) {
  if (userRef && typeof userRef === "object" && String(userRef.name || "").trim()) {
    return String(userRef.name).trim();
  }
  const refId = userRef && typeof userRef === "object" ? String(userRef._id || "") : String(userRef || "");
  const currentId = String(currentUser?._id || currentUser?.id || "");
  if (refId && currentId === refId && String(currentUser?.name || "").trim()) {
    return String(currentUser.name).trim();
  }
  return fallbackRole;
}

function money(n) {
  return `Rs ${Number(n || 0).toFixed(2)}`;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function renderAuditDonut(score) {
  const s = Number(score);
  const safe = Number.isFinite(s) ? Math.max(0, Math.min(10, s)) : 0;
  const pct = safe / 10;
  const angle = Math.round(pct * 360);
  const color = safe >= 8 ? "#2DD4BF" : safe >= 5 ? "#F59E0B" : "#FF7F7F";
  return `
    <div class="audit-donut" style="--audit-angle:${angle}deg; --audit-color:${color};">
      <span>${safe.toFixed(2)}/10</span>
    </div>
  `;
}

function renderSettlementBar(listenerAmt, speakerAmt) {
  const l = Math.max(0, Number(listenerAmt || 0));
  const s = Math.max(0, Number(speakerAmt || 0));
  const total = l + s;
  const lp = total > 0 ? Math.round((l / total) * 100) : 0;
  const sp = total > 0 ? 100 - lp : 0;
  return `
    <div class="settlement-wrap">
      <div class="settlement-labels">
        <span class="listener-tag">Listener: ${money(l)}</span>
        <span class="speaker-tag">Speaker: ${money(s)}</span>
      </div>
      <div class="settlement-bar">
        <div class="listener-seg" style="width:${lp}%">${lp}%</div>
        <div class="speaker-seg" style="width:${sp}%">${sp}%</div>
      </div>
    </div>
  `;
}

function renderSupportRadar(breakdown = {}) {
  const keys = ["empathy", "politeness", "patience", "engagement", "connection", "tipsQuality"];
  const labels = ["E", "Po", "Pa", "En", "Co", "Ti"];
  const vals = keys.map((k) => Math.max(0, Math.min(10, Number(breakdown?.[k] ?? 0))));
  const w = 250;
  const h = 130;
  const left = 20;
  const right = 10;
  const top = 10;
  const bottom = 22;
  const cw = w - left - right;
  const ch = h - top - bottom;
  const step = keys.length > 1 ? cw / (keys.length - 1) : 0;
  const xAt = (i) => left + i * step;
  const yAt = (v) => top + (1 - v / 10) * ch;

  const linePoints = vals.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
  const areaPoints = `${left},${top + ch} ${linePoints} ${left + cw},${top + ch}`;
  const y5 = yAt(5);
  const y10 = yAt(10);

  const dots = vals
    .map((v, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="2.4"></circle>`)
    .join("");

  const xLabels = labels
    .map(
      (txt, i) =>
        `<text x="${xAt(i).toFixed(1)}" y="${h - 6}" text-anchor="middle">${txt}</text>`
    )
    .join("");

  return `
    <svg class="support-area-chart" viewBox="0 0 ${w} ${h}" aria-label="Parameter area chart">
      <line class="grid-line" x1="${left}" y1="${top + ch}" x2="${left + cw}" y2="${top + ch}" />
      <line class="grid-line" x1="${left}" y1="${y5.toFixed(1)}" x2="${left + cw}" y2="${y5.toFixed(1)}" />
      <line class="grid-line" x1="${left}" y1="${y10.toFixed(1)}" x2="${left + cw}" y2="${y10.toFixed(1)}" />
      <polygon class="area-fill" points="${areaPoints}" />
      <polyline class="area-line" points="${linePoints}" />
      ${dots}
      ${xLabels}
    </svg>
  `;
}

function renderParameterRatings(breakdown = {}) {
  const keys = [
    ["empathy", "Empathy"],
    ["politeness", "Politeness"],
    ["patience", "Patience"],
    ["engagement", "Engagement"],
    ["connection", "Connection"],
    ["tipsQuality", "Tips"]
  ];
  const items = keys.map(([k, label]) => {
    const raw = breakdown?.[k];
    const val = Number(raw);
    const shown = Number.isFinite(val) ? Number(val.toFixed(2)) : "-";
    return `<span class="rating-chip"><strong>${label}:</strong> ${shown}</span>`;
  });
  return `<div class="param-ratings">${items.join("")}</div>`;
}

function takeIcon(line) {
  const t = String(line || "").toLowerCase();
  if (t.includes("walk") || t.includes("exercise") || t.includes("run")) return "👟";
  if (t.includes("mindful") || t.includes("breathe") || t.includes("meditation")) return "🧠";
  if (t.includes("sleep") || t.includes("rest")) return "🌙";
  if (t.includes("water") || t.includes("hydration")) return "💧";
  if (t.includes("talk") || t.includes("friend") || t.includes("family")) return "🤝";
  return "✨";
}

function takeIconLabel(line) {
  const t = String(line || "").toLowerCase();
  if (t.includes("walk") || t.includes("exercise") || t.includes("run")) return "MOVE";
  if (t.includes("mindful") || t.includes("breathe") || t.includes("meditation")) return "MIND";
  if (t.includes("sleep") || t.includes("rest")) return "REST";
  if (t.includes("water") || t.includes("hydration")) return "CARE";
  if (t.includes("talk") || t.includes("friend") || t.includes("family")) return "BOND";
  return "STEP";
}

function renderTakeawayChecklist(summary) {
  const lines = String(summary || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const bullets = lines
    .filter((x) => x.startsWith("- "))
    .map((x) => x.slice(2).trim())
    .filter(Boolean);
  if (!bullets.length) {
    return `<div class="takeaway-empty">No actionable takeaways captured for this session.</div>`;
  }
  return bullets
    .map(
      (b, idx) => `
      <label class="takeaway-item">
        <input type="checkbox" data-takeaway="${idx}" />
        <span class="take-icon" aria-hidden="true">${takeIconLabel(b)}</span>
        <span class="take-text">${esc(b)}</span>
      </label>
    `
    )
    .join("");
}

function renderProfile(profile) {
  if (!profile) {
    myProfileText.textContent = "Not registered yet.";
    if (isListeningEnabled) {
      isListeningEnabled.checked = false;
      isListeningEnabled.disabled = true;
    }
    profileHintText.textContent = "Apply once, then toggle your live listening availability.";
    interestsInput.style.display = "";
    answersInput.style.display = "";
    applyListenerBtn.style.display = "";
    editProfileBtn.style.display = "none";
    viewPerformanceBtn.style.display = "none";
    return;
  }
  myProfileText.textContent =
    `Tier: ${profile.tier} | Avg rating: ${Number(profile.averageSatisfaction || 0).toFixed(2)} | ` +
    `Rated sessions: ${Number(profile.totalRatedSessions || 0)} | Premium eligible: ${profile.walletUnlocked ? "Yes" : "No"} | ` +
    `Listening: ${profile.isListeningEnabled ? "Enabled" : "Disabled"}`;
  if (isListeningEnabled) {
    isListeningEnabled.checked = Boolean(profile.isListeningEnabled);
    isListeningEnabled.disabled = false;
  }
  profileHintText.textContent = "Profile saved. Use Edit Profile only when you want to change it.";
  interestsInput.style.display = "none";
  answersInput.style.display = "none";
  applyListenerBtn.style.display = "none";
  editProfileBtn.style.display = "";
  viewPerformanceBtn.style.display = "";
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const qualifications = Array.isArray(profile.qualificationAnswers) ? profile.qualificationAnswers : [];
  interestsInput.value = interests.join(", ");
  answersInput.value = qualifications.join("\n");
  profileDialogInterests.value = interests.join(", ");
  profileDialogAnswers.value = qualifications.join("\n");
  // Keep snapshot dialogs aligned with the same profile source shown in "My Listener Profile".
  currentUser = {
    ...(currentUser || {}),
    listenerProfile: {
      ...(currentUser?.listenerProfile || {}),
      averageSatisfaction: Number(profile.averageSatisfaction || 0),
      totalRatedSessions: Number(profile.totalRatedSessions || 0),
      isListeningEnabled: Boolean(profile.isListeningEnabled),
      tier: String(profile.tier || "novice")
    }
  };
}

function getCompletedListeningSessionsForCharts() {
  const completedListening = incomingBookings
    .filter((b) => String(b.status) === "completed")
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const keys = ["empathy", "politeness", "patience", "engagement", "connection", "tipsQuality"];
  const keyLabels = ["Empathy", "Politeness", "Patience", "Engagement", "Connection", "Tips"];
  return completedListening.map((b, idx) => {
    const breakdown = b.speakerRatingBreakdown || {};
    const values = keys.map((k) => {
      const v = Number(breakdown?.[k]);
      return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 0;
    });
    const avgFromBreakdown = values.reduce((s, n) => s + n, 0) / keys.length;
    const score = Number(b.speakerSessionRating);
    const avg = Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : avgFromBreakdown;
    const d = new Date(b.scheduledAt);
    const shortLabel = Number.isNaN(d.getTime())
      ? `Session ${idx + 1}`
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return {
      id: String(b._id || idx),
      label: shortLabel,
      when: b.scheduledAt,
      speakerName: String(b.speakerUserId?.name || "Speaker"),
      values,
      avg,
      min: Math.min(...values),
      max: Math.max(...values),
      bestIndex: values.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0),
      worstIndex: values.reduce((worst, v, i, arr) => (v < arr[worst] ? i : worst), 0),
      keyLabels
    };
  });
}

function formatPerfSessionLabel(index, session) {
  const d = new Date(session?.when || "");
  if (Number.isNaN(d.getTime())) return `Session ${index + 1}`;
  return `Session ${index + 1}`;
}

function perfDateLabel(session) {
  const d = new Date(session?.when || "");
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderMasterAreaChartSvg(series, chartId = "master") {
  const w = 760;
  const h = 260;
  const left = 44;
  const right = 14;
  const top = 16;
  const bottom = 38;
  const cw = w - left - right;
  const ch = h - top - bottom;
  const step = series.length > 1 ? cw / (series.length - 1) : 0;
  const xAt = (i) => left + i * step;
  const yAt = (v) => top + (1 - v / 10) * ch;
  const linePoints = series.map((s, i) => `${xAt(i).toFixed(1)},${yAt(s.avg).toFixed(1)}`).join(" ");
  const areaPoints = `${left},${top + ch} ${linePoints} ${left + cw},${top + ch}`;
  const xLabels = series
    .map((s, i) => `<text class="sync-x-label" x="${xAt(i)}" y="${h - 10}" text-anchor="middle">${esc(formatPerfSessionLabel(i, s))}</text>`)
    .join("");
  const yTicks = [0, 5, 10]
    .map(
      (v) => `
      <line class="sync-grid" x1="${left}" y1="${yAt(v)}" x2="${left + cw}" y2="${yAt(v)}"></line>
      <text class="sync-y-label" x="${left - 8}" y="${yAt(v) + 3}" text-anchor="end">${v}</text>
    `
    )
    .join("");
  const nodes = series
    .map(
      (s, i) =>
        `<circle class="sync-node master-node" data-sync="${i}" data-kind="master" data-date="${esc(
          perfDateLabel(s)
        )}" data-speaker="${esc(s.speakerName || "Speaker")}" data-score="${Number(s.avg).toFixed(2)}" cx="${xAt(i)}" cy="${yAt(
          s.avg
        )}" r="4"></circle>`
    )
    .join("");
  return `
    <svg class="perf-svg sync-chart" data-chart-id="${esc(chartId)}" viewBox="0 0 ${w} ${h}" aria-label="Master overall chart">
      <defs>
        <linearGradient id="masterAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2DD4BF" stop-opacity="0.42"></stop>
          <stop offset="100%" stop-color="#2DD4BF" stop-opacity="0.02"></stop>
        </linearGradient>
      </defs>
      ${yTicks}
      <line class="sync-axis" x1="${left}" y1="${top + ch}" x2="${left + cw}" y2="${top + ch}"></line>
      <polygon class="master-area" points="${areaPoints}"></polygon>
      <polyline class="master-line" points="${linePoints}"></polyline>
      ${nodes}
      <line class="sync-cursor" data-cursor-for="${esc(chartId)}" x1="${left}" y1="${top}" x2="${left}" y2="${top + ch}"></line>
      ${xLabels}
      <text class="sync-y-title" x="12" y="${top + ch / 2}" transform="rotate(-90 12 ${top + ch / 2})" text-anchor="middle">Rating (0-10)</text>
    </svg>
  `.replace('<polygon class="master-area"', '<polygon class="master-area" style="fill:url(#masterAreaGrad)"');
}

function renderMiniParameterChartSvg(series, paramIdx, paramName, chartId) {
  const w = 240;
  const h = 160;
  const left = 34;
  const right = 10;
  const top = 16;
  const bottom = 28;
  const cw = w - left - right;
  const ch = h - top - bottom;
  const step = series.length > 1 ? cw / (series.length - 1) : 0;
  const xAt = (i) => left + i * step;
  const yAt = (v) => top + (1 - v / 10) * ch;
  const paramValues = series.map((s) => Number(s.values[paramIdx] ?? 0));
  const avg = paramValues.reduce((sum, v) => sum + v, 0) / Math.max(1, paramValues.length);
  const stroke = avg < 6 ? "#FB7185" : "#2DD4BF";
  const linePoints = paramValues.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
  const areaPoints = `${left},${top + ch} ${linePoints} ${left + cw},${top + ch}`;
  const nodes = series
    .map(
      (s, i) =>
        `<circle class="sync-node mini-node" data-sync="${i}" data-kind="mini" data-chart="${esc(chartId)}" data-parameter="${esc(
          paramName
        )}" data-date="${esc(perfDateLabel(s))}" data-score="${Number(s.values[paramIdx] ?? 0).toFixed(2)}" cx="${xAt(i)}" cy="${yAt(
          s.values[paramIdx]
        )}" r="3.2" style="fill:${Number(s.values[paramIdx]) < 6 ? "#FB7185" : "#2DD4BF"}"></circle>`
    )
    .join("");
  const yTicks = [0, 5, 10]
    .map(
      (v) => `
      <line class="sync-grid" x1="${left}" y1="${yAt(v)}" x2="${left + cw}" y2="${yAt(v)}"></line>
      <text class="sync-y-label" x="${left - 6}" y="${yAt(v) + 3}" text-anchor="end">${v}</text>
    `
    )
    .join("");
  return `
    <div class="mini-chart-card" data-mini="${esc(chartId)}">
      <div class="mini-title" data-title-for="${esc(chartId)}">${esc(paramName)}</div>
      <svg class="perf-svg sync-chart mini-svg" data-chart-id="${esc(chartId)}" viewBox="0 0 ${w} ${h}">
        ${yTicks}
        <line class="sync-axis" x1="${left}" y1="${top + ch}" x2="${left + cw}" y2="${top + ch}"></line>
        <polygon class="mini-area" points="${areaPoints}" style="fill:${stroke}22"></polygon>
        <polyline class="mini-line" points="${linePoints}" style="stroke:${stroke}"></polyline>
        ${nodes}
        <line class="sync-cursor" data-cursor-for="${esc(chartId)}" x1="${left}" y1="${top}" x2="${left}" y2="${top + ch}"></line>
        <text class="sync-x-label" x="${left}" y="${h - 8}" text-anchor="start">S1</text>
        <text class="sync-x-label" x="${left + cw}" y="${h - 8}" text-anchor="end">S${series.length}</text>
      </svg>
    </div>
  `;
}

function showPerfTooltip(ev, html) {
  const tip = document.getElementById("performanceChartTooltip");
  const host = performanceDialogContent;
  if (!tip || !host) return;
  const hostRect = host.getBoundingClientRect();
  tip.innerHTML = html;
  tip.style.display = "block";
  tip.style.left = `${ev.clientX - hostRect.left + 12}px`;
  tip.style.top = `${ev.clientY - hostRect.top + 12}px`;
}

function hidePerfTooltip() {
  const tip = document.getElementById("performanceChartTooltip");
  if (!tip) return;
  tip.style.display = "none";
}

function showTooltipInHost(host, tooltipId, ev, html) {
  const tip = host?.querySelector(`#${CSS.escape(tooltipId)}`);
  if (!tip || !host) return;
  const hostRect = host.getBoundingClientRect();
  tip.innerHTML = html;
  tip.style.display = "block";
  tip.style.left = `${ev.clientX - hostRect.left + 12}px`;
  tip.style.top = `${ev.clientY - hostRect.top + 12}px`;
}

function hideTooltipInHost(host, tooltipId) {
  const tip = host?.querySelector(`#${CSS.escape(tooltipId)}`);
  if (!tip) return;
  tip.style.display = "none";
}

function setSyncCursor(sessionIndex) {
  const idx = Number(sessionIndex);
  if (!Number.isFinite(idx)) return;
  const charts = Array.from(performanceDialogContent.querySelectorAll(".sync-chart"));
  for (const svg of charts) {
    const nodes = Array.from(svg.querySelectorAll(".sync-node"));
    const target = nodes.find((n) => Number(n.dataset.sync) === idx);
    const cursor = svg.querySelector(".sync-cursor");
    if (target && cursor) {
      const cx = target.getAttribute("cx");
      cursor.setAttribute("x1", cx);
      cursor.setAttribute("x2", cx);
      cursor.classList.add("visible");
    }
    for (const n of nodes) {
      n.classList.toggle("active", Number(n.dataset.sync) === idx);
    }
  }
}

function clearSyncCursor() {
  for (const cursor of performanceDialogContent.querySelectorAll(".sync-cursor")) {
    cursor.classList.remove("visible");
  }
  for (const n of performanceDialogContent.querySelectorAll(".sync-node")) {
    n.classList.remove("active");
  }
}

function wireMasterAndFocusInteractions(series) {
  const nodes = Array.from(performanceDialogContent.querySelectorAll(".sync-node"));
  for (const node of nodes) {
    node.addEventListener("mouseenter", (ev) => {
      const idx = Number(node.dataset.sync);
      setSyncCursor(idx);
      if (node.dataset.kind === "master") {
        showPerfTooltip(
          ev,
          `Session: ${esc(node.dataset.date || "-")}<br>Avg: ${esc(node.dataset.score || "-")} | Speaker: ${esc(
            node.dataset.speaker || "Speaker"
          )}`
        );
      } else {
        showPerfTooltip(
          ev,
          `${esc(node.dataset.parameter || "Parameter")}: ${esc(node.dataset.score || "-")}<br>Session: ${esc(
            node.dataset.date || "-"
          )}`
        );
      }
    });
    node.addEventListener("mousemove", (ev) => {
      const idx = Number(node.dataset.sync);
      setSyncCursor(idx);
      if (node.dataset.kind === "master") {
        showPerfTooltip(
          ev,
          `Session: ${esc(node.dataset.date || "-")}<br>Avg: ${esc(node.dataset.score || "-")} | Speaker: ${esc(
            node.dataset.speaker || "Speaker"
          )}`
        );
      } else {
        showPerfTooltip(
          ev,
          `${esc(node.dataset.parameter || "Parameter")}: ${esc(node.dataset.score || "-")}<br>Session: ${esc(
            node.dataset.date || "-"
          )}`
        );
      }
    });
  }
  const charts = Array.from(performanceDialogContent.querySelectorAll(".sync-chart"));
  for (const svg of charts) {
    svg.addEventListener("mousemove", (ev) => {
      const chartId = String(svg.dataset.chartId || "");
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const localX = ((ev.clientX - rect.left) / rect.width) * vb.width;
      const isMaster = chartId === "master";
      const left = isMaster ? 44 : 34;
      const right = isMaster ? 14 : 10;
      const cw = vb.width - left - right;
      const step = series.length > 1 ? cw / (series.length - 1) : 0;
      let idx = step > 0 ? Math.round((localX - left) / step) : 0;
      idx = Math.max(0, Math.min(series.length - 1, idx));
      setSyncCursor(idx);
      if (isMaster) {
        showPerfTooltip(
          ev,
          `Session: ${esc(perfDateLabel(series[idx]))}<br>Avg: ${Number(series[idx].avg).toFixed(2)} | Speaker: ${esc(
            series[idx].speakerName || "Speaker"
          )}`
        );
      } else {
        const paramIdx = Number(String(chartId).replace("mini-", ""));
        const paramNames = ["Empathy", "Politeness", "Patience", "Engagement", "Connection", "Tone"];
        const name = paramNames[paramIdx] || "Parameter";
        const sourceIdx = paramIdx === 5 ? 5 : paramIdx;
        const score = Number(series[idx].values[sourceIdx] ?? 0).toFixed(2);
        showPerfTooltip(ev, `${esc(name)}: ${esc(score)}<br>Session: ${esc(perfDateLabel(series[idx]))}`);
      }
    });
    svg.addEventListener("mouseleave", () => {
      clearSyncCursor();
      hidePerfTooltip();
    });
  }

  const miniTitles = Array.from(performanceDialogContent.querySelectorAll(".mini-title"));
  const miniCards = Array.from(performanceDialogContent.querySelectorAll(".mini-chart-card"));
  for (const title of miniTitles) {
    title.addEventListener("mouseenter", () => {
      const target = String(title.dataset.titleFor || "");
      for (const card of miniCards) {
        const id = String(card.dataset.mini || "");
        card.classList.toggle("focus", id === target);
        card.classList.toggle("dim", id !== target);
      }
    });
    title.addEventListener("mouseleave", () => {
      for (const card of miniCards) {
        card.classList.remove("focus", "dim");
      }
    });
  }
}

function wireListenerDetailChartInteractions(host, series, tooltipId) {
  if (!host) return;
  const nodes = Array.from(host.querySelectorAll(".sync-node"));
  const setSync = (idx) => {
    const charts = Array.from(host.querySelectorAll(".sync-chart"));
    for (const svg of charts) {
      const target = svg.querySelector(`.sync-node[data-sync="${idx}"]`);
      const cursor = svg.querySelector(".sync-cursor");
      if (target && cursor) {
        const cx = target.getAttribute("cx");
        cursor.setAttribute("x1", cx);
        cursor.setAttribute("x2", cx);
        cursor.classList.add("visible");
      }
      for (const n of svg.querySelectorAll(".sync-node")) {
        n.classList.toggle("active", Number(n.dataset.sync) === idx);
      }
    }
  };
  const clearSync = () => {
    for (const cursor of host.querySelectorAll(".sync-cursor")) cursor.classList.remove("visible");
    for (const n of host.querySelectorAll(".sync-node")) n.classList.remove("active");
  };
  for (const node of nodes) {
    node.addEventListener("mouseenter", (ev) => {
      const idx = Number(node.dataset.sync || 0);
      setSync(idx);
      if (node.dataset.kind === "master") {
        showTooltipInHost(
          host,
          tooltipId,
          ev,
          `Overall rating: ${esc(node.dataset.score || "-")}<br>Date: ${esc(node.dataset.date || "-")}`
        );
      } else {
        showTooltipInHost(
          host,
          tooltipId,
          ev,
          `${esc(node.dataset.parameter || "Parameter")}: ${esc(node.dataset.score || "-")}<br>Date: ${esc(node.dataset.date || "-")}`
        );
      }
    });
    node.addEventListener("mousemove", (ev) => {
      const idx = Number(node.dataset.sync || 0);
      setSync(idx);
      if (node.dataset.kind === "master") {
        showTooltipInHost(
          host,
          tooltipId,
          ev,
          `Overall rating: ${esc(node.dataset.score || "-")}<br>Date: ${esc(node.dataset.date || "-")}`
        );
      } else {
        showTooltipInHost(
          host,
          tooltipId,
          ev,
          `${esc(node.dataset.parameter || "Parameter")}: ${esc(node.dataset.score || "-")}<br>Date: ${esc(node.dataset.date || "-")}`
        );
      }
    });
  }
  const charts = Array.from(host.querySelectorAll(".sync-chart"));
  for (const svg of charts) {
    svg.addEventListener("mouseleave", () => {
      clearSync();
      hideTooltipInHost(host, tooltipId);
    });
  }
}

function openPerformanceDialog() {
  const series = getCompletedListeningSessionsForCharts();
  if (!series.length) {
    performanceDialogContent.innerHTML = '<p class="muted">No completed listening sessions with ratings yet.</p>';
    if (typeof performanceDialog.showModal === "function") performanceDialog.showModal();
    return;
  }
  const paramDefs = [
    { idx: 0, name: "Empathy" },
    { idx: 1, name: "Politeness" },
    { idx: 2, name: "Patience" },
    { idx: 4, name: "Connection" },
    { idx: 3, name: "Engagement" },
    { idx: 5, name: "Tone" }
  ];
  performanceDialogContent.innerHTML = `
    <div class="panel-soft performance-block">
      <h4>Performance Master (Overall Rating)</h4>
      <p class="muted">Hover any point to view session date, average score, and speaker name.</p>
      ${renderMasterAreaChartSvg(series)}
    </div>
    <div class="panel-soft performance-block">
      <h4>Focus Grid (Parameter-Wise Breakdown)</h4>
      <p class="muted">Each mini-chart uses fixed 0-10 scale. Coral marks low-performing trends.</p>
      <div class="focus-grid">
        ${paramDefs.map((p) => renderMiniParameterChartSvg(series, p.idx, p.name, `mini-${p.idx}`)).join("")}
      </div>
    </div>
    <div id="performanceChartTooltip" class="chart-tooltip"></div>
  `;
  if (typeof performanceDialog.showModal === "function") performanceDialog.showModal();
  wireMasterAndFocusInteractions(series);
}

function renderWallet(wallet) {
  const balance = Number(wallet?.balanceInr || 0);
  currentWalletBalance = balance;
  const currency = String(wallet?.currency || "INR");
  walletText.textContent = `Balance: Rs ${balance.toFixed(2)} (${currency})`;
}

function animateDialogMetric(el, target, duration = 520) {
  if (!el) return;
  const start = Number(String(el.textContent || "0").replace(/[^\d.-]/g, "")) || 0;
  const end = Number(target || 0);
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / duration);
    const eased = 1 - (1 - p) * (1 - p);
    const v = start + (end - start) * eased;
    el.textContent = Number.isInteger(end) ? `${Math.round(v)}` : `${v.toFixed(2)}`;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderOutcomeBars(data) {
  const total = Math.max(1, data.open + data.accepted + data.pending + data.completed + data.cancelled + data.rejected);
  const rows = [
    { label: "Open", value: data.open, cls: "ov-open" },
    { label: "Accepted", value: data.accepted, cls: "ov-accepted" },
    { label: "Pending", value: data.pending, cls: "ov-pending" },
    { label: "Completed", value: data.completed, cls: "ov-completed" },
    { label: "Cancelled", value: data.cancelled, cls: "ov-cancelled" },
    { label: "Rejected", value: data.rejected, cls: "ov-rejected" }
  ];
  return rows
    .map((r) => {
      const pct = Math.round((r.value / total) * 100);
      return `
        <div class="ov-row">
          <span>${r.label}</span>
          <div class="ov-track"><span class="ov-fill ${r.cls}" style="--fill:${pct}%"></span></div>
          <span>${r.value}</span>
        </div>
      `;
    })
    .join("");
}

function openHubSnapshotDialog() {
  if (!hubSnapshotDialog || !hubSnapshotContent) return;
  const nowTs = Date.now();
  const isUpcomingBooking = (b) => {
    const status = String(b?.status || "").toLowerCase();
    const when = new Date(b?.scheduledAt || 0).getTime();
    return (status === "pending" || status === "accepted") && Number.isFinite(when) && when >= nowTs;
  };
  const speakingUpcoming = outgoingBookings.filter(isUpcomingBooking).length;
  const listeningUpcoming = incomingBookings.filter(isUpcomingBooking).length;
  const speakingCompleted = outgoingBookings.filter((b) => String(b.status) === "completed").length;
  const listeningCompleted = incomingBookings.filter((b) => String(b.status) === "completed").length;
  const openSlots = myOpenSlots.filter((s) => String(s.status) === "open").length;
  const avgRating = Number(currentUser?.listenerProfile?.averageSatisfaction || 0);
  hubSnapshotContent.innerHTML = `
    <div class="hub-kpi-grid">
      <div class="hub-kpi-card"><span>Wallet (Rs)</span><strong id="hubKpiWallet">0</strong></div>
      <div class="hub-kpi-card"><span>Open Slots</span><strong id="hubKpiOpenSlots">0</strong></div>
      <div class="hub-kpi-card"><span>Upcoming Speaking</span><strong id="hubKpiSpeakUp">0</strong></div>
      <div class="hub-kpi-card"><span>Upcoming Listening</span><strong id="hubKpiListenUp">0</strong></div>
      <div class="hub-kpi-card"><span>Completed Speaking</span><strong id="hubKpiSpeakDone">0</strong></div>
      <div class="hub-kpi-card"><span>Completed Listening</span><strong id="hubKpiListenDone">0</strong></div>
      <div class="hub-kpi-card"><span>Avg Listener Rating</span><strong id="hubKpiAvg">0.00</strong></div>
    </div>
  `;
  if (typeof hubSnapshotDialog.showModal === "function") hubSnapshotDialog.showModal();
  animateDialogMetric(document.getElementById("hubKpiWallet"), currentWalletBalance, 620);
  animateDialogMetric(document.getElementById("hubKpiOpenSlots"), openSlots, 480);
  animateDialogMetric(document.getElementById("hubKpiSpeakUp"), speakingUpcoming, 520);
  animateDialogMetric(document.getElementById("hubKpiListenUp"), listeningUpcoming, 560);
  animateDialogMetric(document.getElementById("hubKpiSpeakDone"), speakingCompleted, 620);
  animateDialogMetric(document.getElementById("hubKpiListenDone"), listeningCompleted, 660);
  animateDialogMetric(document.getElementById("hubKpiAvg"), avgRating, 700);
}

function openSessionVisualsDialog() {
  if (!sessionVisualsDialog || !sessionVisualsContent) return;
  const nowTs = Date.now();
  const all = [...incomingBookings, ...outgoingBookings];
  const statusCount = {
    open: 0,
    accepted: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    rejected: 0
  };
  const modeCount = { chat: 0, google_meet: 0 };
  for (const b of all) {
    const s = String(b.status || "").toLowerCase();
    if (s === "pending" || s === "accepted") {
      const when = new Date(b?.scheduledAt || 0).getTime();
      if (Number.isFinite(when) && when >= nowTs) {
        statusCount[s] += 1;
      }
    } else if (Object.hasOwn(statusCount, s)) {
      statusCount[s] += 1;
    }
    const m = String(b.mode || "").toLowerCase();
    if (Object.hasOwn(modeCount, m)) modeCount[m] += 1;
  }
  statusCount.open = myOpenSlots.filter((s) => String(s.status || "").toLowerCase() === "open").length;
  const totalModes = Math.max(1, modeCount.chat + modeCount.google_meet);
  const chatPct = Math.round((modeCount.chat / totalModes) * 100);
  const meetPct = 100 - chatPct;
  sessionVisualsContent.innerHTML = `
    <div class="panel-soft">
      <h4>Booking Outcome Distribution</h4>
      <div class="ov-grid">${renderOutcomeBars(statusCount)}</div>
    </div>
    <div class="panel-soft">
      <h4>Mode Split</h4>
      <div class="ov-mode-track">
        <span class="ov-mode-fill mode-chat" style="--fill:${chatPct}%">Chat ${chatPct}%</span>
        <span class="ov-mode-fill mode-meet" style="--fill:${meetPct}%">GMeet ${meetPct}%</span>
      </div>
      <p class="muted">Chat sessions: ${modeCount.chat} | Google Meet sessions: ${modeCount.google_meet}</p>
    </div>
  `;
  if (typeof sessionVisualsDialog.showModal === "function") sessionVisualsDialog.showModal();
}

function renderMyOpenSlots() {
  myOpenSlotsBox.innerHTML = "";
  if (!myOpenSlots.length) {
    myOpenSlotsBox.innerHTML = '<p class="muted">No open slots yet.</p>';
    return;
  }
  for (const s of myOpenSlots) {
    const card = document.createElement("div");
    card.className = "contact-item";
    card.innerHTML = `
      <div class="row">
        <strong>${esc(fmtDateTime(s.startAt))}</strong>
        <span class="pill">${esc(s.status)}</span>
        <span class="pill">${Number(s.feeInr || 0) > 0 ? `Rs ${Number(s.feeInr)} premium` : "free"}</span>
      </div>
      ${
        s.status === "open"
          ? `<div class="row" style="margin-top:8px;">
              <button class="ghost" data-action="remove-slot" data-id="${esc(s._id)}">Remove Slot</button>
            </div>`
          : ""
      }
    `;
    myOpenSlotsBox.appendChild(card);
  }
}

function renderListenerMarketplace() {
  listenerMarketplaceBox.innerHTML = "";
  if (!discoverySlots.length) {
    listenerMarketplaceBox.innerHTML = '<p class="muted">No listener slots available right now.</p>';
    listenerMarketplaceBox.scrollTop = 0;
    return;
  }
  for (const s of discoverySlots) {
    const card = document.createElement("div");
    card.className = "contact-item";
    card.innerHTML = `
      <div class="row">
        <strong>${esc(s.listenerName)}</strong>
        <span class="pill">${esc(s.freeAvailability || "Free only")}</span>
      </div>
      <div class="muted">Date/Time: ${esc(fmtDateTime(s.dateTime))}</div>
      <div class="muted">Avg rating: ${esc(s.averageRating)}</div>
      <div class="muted">Qualifications: ${esc(formatQualifications(s.qualifications || []))}</div>
      <div class="muted">Interests: ${esc((s.interests || []).join(", ") || "Not provided")}</div>
      <div class="row" style="margin-top:8px;">
        <select data-role="book-mode" data-id="${esc(s.slotId)}">
          <option value="chat">Chat</option>
          <option value="google_meet">Google Meet</option>
        </select>
        <button data-action="book-slot" data-id="${esc(s.slotId)}">Book Slot</button>
        <button class="ghost" data-action="view-listener-detail" data-id="${esc(s.slotId)}">View Details</button>
      </div>
    `;
    listenerMarketplaceBox.appendChild(card);
  }
  listenerMarketplaceBox.scrollTop = 0;
}

function bookingCardHtml(item, type) {
  const withName =
    type === "incoming"
      ? item.speakerUserId?.name || "Speaker"
      : item.listenerUserId?.name || "Listener";
  const title = type === "incoming" ? "From" : "Listener";
  const listenerProfile = item.listenerProfileId || null;
  const avgRating = listenerProfile ? Number(listenerProfile.averageSatisfaction || 0).toFixed(2) : "-";
  const qualifications = formatQualifications(listenerProfile?.qualificationAnswers || []);
  const availability = Number(item.feeInr || 0) > 0 ? `Premium (Rs ${Number(item.feeInr)})` : "Free only";
  const meetLine = item.meet?.meetLink
    ? `<div class="muted">Meet: <a href="${esc(item.meet.meetLink)}" target="_blank" rel="noreferrer">${esc(item.meet.meetLink)}</a></div>`
    : "";
  const paymentStatus = String(item.payment?.status || "UNPAID");
  const paymentAmount = Number(item.payment?.amountInr || item.feeInr || 0);
  const paymentEscrow = Number(item.payment?.escrowAmountInr || 0);
  const paymentLine = `<div class="muted">Payment: ${esc(paymentStatus)} | Amount: Rs ${paymentAmount} | Escrow: Rs ${paymentEscrow}</div>`;
  const profileLine =
    type === "incoming"
      ? ""
      : `<div class="muted">Average rating: ${esc(avgRating)} | Qualifications: ${esc(qualifications)} | Availability: ${esc(availability)}</div>`;

  return `
    <div class="contact-item">
      <div class="row">
        <strong>${esc(withName)}</strong>
        <span class="pill">${esc(item.mode)}</span>
        <span class="pill">${esc(item.status)}</span>
        <span class="pill">${Number(item.feeInr || 0) > 0 ? `Rs ${Number(item.feeInr)} premium` : "free"}</span>
        <span class="pill">${esc(paymentStatus)}</span>
      </div>
      <div class="muted">${title}: ${esc(withName)}</div>
      <div class="muted">Scheduled: ${esc(fmtDateTime(item.scheduledAt))}</div>
      ${paymentLine}
      ${profileLine}
      ${meetLine}
      ${
        type === "incoming" && item.status === "pending"
          ? `<div class="row" style="margin-top:8px;">
              <button data-action="accept-booking" data-id="${esc(item._id)}">Accept</button>
              <button class="ghost" data-action="reject-booking" data-id="${esc(item._id)}">Reject</button>
            </div>`
          : ""
      }
      ${
        (type === "incoming" || type === "outgoing") && item.status === "accepted"
          ? `<div class="row" style="margin-top:8px;">
              <button class="ghost" data-action="cancel-booking" data-id="${esc(item._id)}">Cancel Slot</button>
            </div>`
          : ""
      }
      ${
        type === "outgoing" && item.mode === "chat" && item.status === "accepted"
          ? `<div class="row" style="margin-top:8px;">
              <button data-action="open-chat" data-id="${esc(item._id)}">Open Chat Session</button>
            </div>`
          : ""
      }
    </div>
  `;
}

function renderBookings() {
  const nowTs = Date.now();
  const incomingActive = incomingBookings.filter((b) => {
    const status = String(b.status || "");
    const when = new Date(b.scheduledAt || 0).getTime();
    return (status === "pending" || status === "accepted") && Number.isFinite(when) && when >= nowTs;
  });
  const outgoingUpcoming = outgoingBookings.filter((b) => {
    const status = String(b.status || "");
    const when = new Date(b.scheduledAt || 0).getTime();
    return (status === "pending" || status === "accepted") && Number.isFinite(when) && when >= nowTs;
  });
  incomingBookingsBox.innerHTML = incomingActive.length
    ? incomingActive.map((b) => bookingCardHtml(b, "incoming")).join("")
    : '<p class="muted">No upcoming listening sessions.</p>';

  outgoingBookingsBox.innerHTML = outgoingUpcoming.length
    ? outgoingUpcoming.map((b) => bookingCardHtml(b, "outgoing")).join("")
    : '<p class="muted">No upcoming speaking sessions.</p>';
}

function renderChatBookingOptions() {
  const allChatBookings = [...incomingBookings, ...outgoingBookings].filter(
    (b) => b.mode === "chat" && String(b.status) === "accepted"
  );
  chatBookingMap = new Map(allChatBookings.map((b) => [String(b._id), b]));
  const previous = String(chatBookingSelect.value || "");
  chatBookingSelect.innerHTML = "";
  if (!allChatBookings.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No chat bookings";
    chatBookingSelect.appendChild(opt);
    return;
  }
  for (const b of allChatBookings) {
    const opt = document.createElement("option");
    opt.value = b._id;
    const name = b.listenerUserId?.name || b.speakerUserId?.name || "Participant";
    opt.textContent = `${name} | ${fmtDateTime(b.scheduledAt)} | ${b.status}`;
    chatBookingSelect.appendChild(opt);
  }
  const keepPrevious = previous && chatBookingMap.has(previous);
  chatBookingSelect.value = keepPrevious ? previous : String(allChatBookings[0]?._id || "");
}

function renderSessionLists() {
  const completedSpeaking = outgoingBookings
    .filter((b) => String(b.status) === "completed")
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  const completedListening = incomingBookings
    .filter((b) => String(b.status) === "completed")
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  speakingSessionsBox.innerHTML = "";
  listeningSessionsBox.innerHTML = "";

  if (!completedSpeaking.length) {
    speakingSessionsBox.innerHTML = '<p class="muted">No completed speaking sessions.</p>';
  } else {
    for (const b of completedSpeaking) {
      const speakerName = resolveUserName(b.speakerUserId, "Speaker");
      const listenerName = resolveUserName(b.listenerUserId, "Listener");
      const breakdown = b.speakerRatingBreakdown || {};
      const card = document.createElement("div");
      card.className = "contact-item";
      const paid = Number(b.payment?.amountInr || b.feeInr || 0) > 0;
      const settlementReason = String(b.payment?.settlementReason || "No settlement reason recorded.")
        .replace("[CHAT_SCORE_RULE]", "")
        .trim();
      const settlementLine = paid
        ? `Payment: Rs ${Number(b.payment?.amountInr || b.feeInr || 0)} | Status: ${String(b.payment?.status || "UNPAID")} | Escrow: Rs ${Number(b.payment?.escrowAmountInr || 0)}`
        : "Payment: Free session.";
      const splitLine = paid
        ? `Settlement split: Listener (${listenerName}) got Rs ${Math.max(
            0,
            Number((Number(b.payment?.amountInr || b.feeInr || 0) - Number(b.payment?.refundedInr || 0)).toFixed(2))
          )} | Speaker (${speakerName}) got Rs ${Math.max(0, Number(Number(b.payment?.refundedInr || 0).toFixed(2)))}`
        : "Settlement split: Not applicable for free session.";
      const auditScore = b.listenerAudit?.engagementScore;
      const auditLine =
        auditScore === null || auditScore === undefined
          ? "AI Audit score (listener): -"
          : `AI Audit score (listener): ${Number(auditScore).toFixed(2)}/10`;
      const listenerAmt = Math.max(
        0,
        Number((Number(b.payment?.amountInr || b.feeInr || 0) - Number(b.payment?.refundedInr || 0)).toFixed(2))
      );
      const speakerAmt = Math.max(0, Number(Number(b.payment?.refundedInr || 0).toFixed(2)));
      card.innerHTML = `
        <div class="row">
          <strong>${esc(
            `Listener - ${listenerName} (Speaker - ${speakerName})`
          )}</strong>
          <span class="pill">${esc(b.mode)}</span>
        </div>
        <div class="muted">Date/Time: ${esc(fmtDateTime(b.scheduledAt))}</div>
        <div class="muted">Rating given: ${esc(b.speakerSessionRating ?? "-")}</div>
        ${renderParameterRatings(breakdown)}
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-title">Parameter Area Chart</div>
            ${renderSupportRadar(breakdown)}
          </div>
          <div class="metric-card">
            <div class="metric-title">AI Audit</div>
            ${renderAuditDonut(auditScore)}
            <div class="muted">${esc(auditLine)}</div>
          </div>
        </div>
        <div class="muted">${esc(settlementLine)}</div>
        ${renderSettlementBar(listenerAmt, speakerAmt)}
        <div class="muted">Settlement proof (Speaker (${esc(speakerName)}), Listener (${esc(listenerName)})): ${esc(settlementReason)}</div>
      `;
      speakingSessionsBox.appendChild(card);
    }
  }
  speakingSessionsBox.scrollTop = 0;

  if (!completedListening.length) {
    listeningSessionsBox.innerHTML = '<p class="muted">No completed listening sessions.</p>';
  } else {
    for (const b of completedListening) {
      const speakerName = resolveUserName(b.speakerUserId, "Speaker");
      const listenerName = resolveUserName(b.listenerUserId, "Listener");
      const breakdown = b.speakerRatingBreakdown || {};
      const card = document.createElement("div");
      card.className = "contact-item";
      const paid = Number(b.payment?.amountInr || b.feeInr || 0) > 0;
      const settlementReason = String(b.payment?.settlementReason || "No settlement reason recorded.")
        .replace("[CHAT_SCORE_RULE]", "")
        .trim();
      const settlementLine = paid
        ? `Payment: Rs ${Number(b.payment?.amountInr || b.feeInr || 0)} | Status: ${String(b.payment?.status || "UNPAID")} | Escrow: Rs ${Number(b.payment?.escrowAmountInr || 0)}`
        : "Payment: Free session.";
      const splitLine = paid
        ? `Settlement split: Listener (${listenerName}) got Rs ${Math.max(
            0,
            Number((Number(b.payment?.amountInr || b.feeInr || 0) - Number(b.payment?.refundedInr || 0)).toFixed(2))
          )} | Speaker (${speakerName}) got Rs ${Math.max(0, Number(Number(b.payment?.refundedInr || 0).toFixed(2)))}`
        : "Settlement split: Not applicable for free session.";
      const auditScore = b.listenerAudit?.engagementScore;
      const auditLine =
        auditScore === null || auditScore === undefined
          ? "AI Audit score: -"
          : `AI Audit score (listener): ${Number(auditScore).toFixed(2)}/10`;
      const listenerAmt = Math.max(
        0,
        Number((Number(b.payment?.amountInr || b.feeInr || 0) - Number(b.payment?.refundedInr || 0)).toFixed(2))
      );
      const speakerAmt = Math.max(0, Number(Number(b.payment?.refundedInr || 0).toFixed(2)));
      card.innerHTML = `
        <div class="row">
          <strong>${esc(
            `Speaker - ${speakerName} (Listener - ${listenerName})`
          )}</strong>
          <span class="pill">${esc(b.mode)}</span>
        </div>
        <div class="muted">Date/Time: ${esc(fmtDateTime(b.scheduledAt))}</div>
        <div class="muted">Rating received: ${esc(b.speakerSessionRating ?? "-")}</div>
        ${renderParameterRatings(breakdown)}
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-title">Parameter Area Chart</div>
            ${renderSupportRadar(breakdown)}
          </div>
          <div class="metric-card">
            <div class="metric-title">AI Audit</div>
            ${renderAuditDonut(auditScore)}
            <div class="muted">${esc(auditLine)}</div>
          </div>
        </div>
        <div class="muted">${esc(settlementLine)}</div>
        ${renderSettlementBar(listenerAmt, speakerAmt)}
        <div class="muted">Settlement proof (Speaker (${esc(speakerName)}), Listener (${esc(listenerName)})): ${esc(settlementReason)}</div>
      `;
      listeningSessionsBox.appendChild(card);
    }
  }
  listeningSessionsBox.scrollTop = 0;
}

function renderWellnessLogs(logs) {
  wellnessLogsBox.innerHTML = "";
  if (!logs.length) {
    wellnessLogsBox.innerHTML = '<p class="muted">No takeaways yet.</p>';
    wellnessLogsBox.scrollTop = 0;
    return;
  }
  for (const log of logs) {
    const bookingRef = [...outgoingBookings, ...incomingBookings].find((b) => String(b._id) === String(log.bookingId || ""));
    const speakerName = resolveUserName(bookingRef?.speakerUserId, "Speaker");
    const listenerName = resolveUserName(bookingRef?.listenerUserId, "Listener");
    const auditScore = bookingRef?.listenerAudit?.engagementScore;
    const auditText =
      auditScore === null || auditScore === undefined ? "-" : `${Number(auditScore).toFixed(2)}/10`;
    const settlementReason = String(bookingRef?.payment?.settlementReason || "No settlement reason recorded.")
      .replace("[CHAT_SCORE_RULE]", "")
      .trim();
    const paid = Number(bookingRef?.payment?.amountInr || bookingRef?.feeInr || 0) > 0;
    const splitLine = paid
      ? `Settlement split: Listener (${listenerName}) got Rs ${Math.max(
          0,
          Number(
            (
              Number(bookingRef?.payment?.amountInr || bookingRef?.feeInr || 0) -
              Number(bookingRef?.payment?.refundedInr || 0)
            ).toFixed(2)
          )
        )} | Speaker (${speakerName}) got Rs ${Math.max(
          0,
          Number(Number(bookingRef?.payment?.refundedInr || 0).toFixed(2))
        )}`
      : "Settlement split: Not applicable for free session.";
    const card = document.createElement("div");
    card.className = "contact-item";
    card.innerHTML = `
      <div class="row"><strong>Session Takeaway</strong><span class="pill">${esc(fmtDateTime(log.createdAt))}</span></div>
      <div class="muted">Listener: ${esc(log.listenerName || "N/A")}</div>
      <div class="wellness-topline">
        <div>${renderAuditDonut(auditText === "-" ? 0 : Number(auditText.split("/")[0]))}</div>
        <div class="muted">AI Audit score (listener): ${esc(auditText)}</div>
      </div>
      ${renderSettlementBar(
        Math.max(
          0,
          Number(
            (
              Number(bookingRef?.payment?.amountInr || bookingRef?.feeInr || 0) -
              Number(bookingRef?.payment?.refundedInr || 0)
            ).toFixed(2)
          )
        ),
        Math.max(0, Number(Number(bookingRef?.payment?.refundedInr || 0).toFixed(2)))
      )}
      <div class="muted">Settlement proof (Speaker (${esc(speakerName)}), Listener (${esc(listenerName)})): ${esc(settlementReason)}</div>
      <div class="takeaway-list">${renderTakeawayChecklist(log.summary)}</div>
    `;
    wellnessLogsBox.appendChild(card);
  }
  wellnessLogsBox.scrollTop = 0;
}

function renderChatMessages(messages) {
  chatMessagesBox.innerHTML = "";
  if (!messages.length) {
    chatMessagesBox.innerHTML = '<p class="muted">No messages yet.</p>';
    return;
  }
  for (const msg of messages) {
    let senderName = "Participant";
    if (currentParticipants) {
      senderName =
        String(msg.senderUserId) === String(currentParticipants.speakerId)
          ? currentParticipants.speakerName
          : currentParticipants.listenerName;
    }
    const mine = normalizeName(senderName) === normalizeName(currentUser?.name);
    const container = document.createElement("div");
    container.className = `msg ${mine ? "me-right" : "peer-left"}`;
    const senderLabel = document.createElement("div");
    senderLabel.className = "muted";
    senderLabel.style.fontSize = "12px";
    senderLabel.style.marginBottom = "4px";
    senderLabel.textContent = senderName;
    const body = document.createElement("div");
    body.textContent = msg.text;
    container.appendChild(senderLabel);
    container.appendChild(body);
    chatMessagesBox.appendChild(container);
  }
  chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
}

function updatePurgeButtonVisibility(booking) {
  const isSpeaker = booking && String(booking.speakerUserId?._id || booking.speakerUserId) === String(currentUser?._id);
  purgeChatBtn.style.display = isSpeaker ? "inline-block" : "none";
}

function stopChatCountdown() {
  if (chatCountdownTimer) {
    clearInterval(chatCountdownTimer);
    chatCountdownTimer = null;
  }
}

function stopMeetCountdown() {
  if (meetCountdownTimer) {
    clearInterval(meetCountdownTimer);
    meetCountdownTimer = null;
  }
}

async function autoEndChatOnTimeout(bookingId) {
  if (!bookingId || countdownAutoEndInProgress) return;
  countdownAutoEndInProgress = true;
  try {
    await api(`/api/escalation/chat/end/${bookingId}`, { method: "POST", body: "{}" });
    await refreshAll();
    await loadChatMessagesForSelected();
    await maybePromptPendingRatingDialog();
  } catch {
    // ignore race conditions if the other side already ended it
  } finally {
    countdownAutoEndInProgress = false;
  }
}

async function autoCompleteMeetOnTimeout(bookingId) {
  if (!bookingId || meetCompletionInProgress.has(String(bookingId))) return;
  meetCompletionInProgress.add(String(bookingId));
  try {
    await api(`/api/escalation/booking/complete/${bookingId}`, { method: "POST", body: "{}" });
    await refreshAll();
    await maybePromptPendingRatingDialog();
  } catch {
    // no-op: can race with other participant/browser
  } finally {
    meetCompletionInProgress.delete(String(bookingId));
  }
}

function startChatCountdown(chat, bookingId) {
  stopChatCountdown();
  if (!chat?.scheduledAt) return;
  if (String(chat.status || "") === "ended" || String(chat.status || "") === "purged") return;

  const startAt = new Date(chat.scheduledAt).getTime();
  if (!Number.isFinite(startAt)) return;
  const endAt = startAt + 60 * 1000;

  const tick = () => {
    const now = Date.now();
    const msRemaining = endAt - now;
    if (msRemaining <= 0) {
      stopChatCountdown();
      const base = `Status: ${chat.status || "-"} | Scheduled: ${fmtDateTime(chat.scheduledAt)} | Retention ends: ${
        chat.retentionExpiry ? fmtDateTime(chat.retentionExpiry) : "-"
      }`;
      chatSessionStatus.textContent = `${base} | Session countdown: 00s`;
      autoEndChatOnTimeout(bookingId);
      return;
    }
    const sec = Math.ceil(msRemaining / 1000);
    const secText = `${String(sec).padStart(2, "0")}s`;
    const base = `Status: ${chat.status || "-"} | Scheduled: ${fmtDateTime(chat.scheduledAt)} | Retention ends: ${
      chat.retentionExpiry ? fmtDateTime(chat.retentionExpiry) : "-"
    }`;
    chatSessionStatus.textContent = `${base} | Session countdown: ${secText}`;
  };

  tick();
  chatCountdownTimer = setInterval(tick, 1000);
}

function getActiveMeetBookingForCurrentUser() {
  const all = [...incomingBookings, ...outgoingBookings].filter(
    (b) => String(b.mode) === "google_meet" && String(b.status) === "accepted"
  );
  if (!all.length) return null;
  all.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  return all[0];
}

function startMeetCountdown() {
  stopMeetCountdown();
  const booking = getActiveMeetBookingForCurrentUser();
  if (!booking) {
    meetSessionStatus.textContent = "No active Google Meet session.";
    return;
  }
  const startAt = new Date(booking.scheduledAt).getTime();
  if (!Number.isFinite(startAt)) {
    meetSessionStatus.textContent = "No active Google Meet session.";
    return;
  }
  const endAt = startAt + 60 * 1000;

  const tick = () => {
    const now = Date.now();
    const msRemaining = endAt - now;
    if (msRemaining <= 0) {
      meetSessionStatus.textContent = `Google Meet session window ended for ${fmtDateTime(booking.scheduledAt)}. Finalizing session...`;
      stopMeetCountdown();
      autoCompleteMeetOnTimeout(booking._id);
      return;
    }
    const sec = Math.ceil(msRemaining / 1000);
    const targetName =
      String(booking.speakerUserId?._id || booking.speakerUserId) === String(currentUser?._id)
        ? booking.listenerUserId?.name || "listener"
        : booking.speakerUserId?.name || "speaker";
    meetSessionStatus.textContent = `Google Meet with ${targetName} | starts: ${fmtDateTime(
      booking.scheduledAt
    )} | countdown: ${String(sec).padStart(2, "0")}s`;
  };
  tick();
  meetCountdownTimer = setInterval(tick, 1000);
}

function wsSend(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function updateChatSubscription(nextBookingId) {
  const nextId = String(nextBookingId || "");
  if (activeChatSubscription && activeChatSubscription !== nextId) {
    wsSend({ type: "unsubscribe_chat", bookingId: activeChatSubscription });
  }
  if (nextId && activeChatSubscription !== nextId) {
    wsSend({ type: "subscribe_chat", bookingId: nextId });
  }
  activeChatSubscription = nextId;
}

function connectRealtime() {
  const token = getToken();
  if (!token) return;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    updateChatSubscription(chatBookingSelect.value);
  };

  ws.onmessage = async (event) => {
    let data = null;
    try {
      data = JSON.parse(String(event.data || "{}"));
    } catch {
      data = null;
    }
    if (!data || !data.type) return;

    if (
      data.type === "booking_created" ||
      data.type === "booking_updated" ||
      data.type === "slot_updated" ||
      data.type === "listener_rating_updated"
    ) {
      await refreshAll();
      await maybePromptPendingRatingDialog();
      return;
    }

    if (data.type === "chat_message") {
      const selected = String(chatBookingSelect.value || "");
      if (selected && String(data.payload?.bookingId || "") === selected) {
        await loadChatMessagesForSelected();
      }
      return;
    }

    if (data.type === "chat_ended" || data.type === "chat_purged") {
      await refreshAll();
      await loadChatMessagesForSelected();
      await maybePromptPendingRatingDialog();
    }
  };

  ws.onclose = () => {
    ws = null;
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(() => {
      connectRealtime();
    }, 2000);
  };
}

async function loadDiscovery() {
  discoverySlots = await api("/api/escalation/discovery/slots");
  renderListenerMarketplace();
  myOpenSlots = await api("/api/escalation/slots/my");
  renderMyOpenSlots();
}

async function loadOverview() {
  const out = await api("/api/escalation/overview");
  renderProfile(out.myProfile || null);
  renderWallet(out.myWallet || null);
  incomingBookings = Array.isArray(out.incomingBookings) ? out.incomingBookings : [];
  outgoingBookings = Array.isArray(out.outgoingBookings) ? out.outgoingBookings : [];
  renderBookings();
  renderChatBookingOptions();
  updateChatSubscription(chatBookingSelect.value);
  await loadChatMessagesForSelected();
  renderSessionLists();
  renderWellnessLogs(Array.isArray(out.wellnessLogs) ? out.wellnessLogs : []);
  myOpenSlots = Array.isArray(out.myOpenSlots) ? out.myOpenSlots : [];
  renderMyOpenSlots();
  startMeetCountdown();
}

async function refreshAll() {
  await Promise.all([loadOverview(), loadDiscovery()]);
  await maybePromptPendingRatingDialog();
}

async function respondToBooking(bookingId, decision) {
  const reason = decision === "reject" ? "Listener unavailable for this slot." : "";
  await api("/api/escalation/booking/respond", {
    method: "POST",
    body: JSON.stringify({ bookingId, decision, reason })
  });
}

function selectSlot(slotId) {
  selectedSlotId = String(slotId || "");
  selectedSlot = discoverySlots.find((s) => String(s.slotId) === selectedSlotId) || null;
  if (!selectedSlot) return;
}

function openListenerDetail(slotId) {
  const s = discoverySlots.find((x) => String(x.slotId) === String(slotId));
  if (!s) return;
  const p = s.parameterAverages || {};
  const params = [
    { key: "empathy", name: "Empathy" },
    { key: "politeness", name: "Politeness" },
    { key: "patience", name: "Patience" },
    { key: "connection", name: "Connection" },
    { key: "engagement", name: "Engagement" },
    { key: "tipsQuality", name: "Tone" }
  ];
  const avgOverall = Number(s.averageRating || 0);
  const oneSeries = [
    {
      when: new Date().toISOString(),
      speakerName: "All sessions",
      avg: Number.isFinite(avgOverall) ? avgOverall : 0,
      values: params.map((x) => Number(p?.[x.key] || 0))
    }
  ];
  const detailMasterId = `listener-detail-master-${String(s.slotId || s.listenerName || "x").replace(/[^a-z0-9_-]/gi, "")}`;
  const detailTooltipId = `listenerDetailTooltip-${String(s.slotId || s.listenerName || "x").replace(/[^a-z0-9_-]/gi, "")}`;
  listenerDetailContent.innerHTML = `
    <div class="panel-soft">
      <div><strong>${esc(s.listenerName)}</strong></div>
      <div class="muted">Avg rating: ${esc(Number(s.averageRating || 0).toFixed(2))}</div>
      <div class="muted">Interests: ${esc((s.interests || []).join(", ") || "Not provided")}</div>
      <div class="muted">Qualifications: ${esc(formatQualifications(s.qualifications || [], 4))}</div>
    </div>
    <div class="panel-soft performance-block">
      <h4>Overall Rating</h4>
      ${renderMasterAreaChartSvg(oneSeries, detailMasterId)}
    </div>
    <div class="panel-soft performance-block">
      <h4>Parameter-Wise Focus</h4>
      <div class="focus-grid">
        ${params.map((x, i) => renderMiniParameterChartSvg(oneSeries, i, x.name, `ld-mini-${i}`)).join("")}
      </div>
    </div>
    <div id="${esc(detailTooltipId)}" class="chart-tooltip"></div>
  `;
  wireListenerDetailChartInteractions(listenerDetailContent, oneSeries, detailTooltipId);
  if (typeof listenerDetailDialog.showModal === "function") {
    listenerDetailDialog.showModal();
  }
}

async function loadChatMessagesForSelected() {
  const bookingId = chatBookingSelect.value;
  if (!bookingId) {
    stopChatCountdown();
    chatSessionStatus.textContent = "No chat booking selected.";
    currentParticipants = null;
    renderChatMessages([]);
    updatePurgeButtonVisibility(null);
    return;
  }
  const booking = chatBookingMap.get(String(bookingId));
  if (!booking) {
    stopChatCountdown();
    chatSessionStatus.textContent = "No active chat booking selected.";
    currentParticipants = null;
    renderChatMessages([]);
    updatePurgeButtonVisibility(null);
    return;
  }
  updatePurgeButtonVisibility(booking);
  try {
    const out = await api(`/api/escalation/chat/messages/${bookingId}`);
    currentParticipants = out.participants || null;
    renderChatMessages(out.messages || []);
    const chat = out.chat || {};
    startChatCountdown(chat, bookingId);
    if (!chatCountdownTimer) {
      chatSessionStatus.textContent =
        `Status: ${chat.status || "-"} | Scheduled: ${fmtDateTime(chat.scheduledAt)} | ` +
        `Retention ends: ${chat.retentionExpiry ? fmtDateTime(chat.retentionExpiry) : "-"}`;
    }
  } catch (err) {
    stopChatCountdown();
    chatSessionStatus.textContent = parseApiError(err, "Chat unavailable.");
    currentParticipants = null;
    renderChatMessages([]);
  }
}

function clearRatingDialogInputs() {
  rateEmpathy.value = "";
  ratePoliteness.value = "";
  ratePatience.value = "";
  rateEngagement.value = "";
  rateConnection.value = "";
  rateTipsQuality.value = "";
  ratingNotes.value = "";
}

function areAllRatingsFilled() {
  const values = [
    Number(rateEmpathy.value),
    Number(ratePoliteness.value),
    Number(ratePatience.value),
    Number(rateEngagement.value),
    Number(rateConnection.value),
    Number(rateTipsQuality.value)
  ];
  return values.every((x) => Number.isFinite(x) && x >= 0 && x <= 10);
}

function canCloseRatingDialog() {
  if (!pendingRatingBookingId) return true;
  if (ratingSubmitInProgress) return true;
  return areAllRatingsFilled();
}

async function maybePromptPendingRatingDialog() {
  if (!outgoingBookings.length) return;
  const pending = outgoingBookings.find(
    (b) => String(b.status) === "completed" && (b.speakerSessionRating === null || b.speakerSessionRating === undefined)
  );
  if (!pending) {
    if (ratingDialog?.open && !ratingSubmitInProgress) {
      pendingRatingBookingId = "";
      ratingDialog.close();
    }
    return;
  }
  pendingRatingBookingId = String(pending._id);
  if (ratingDialog?.open) return;
  const listenerName = pending.listenerUserId?.name || "Listener";
  ratingDialogContext.textContent = `Session with ${listenerName} on ${fmtDateTime(pending.scheduledAt)} is complete. Please submit all ratings.`;
  clearRatingDialogInputs();
  if (typeof ratingDialog.showModal === "function") {
    ratingDialog.showModal();
  }
}

ratingDialog.addEventListener("cancel", (ev) => {
  if (!canCloseRatingDialog()) {
    ev.preventDefault();
    uiStatus("Rating required.", "You must fill all six ratings to close this dialog.", "error");
  }
});

ratingDialog.addEventListener("close", () => {
  if (pendingRatingBookingId && !canCloseRatingDialog()) {
    if (typeof ratingDialog.showModal === "function") {
      ratingDialog.showModal();
    }
    uiStatus("Rating required.", "You must fill all six ratings to close this dialog.", "error");
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    stopChatCountdown();
    stopMeetCountdown();
    clearToken();
    window.location.href = "/login.html";
  });
}

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

if (closeListenerDetailBtn) {
  closeListenerDetailBtn.addEventListener("click", () => {
    listenerDetailDialog.close();
  });
}

if (closeListenerDetailX) {
  closeListenerDetailX.addEventListener("click", () => listenerDetailDialog.close());
}

viewPerformanceBtn.addEventListener("click", () => {
  openPerformanceDialog();
});

if (closePerformanceDialogBtn) {
  closePerformanceDialogBtn.addEventListener("click", () => {
    performanceDialog.close();
  });
}

if (closePerformanceDialogX) {
  closePerformanceDialogX.addEventListener("click", () => performanceDialog.close());
}

if (openHubSnapshotBtn) {
  openHubSnapshotBtn.addEventListener("click", () => openHubSnapshotDialog());
}

if (closeHubSnapshotDialogX && hubSnapshotDialog) {
  closeHubSnapshotDialogX.addEventListener("click", () => hubSnapshotDialog.close());
}

if (openSessionVisualsBtn) {
  openSessionVisualsBtn.addEventListener("click", () => openSessionVisualsDialog());
}

if (closeSessionVisualsDialogX && sessionVisualsDialog) {
  closeSessionVisualsDialogX.addEventListener("click", () => sessionVisualsDialog.close());
}

if (closeProfileDialogX) {
  closeProfileDialogX.addEventListener("click", () => profileDialog.close());
}

if (closeRatingDialogX) {
  closeRatingDialogX.addEventListener("click", () => {
    if (canCloseRatingDialog()) {
      ratingDialog.close();
    } else {
      uiStatus("Rating required.", "Please fill all parameter ratings first.", "error");
    }
  });
}

listenerDetailDialog.addEventListener("click", (ev) => {
  if (ev.target === listenerDetailDialog) listenerDetailDialog.close();
});

profileDialog.addEventListener("click", (ev) => {
  if (ev.target === profileDialog) profileDialog.close();
});

performanceDialog.addEventListener("click", (ev) => {
  if (ev.target === performanceDialog) performanceDialog.close();
});

if (hubSnapshotDialog) {
  hubSnapshotDialog.addEventListener("click", (ev) => {
    if (ev.target === hubSnapshotDialog) hubSnapshotDialog.close();
  });
}

if (sessionVisualsDialog) {
  sessionVisualsDialog.addEventListener("click", (ev) => {
    if (ev.target === sessionVisualsDialog) sessionVisualsDialog.close();
  });
}

ratingDialog.addEventListener("click", (ev) => {
  if (ev.target !== ratingDialog) return;
  if (canCloseRatingDialog()) {
    ratingDialog.close();
  } else {
    uiStatus("Rating required.", "Please fill all parameter ratings first.", "error");
  }
});

editProfileBtn.addEventListener("click", () => {
  profileDialogInterests.value = interestsInput.value || "";
  profileDialogAnswers.value = answersInput.value || "";
  if (typeof profileDialog.showModal === "function") profileDialog.showModal();
});

if (cancelProfileBtn) {
  cancelProfileBtn.addEventListener("click", () => {
    profileDialog.close();
  });
}

applyListenerBtn.addEventListener("click", async () => {
  try {
    const interests = interestsInput.value
      .split(/[,\n;]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const qualificationAnswers = answersInput.value
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    uiStatus("Applying listener profile...", "Saving interests and qualification answers.");
    await api("/api/escalation/listener/apply", {
      method: "POST",
      body: JSON.stringify({ interests, qualificationAnswers })
    });
    await refreshAll();
    uiStatus("Listener profile applied.", "You can now toggle listening mode.", "ok");
  } catch (err) {
    uiStatus("Listener apply failed.", parseApiError(err, "Could not apply listener."), "error");
  }
});

saveProfileBtn.addEventListener("click", async () => {
  try {
    const interests = profileDialogInterests.value
      .split(/[,\n;]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const qualificationAnswers = profileDialogAnswers.value
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    uiStatus("Saving listener profile...", "Updating interests and qualification answers.");
    await api("/api/escalation/listener/apply", {
      method: "POST",
      body: JSON.stringify({ interests, qualificationAnswers })
    });
    profileDialog.close();
    await refreshAll();
    uiStatus("Profile updated.", "Future slots will use the saved profile.", "ok");
  } catch (err) {
    uiStatus("Profile update failed.", parseApiError(err, "Could not update profile."), "error");
  }
});

if (isListeningEnabled) {
  isListeningEnabled.addEventListener("change", async () => {
    try {
      await api("/api/escalation/listener/toggle-listening", {
        method: "PATCH",
        body: JSON.stringify({ enabled: isListeningEnabled.checked })
      });
      await refreshAll();
      uiStatus(isListeningEnabled.checked ? "Listening enabled." : "Listening disabled.", "Discovery list updated.", "ok");
    } catch (err) {
      isListeningEnabled.checked = !isListeningEnabled.checked;
      uiStatus("Could not update listener availability.", parseApiError(err, "Try again."), "error");
    }
  });
}

async function handleOpenSlot() {
  try {
    const date = slotDate.value;
    const time = slotTime.value;
    const feeInr = Math.max(0, Number(slotFeeInr.value || 0));
    if (!date || !time) {
      uiStatus("Incomplete slot data.", "Provide slot date and time.", "error");
      return;
    }
    uiStatus("Opening listener slot...", "Publishing slot for discovery.");
    await api("/api/escalation/slots/open", {
      method: "POST",
      body: JSON.stringify({ date, time, feeInr })
    });
    await refreshAll();
    uiStatus("Slot opened.", "Users can now discover and book this slot.", "ok");
  } catch (err) {
    uiStatus("Open slot failed.", parseApiError(err, "Could not open slot."), "error");
  }
}

function setupHoldToExecuteOpenSlot() {
  const wrap = document.querySelector("[data-hold-exec-wrap]");
  const progress = wrap?.querySelector(".hold-exec-progress");
  if (!openSlotBtn || !wrap || !progress) return;

  const HOLD_MS = 1500;
  let holdTimer = null;
  let holdStarted = false;
  let holdCompleted = false;

  const resetProgress = (instant = false) => {
    progress.style.transition = instant ? "none" : "stroke-dashoffset 180ms ease-out";
    progress.style.strokeDashoffset = "176";
    wrap.classList.remove("holding");
    setTimeout(() => {
      progress.style.transition = "";
    }, 0);
  };

  const beginHold = () => {
    if (holdStarted) return;
    holdStarted = true;
    holdCompleted = false;
    wrap.classList.add("holding");
    progress.style.transition = `stroke-dashoffset ${HOLD_MS}ms linear`;
    progress.style.strokeDashoffset = "0";
    holdTimer = setTimeout(async () => {
      holdCompleted = true;
      holdStarted = false;
      openSlotBtn.classList.add("hold-fired-flash");
      setTimeout(() => openSlotBtn.classList.remove("hold-fired-flash"), 50);
      await handleOpenSlot();
      setTimeout(() => resetProgress(false), 80);
    }, HOLD_MS);
  };

  const cancelHold = () => {
    if (!holdStarted) return;
    holdStarted = false;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (!holdCompleted) {
      resetProgress(false);
    }
  };

  openSlotBtn.addEventListener("pointerdown", (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    beginHold();
  });

  openSlotBtn.addEventListener("pointerup", cancelHold);
  openSlotBtn.addEventListener("pointerleave", cancelHold);
  openSlotBtn.addEventListener("pointercancel", cancelHold);

  openSlotBtn.addEventListener(
    "click",
    async (ev) => {
      if (ev.detail === 0 && !holdStarted) {
        await handleOpenSlot();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
    },
    true
  );

  resetProgress(true);
}

setupHoldToExecuteOpenSlot();

myOpenSlotsBox.addEventListener("click", async (ev) => {
  const action = ev.target?.dataset?.action;
  const id = ev.target?.dataset?.id;
  if (action !== "remove-slot" || !id) return;
  try {
    await api(`/api/escalation/slots/${id}`, { method: "DELETE" });
    await refreshAll();
    uiStatus("Slot removed.", "Closed slot is no longer discoverable.", "ok");
  } catch (err) {
    uiStatus("Remove slot failed.", parseApiError(err, "Could not remove slot."), "error");
  }
});

listenerMarketplaceBox.addEventListener("click", async (ev) => {
  const action = ev.target?.dataset?.action;
  const id = ev.target?.dataset?.id;
  if (!action || !id) return;
  if (action === "book-slot") {
    try {
      selectSlot(id);
      const modeEl = ev.target.closest(".contact-item")?.querySelector(`select[data-role="book-mode"][data-id="${String(id)}"]`);
      const mode = modeEl?.value || "chat";
      uiStatus("Creating booking...", "Sending booking request to listener.");
      const out = await api("/api/escalation/booking/create", {
        method: "POST",
        body: JSON.stringify({ slotId: id, mode })
      });
      selectedSlotId = "";
      selectedSlot = null;
      selectSlot("");
      await refreshAll();
      uiStatus("Booking created.", out.paymentMessage || "Waiting for listener Accept/Reject.", "ok");
    } catch (err) {
      uiStatus("Booking failed.", parseApiError(err, "Could not create booking."), "error");
    }
    return;
  }
  if (action === "view-listener-detail") {
    openListenerDetail(id);
  }
});

walletTopupBtn.addEventListener("click", async () => {
  try {
    const amountInr = Number(walletTopupInput.value || 0);
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      uiStatus("Invalid top-up amount.", "Enter a positive INR amount.", "error");
      return;
    }
    uiStatus("Adding test funds...", "Updating mock wallet.");
    const out = await api("/api/escalation/wallet/mock/topup", {
      method: "POST",
      body: JSON.stringify({ amountInr })
    });
    walletTopupInput.value = "";
    renderWallet(out.wallet || null);
    await refreshAll();
    uiStatus("Wallet topped up.", `New balance: Rs ${Number(out.wallet?.balanceInr || 0).toFixed(2)}`, "ok");
  } catch (err) {
    uiStatus("Top-up failed.", parseApiError(err, "Could not add funds."), "error");
  }
});

incomingBookingsBox.addEventListener("click", async (ev) => {
  const action = ev.target?.dataset?.action;
  const id = ev.target?.dataset?.id;
  if (!action || !id) return;
  try {
    if (action === "accept-booking") {
      uiStatus("Accepting booking...", "Processing request.");
      await respondToBooking(id, "accept");
      await refreshAll();
      uiStatus("Booking accepted.", "Speaker has been notified.", "ok");
      return;
    }
    if (action === "reject-booking") {
      uiStatus("Rejecting booking...", "Sending rejection.");
      await respondToBooking(id, "reject");
      await refreshAll();
      uiStatus("Booking rejected.", "Speaker has been notified.", "ok");
      return;
    }
    if (action === "cancel-booking") {
      uiStatus("Cancelling slot...", "Notifying the other participant.");
      await api("/api/escalation/booking/cancel", {
        method: "POST",
        body: JSON.stringify({ bookingId: id })
      });
      await refreshAll();
      uiStatus("Slot cancelled.", "The other participant has been notified.", "ok");
    }
  } catch (err) {
    uiStatus("Booking response failed.", parseApiError(err, "Could not update booking."), "error");
  }
});

outgoingBookingsBox.addEventListener("click", async (ev) => {
  const action = ev.target?.dataset?.action;
  const id = ev.target?.dataset?.id;
  if (!action || !id) return;
  if (action === "cancel-booking") {
    try {
      uiStatus("Cancelling slot...", "Notifying the other participant.");
      await api("/api/escalation/booking/cancel", {
        method: "POST",
        body: JSON.stringify({ bookingId: id })
      });
      await refreshAll();
      uiStatus("Slot cancelled.", "The other participant has been notified.", "ok");
    } catch (err) {
      uiStatus("Cancel failed.", parseApiError(err, "Could not cancel slot."), "error");
    }
    return;
  }
  if (action === "open-chat") {
    chatBookingSelect.value = id;
    await loadChatMessagesForSelected();
  }
});

chatBookingSelect.addEventListener("change", async () => {
  updateChatSubscription(chatBookingSelect.value);
  await loadChatMessagesForSelected();
});

sendChatMessageBtn.addEventListener("click", async () => {
  const bookingId = chatBookingSelect.value;
  const text = chatMessageInput.value.trim();
  if (!bookingId || !text) return;
  try {
    await api(`/api/escalation/chat/message/${bookingId}`, {
      method: "POST",
      body: JSON.stringify({ text })
    });
    chatMessageInput.value = "";
    await loadChatMessagesForSelected();
    uiStatus("Chat message sent.", "Private session message recorded.", "ok");
  } catch (err) {
    uiStatus("Chat send failed.", parseApiError(err, "Could not send chat message."), "error");
  }
});

purgeChatBtn.addEventListener("click", async () => {
  const bookingId = chatBookingSelect.value;
  if (!bookingId) return;
  try {
    uiStatus("Purging chat now...", "Deleting transcript and preserving AI takeaways.");
    await api(`/api/escalation/chat/purge/${bookingId}`, { method: "POST", body: "{}" });
    await refreshAll();
    await loadChatMessagesForSelected();
    uiStatus("Chat purged.", "Raw transcript deleted from database.", "ok");
  } catch (err) {
    uiStatus("Purge failed.", parseApiError(err, "Only speaker can purge chat."), "error");
  }
});

submitRatingBtn.addEventListener("click", async () => {
  if (!pendingRatingBookingId) {
    uiStatus("No pending session.", "No completed unrated session found.", "error");
    return;
  }
  const ratingBreakdown = {
    empathy: Number(rateEmpathy.value),
    politeness: Number(ratePoliteness.value),
    patience: Number(ratePatience.value),
    engagement: Number(rateEngagement.value),
    connection: Number(rateConnection.value),
    tipsQuality: Number(rateTipsQuality.value)
  };
  if (Object.values(ratingBreakdown).some((x) => !Number.isFinite(x) || x < 0 || x > 10)) {
    uiStatus("Invalid ratings.", "All six parameters are mandatory and must be between 0 and 10.", "error");
    return;
  }
  ratingSubmitInProgress = true;
  try {
    const out = await api("/api/escalation/booking/rate", {
      method: "POST",
      body: JSON.stringify({
        bookingId: pendingRatingBookingId,
        ratingBreakdown,
        notes: ratingNotes.value.trim()
      })
    });
    pendingRatingBookingId = "";
    if (ratingDialog.open) ratingDialog.close();
    await refreshAll();
    if (chatBookingSelect.value && String(chatBookingSelect.value) === String(out.bookingId)) {
      chatBookingSelect.value = "";
      updateChatSubscription("");
      stopChatCountdown();
      chatSessionStatus.textContent = "No chat booking selected.";
      renderChatMessages([]);
    }
    uiStatus(
      "Session rating submitted.",
      `Session: ${out.sessionRating}, Listener avg: ${out.averageRating}, Premium eligible: ${out.premiumEligible ? "Yes" : "No"}`,
      "ok"
    );
  } catch (err) {
    uiStatus("Rating submit failed.", parseApiError(err, "Could not submit rating."), "error");
  } finally {
    ratingSubmitInProgress = false;
  }
});

if (ratingDialog) {
  ratingDialog.addEventListener("cancel", (event) => {
    if (pendingRatingBookingId) {
      event.preventDefault();
      uiStatus("Rating required.", "All rating parameters are mandatory. Submit ratings to continue.", "error");
    }
  });
}

chatMessageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendChatMessageBtn.click();
  }
});

slotDate.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    openSlotBtn.click();
  }
});

slotTime.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    openSlotBtn.click();
  }
});

slotFeeInr.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    openSlotBtn.click();
  }
});

rateEmpathy.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitRatingBtn.click();
  }
});
ratePoliteness.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitRatingBtn.click();
  }
});
ratePatience.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitRatingBtn.click();
  }
});
rateEngagement.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitRatingBtn.click();
  }
});
rateConnection.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitRatingBtn.click();
  }
});
rateTipsQuality.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitRatingBtn.click();
  }
});

(async function init() {
  currentUser = await requireSession();
  if (!currentUser) return;
  try {
    const now = new Date();
    slotDate.value = now.toISOString().slice(0, 10);
    slotTime.value = "18:00";
    slotFeeInr.value = "0";
    selectSlot("");
    uiStatus("Loading Escalation Hub...", "Fetching slots, bookings, and wellness logs.");
    await refreshAll();
    await loadChatMessagesForSelected();
    await maybePromptPendingRatingDialog();
    connectRealtime();
    uiStatus("Escalation Hub ready.", "Open slots or book from available listener cards.", "ok");
  } catch (err) {
    uiStatus("Escalation load failed.", parseApiError(err, "Could not initialize page."), "error");
  }
})();

window.addEventListener("beforeunload", () => {
  stopChatCountdown();
  stopMeetCountdown();
});
