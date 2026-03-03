import { api, clearToken, requireSession } from "./client.js";

const dashboardBtn = document.getElementById("dashboardBtn");
const escalationBtn = document.getElementById("escalationBtn");
const deleteChatBtn = document.getElementById("deleteChatBtn");
const logoutBtn = document.getElementById("logoutBtn");
const changePasswordBtn = document.getElementById("changePasswordBtn");
const chatLog = document.getElementById("chatLog");
const message = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const modeSelect = document.getElementById("modeSelect");
const queueBadge = document.getElementById("queueBadge");
const referenceAnchorBar = document.getElementById("referenceAnchorBar");
const referenceAnchorText = document.getElementById("referenceAnchorText");
const clearReferenceAnchorBtn = document.getElementById("clearReferenceAnchorBtn");
const tips = document.getElementById("tips");
const emailDraft = document.getElementById("emailDraft");
const sendEmailBtn = document.getElementById("sendEmailBtn");
const telegramDraft = document.getElementById("telegramDraft");
const sendTelegramBtn = document.getElementById("sendTelegramBtn");
const discordDraft = document.getElementById("discordDraft");
const sendDiscordBtn = document.getElementById("sendDiscordBtn");
const voiceCallDraft = document.getElementById("voiceCallDraft");
const sendVoiceCallBtn = document.getElementById("sendVoiceCallBtn");
const meetStatus = document.getElementById("meetStatus");
const meetProposalBox = document.getElementById("meetProposalBox");
const meetProposalText = document.getElementById("meetProposalText");
const confirmMeetBtn = document.getElementById("confirmMeetBtn");
const cancelMeetBtn = document.getElementById("cancelMeetBtn");
const choiceBox = document.getElementById("choiceBox");
const choiceText = document.getElementById("choiceText");
const choosePhysicalBtn = document.getElementById("choosePhysicalBtn");
const chooseGoogleMeetBtn = document.getElementById("chooseGoogleMeetBtn");
const chooseTelegramBtn = document.getElementById("chooseTelegramBtn");
const chooseDiscordBtn = document.getElementById("chooseDiscordBtn");
const draftTabButtons = Array.from(document.querySelectorAll("[data-draft-tab-btn]"));
const draftPanes = Array.from(document.querySelectorAll("[data-draft-pane]"));
const draftTabAttachmentBadges = {};
const copyTelegramBtn = document.getElementById("copyTelegramBtn");
const copyDiscordBtn = document.getElementById("copyDiscordBtn");
const copyVoiceBtn = document.getElementById("copyVoiceBtn");
const emailDraftPanel = emailDraft ? emailDraft.closest(".panel-soft") : null;
const telegramDraftPanel = telegramDraft ? telegramDraft.closest("[data-draft-pane]") : null;
const discordDraftPanel = discordDraft ? discordDraft.closest("[data-draft-pane]") : null;
const voiceDraftPanel = voiceCallDraft ? voiceCallDraft.closest("[data-draft-pane]") : null;
const chatKpiTotal = document.getElementById("chatKpiTotal");
const chatKpiUser = document.getElementById("chatKpiUser");
const chatKpiBot = document.getElementById("chatKpiBot");
const chatKpiAlerts = document.getElementById("chatKpiAlerts");
const chatUserPct = document.getElementById("chatUserPct");
const chatBotPct = document.getElementById("chatBotPct");
const chatUserFill = document.getElementById("chatUserFill");
const chatBotFill = document.getElementById("chatBotFill");
const chatModeUsage = document.getElementById("chatModeUsage");
const chatTrendSpark = document.getElementById("chatTrendSpark");
const chatToneLabel = document.getElementById("chatToneLabel");
const openSnapshotBtn = document.getElementById("openSnapshotBtn");
const snapshotDialog = document.getElementById("snapshotDialog");
const closeSnapshotDialogX = document.getElementById("closeSnapshotDialogX");
const callIntelBox = document.getElementById("callIntelBox");
const callStatusNow = document.getElementById("callStatusNow");
const clearCallIntelBtn = document.getElementById("clearCallIntelBtn");
const uiStatus = (main, sub = "", tone = "info") => window.setUIStatus?.(main, sub, tone);
let latestEmailContactIds = [];
let latestTelegramContactIds = [];
let latestDiscordChannelIds = [];
let latestVoiceCallContactId = "";
let latestProposalId = "";
let pendingChoiceBaseMessage = "";
let forcedActionChoice = "";
let selectedModeChoice = "support_chat";
const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
let llmPendingCount = 0;
let thinkingBubble = null;
let processChatQueue = Promise.resolve();
let pendingQueueCount = 0;
let contactsCache = [];
let discordChannelsCache = [];
let selectedRecipients = new Set();
let recipientPickerMode = "";
let recipientPickerKind = "";
let recipientPickerNode = null;
let recipientPickerFiles = [];
let latestDispatchAttachments = [];
const chatSnapshot = {
  total: 0,
  user: 0,
  bot: 0,
  alerts: 0,
  modeChanges: 0,
  modes: {
    support_chat: 0,
    general_mail: 0,
    telegram_message: 0,
    discord_message: 0,
    voice_call: 0,
    google_meet: 0
  }
};
const companionToneSeries = [];
const MAX_TONE_POINTS = 20;
let speechRecognizer = null;
let selectedReferenceText = "";
let referencePopoverBtn = null;
let voiceCallPollTimer = null;
let lastVoiceStatusFingerprint = "";
let lastIntelCallId = "";
let currentUserName = "You";

const modeToDraftTab = {
  telegram_message: "telegram",
  discord_message: "discord",
  voice_call: "voice"
};

function scoreCompanionTone(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return 0.5;
  const positive = [
    "support",
    "here for you",
    "calm",
    "breathe",
    "better",
    "good",
    "glad",
    "steady",
    "safe",
    "you can",
    "together",
    "help",
    "strong"
  ];
  const negative = [
    "urgent",
    "danger",
    "crisis",
    "distress",
    "harm",
    "suicidal",
    "panic",
    "unsafe",
    "risk",
    "emergency",
    "immediately"
  ];
  let p = 0;
  let n = 0;
  for (const w of positive) if (t.includes(w)) p += 1;
  for (const w of negative) if (t.includes(w)) n += 1;
  const raw = (p - n) / Math.max(1, p + n + 2);
  return Math.max(0, Math.min(1, 0.5 + raw * 0.6));
}

function toneLabelFromScore(score) {
  const s = Number(score || 0.5);
  if (s >= 0.72) return "Very Supportive";
  if (s >= 0.58) return "Supportive";
  if (s >= 0.42) return "Neutral";
  if (s >= 0.28) return "Concerned";
  return "High Alert";
}

function renderCompanionToneSparkline() {
  if (!chatTrendSpark) return;
  if (!companionToneSeries.length) {
    chatTrendSpark.innerHTML = '<div class="chat-trend-empty">No companion replies yet</div>';
    if (chatToneLabel) chatToneLabel.textContent = "Neutral";
    return;
  }
  const values = companionToneSeries.slice(-MAX_TONE_POINTS);
  const w = 360;
  const h = 132;
  const left = 42;
  const right = 12;
  const top = 22;
  const bottom = 34;
  const cw = w - left - right;
  const ch = h - top - bottom;
  const step = values.length > 1 ? cw / (values.length - 1) : 0;
  const xAt = (i) => left + i * step;
  const yAt = (v) => top + (1 - v) * ch;
  const points = values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
  const area = `${left},${top + ch} ${points} ${left + cw},${top + ch}`;
  const latest = values[values.length - 1];
  if (chatToneLabel) chatToneLabel.textContent = toneLabelFromScore(latest);
  const glow = latest >= 0.58 ? "#f05b2b" : latest >= 0.42 ? "#b86a52" : "#ff0000";
  const midIndex = Math.max(0, Math.floor((values.length - 1) / 2));
  const xTickFirst = xAt(0);
  const xTickMid = xAt(midIndex);
  const xTickLast = xAt(values.length - 1);
  const yTick0 = yAt(0);
  const yTick5 = yAt(0.5);
  const yTick10 = yAt(1);
  const xTickLastLabel = `R${values.length}`;
  chatTrendSpark.innerHTML = `
    <svg class="chat-trend-svg" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="chatTrendArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${glow}" stop-opacity="0.38"></stop>
          <stop offset="100%" stop-color="${glow}" stop-opacity="0.04"></stop>
        </linearGradient>
      </defs>
      <line class="chat-trend-axis" x1="${left}" y1="${top + ch}" x2="${left + cw}" y2="${top + ch}"></line>
      <line class="chat-trend-axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + ch}"></line>
      <line class="chat-trend-grid" x1="${left}" y1="${yTick0}" x2="${left + cw}" y2="${yTick0}"></line>
      <line class="chat-trend-grid" x1="${left}" y1="${yTick5}" x2="${left + cw}" y2="${yTick5}"></line>
      <line class="chat-trend-grid" x1="${left}" y1="${yTick10}" x2="${left + cw}" y2="${yTick10}"></line>
      <polygon class="chat-trend-area" points="${area}"></polygon>
      <polyline class="chat-trend-line" points="${points}" style="stroke:${glow}"></polyline>
      <circle class="chat-trend-node" cx="${xAt(values.length - 1)}" cy="${yAt(latest)}" r="3.5" style="fill:${glow}"></circle>
      <text class="chat-trend-tick" x="${left - 8}" y="${yTick10 + 3}" text-anchor="end">1.0</text>
      <text class="chat-trend-tick" x="${left - 8}" y="${yTick5 + 3}" text-anchor="end">0.5</text>
      <text class="chat-trend-tick" x="${left - 8}" y="${yTick0 + 3}" text-anchor="end">0.0</text>
      <text class="chat-trend-tick" x="${xTickFirst}" y="${top + ch + 18}" text-anchor="middle">R1</text>
      <text class="chat-trend-tick" x="${xTickMid}" y="${top + ch + 18}" text-anchor="middle">R${midIndex + 1}</text>
      <text class="chat-trend-tick" x="${xTickLast}" y="${top + ch + 18}" text-anchor="middle">${xTickLastLabel}</text>
      <text class="chat-trend-axis-label" x="${left + cw / 2}" y="${h - 6}" text-anchor="middle">X: Reply sequence (older → latest)</text>
      <text class="chat-trend-axis-label" x="14" y="${top + ch / 2}" transform="rotate(-90 14 ${top + ch / 2})" text-anchor="middle">Y: Tone score (0–1)</text>
      <rect x="${left + cw - 118}" y="${top - 15}" width="10" height="10" rx="2" fill="${glow}"></rect>
      <text class="chat-trend-legend" x="${left + cw - 102}" y="${top - 6}">Companion tone</text>
    </svg>
  `;
}

function getSelectedModeActionChoice() {
  if (!modeSelect) return "";
  const value = String(modeSelect.value || "").trim();
  if (!value) return "";
  return value;
}

function getEffectiveActionChoice() {
  return getSelectedModeActionChoice() || forcedActionChoice || "";
}

function syncModeVisualState() {
  if (!modeSelect) return;
  const active = String(modeSelect.value || "") !== "support_chat";
  modeSelect.classList.toggle("active-mode", active);
}

function renderQueueBadge() {
  if (!queueBadge) return;
  if (pendingQueueCount > 0) {
    queueBadge.style.display = "inline-flex";
    queueBadge.textContent = `Queued (${pendingQueueCount})`;
  } else {
    queueBadge.style.display = "none";
  }
}

function animateMetric(el, target, duration = 500) {
  if (!el) return;
  const current = Number(String(el.textContent || "0").replace(/[^\d.-]/g, "")) || 0;
  const goal = Number(target || 0);
  const t0 = performance.now();
  const run = (t) => {
    const p = Math.min(1, (t - t0) / duration);
    const eased = 1 - (1 - p) * (1 - p);
    const val = current + (goal - current) * eased;
    el.textContent = `${Math.round(val)}`;
    if (p < 1) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
}

function renderModeUsage() {
  if (!chatModeUsage) return;
  const labels = {
    support_chat: "Companion",
    general_mail: "Email",
    telegram_message: "Telegram",
    discord_message: "Discord",
    voice_call: "Voice",
    google_meet: "GMeet"
  };
  const rows = Object.keys(chatSnapshot.modes)
    .map((k) => ({ key: k, count: Number(chatSnapshot.modes[k] || 0), label: labels[k] || k }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!rows.length) {
    chatModeUsage.innerHTML = '<span class="chat-mode-chip">No mode activity yet</span>';
    return;
  }
  chatModeUsage.innerHTML = rows.map((r) => `<span class="chat-mode-chip">${r.label}: ${r.count}</span>`).join("");
}

function renderChatSnapshot() {
  animateMetric(chatKpiTotal, chatSnapshot.total, 520);
  animateMetric(chatKpiUser, chatSnapshot.user, 560);
  animateMetric(chatKpiBot, chatSnapshot.bot, 600);
  animateMetric(chatKpiAlerts, chatSnapshot.alerts, 640);
  const userShare = chatSnapshot.total > 0 ? Math.round((chatSnapshot.user / chatSnapshot.total) * 100) : 0;
  const botShare = chatSnapshot.total > 0 ? Math.round((chatSnapshot.bot / chatSnapshot.total) * 100) : 0;
  if (chatUserPct) chatUserPct.textContent = `${userShare}%`;
  if (chatBotPct) chatBotPct.textContent = `${botShare}%`;
  if (chatUserFill) chatUserFill.style.setProperty("--fill", `${userShare}%`);
  if (chatBotFill) chatBotFill.style.setProperty("--fill", `${botShare}%`);
  renderModeUsage();
  renderCompanionToneSparkline();
}

function resetChatSnapshot() {
  chatSnapshot.total = 0;
  chatSnapshot.user = 0;
  chatSnapshot.bot = 0;
  chatSnapshot.alerts = 0;
  chatSnapshot.modeChanges = 0;
  for (const key of Object.keys(chatSnapshot.modes)) chatSnapshot.modes[key] = 0;
  companionToneSeries.length = 0;
  renderChatSnapshot();
}

function noteMessage(type) {
  if (type === "mode-badge" || type === "thinking") return;
  chatSnapshot.total += 1;
  if (type === "me" || type === "me-right") chatSnapshot.user += 1;
  else if (type === "alert") {
    chatSnapshot.alerts += 1;
    chatSnapshot.bot += 1;
  } else {
    chatSnapshot.bot += 1;
  }
  renderChatSnapshot();
}

function noteCompanionTone(type, text) {
  const t = String(type || "");
  if (!(t === "bot" || t === "peer-left")) return;
  const score = scoreCompanionTone(text);
  companionToneSeries.push(score);
  if (companionToneSeries.length > MAX_TONE_POINTS) companionToneSeries.splice(0, companionToneSeries.length - MAX_TONE_POINTS);
  renderCompanionToneSparkline();
}

function noteModeChange(mode) {
  const m = normalizeMode(mode);
  if (!Object.hasOwn(chatSnapshot.modes, m)) chatSnapshot.modes[m] = 0;
  chatSnapshot.modes[m] += 1;
  chatSnapshot.modeChanges += 1;
  renderModeUsage();
}

function activateDraftTab(name) {
  for (const btn of draftTabButtons) {
    const active = String(btn.dataset.draftTabBtn) === String(name);
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const pane of draftPanes) {
    const active = String(pane.dataset.draftPane) === String(name);
    pane.classList.toggle("active", active);
  }
}

function initDraftTabBadges() {
  for (const btn of draftTabButtons) {
    const tab = String(btn.dataset.draftTabBtn || "").trim();
    if (!tab) continue;
    let badge = btn.querySelector(".draft-tab-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "draft-tab-badge";
      badge.textContent = "0";
      btn.appendChild(badge);
    }
    draftTabAttachmentBadges[tab] = badge;
  }
  clearDraftAttachmentBadges();
}

function setDraftAttachmentBadge(tab, count) {
  const badge = draftTabAttachmentBadges[String(tab || "")];
  if (!badge) return;
  const n = Math.max(0, Number(count || 0));
  badge.textContent = `${n}`;
  badge.classList.toggle("active", n > 0);
}

function clearDraftAttachmentBadges() {
  for (const tab of Object.keys(draftTabAttachmentBadges)) {
    setDraftAttachmentBadge(tab, 0);
  }
}

function setupDraftTabs() {
  if (!draftTabButtons.length) return;
  initDraftTabBadges();
  for (const btn of draftTabButtons) {
    btn.addEventListener("click", () => activateDraftTab(btn.dataset.draftTabBtn));
  }
  activateDraftTab(draftTabButtons[0]?.dataset?.draftTabBtn || "telegram");
}

async function copyToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function toBase64FromDataUrl(dataUrl) {
  const value = String(dataUrl || "");
  const idx = value.indexOf(",");
  return idx >= 0 ? value.slice(idx + 1) : "";
}

function mergePickedFiles(existing = [], incoming = []) {
  const map = new Map();
  for (const f of existing) {
    const k = `${f.name}::${f.size}::${f.lastModified}`;
    map.set(k, f);
  }
  for (const f of incoming) {
    const k = `${f.name}::${f.size}::${f.lastModified}`;
    map.set(k, f);
  }
  return Array.from(map.values()).slice(0, 10);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

async function filesToAttachmentPayload(files = []) {
  const out = [];
  for (const file of files.slice(0, 10)) {
    const dataUrl = await fileToDataUrl(file);
    const dataBase64 = toBase64FromDataUrl(dataUrl);
    if (!dataBase64) continue;
    out.push({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      dataBase64
    });
  }
  return out;
}

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function startSpeechCapture(targetInput) {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    uiStatus("Voice input unavailable.", "Speech recognition is not supported in this browser.", "error");
    return;
  }
  if (!targetInput) return;
  try {
    if (speechRecognizer) {
      speechRecognizer.stop();
      speechRecognizer = null;
    }
    const rec = new Ctor();
    speechRecognizer = rec;
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let silenceTimer = null;
    let idleWatch = null;
    let committed = false;
    let hadInput = false;
    let captured = "";
    let interim = "";
    const liveBase = String(targetInput.value || "").trim();
    let lastActivityAt = Date.now();
    const armSilenceCutoff = () => {
      lastActivityAt = Date.now();
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        try {
          rec.abort();
        } catch {}
      }, 5000);
    };
    const normalizeSpeech = (s) =>
      String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    const composeLiveValue = () => {
      const parts = [liveBase, normalizeSpeech(captured), normalizeSpeech(interim)].filter(Boolean);
      return parts.join(" ").replace(/\s+/g, " ").trim();
    };
    const renderLive = () => {
      targetInput.value = composeLiveValue();
      targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const mergeSpeech = (base, chunk) => {
      const a = normalizeSpeech(base);
      const b = normalizeSpeech(chunk);
      if (!b) return a;
      if (!a) return b;
      const al = a.toLowerCase();
      const bl = b.toLowerCase();
      if (bl === al) return a;
      if (bl.startsWith(al)) return b;
      if (al.startsWith(bl)) return a;
      const aw = a.split(" ");
      const bw = b.split(" ");
      const maxOverlap = Math.min(aw.length, bw.length);
      let overlap = 0;
      for (let k = maxOverlap; k > 0; k -= 1) {
        const tail = aw.slice(aw.length - k).join(" ").toLowerCase();
        const head = bw.slice(0, k).join(" ").toLowerCase();
        if (tail === head) {
          overlap = k;
          break;
        }
      }
      if (overlap > 0) {
        return `${a} ${bw.slice(overlap).join(" ")}`.trim();
      }
      return `${a} ${b}`.trim();
    };
    uiStatus("Listening...", "Speak now. Your voice will be converted to text locally in browser.", "info");
    armSilenceCutoff();
    idleWatch = setInterval(() => {
      if (Date.now() - lastActivityAt >= 5000) {
        try {
          rec.abort();
        } catch {}
      }
    }, 250);
    rec.onspeechstart = () => armSilenceCutoff();
    rec.onsoundstart = () => armSilenceCutoff();
    rec.onaudiostart = () => armSilenceCutoff();
    rec.onresult = (ev) => {
      armSilenceCutoff();
      const startIdx = Number(ev?.resultIndex || 0);
      const total = Number(ev?.results?.length || 0);
      let interimCandidate = "";
      for (let i = startIdx; i < total; i += 1) {
        const r = ev.results[i];
        const text = normalizeSpeech(r?.[0]?.transcript || "");
        if (!text) continue;
        hadInput = true;
        if (r?.isFinal) {
          captured = mergeSpeech(captured, text);
          interim = "";
        } else {
          interimCandidate = mergeSpeech(interimCandidate, text);
        }
      }
      if (interimCandidate) {
        interim = interimCandidate;
      }
      renderLive();
    };
    rec.onerror = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (idleWatch) clearInterval(idleWatch);
      uiStatus("Voice capture failed.", "Could not transcribe speech. Try again.", "error");
    };
    rec.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (idleWatch) clearInterval(idleWatch);
      if (!committed) {
        committed = true;
        const finalText = normalizeSpeech(captured || interim);
        if (finalText) {
          const parts = [liveBase, finalText].filter(Boolean);
          targetInput.value = parts.join(" ").replace(/\s+/g, " ").trim();
          targetInput.dispatchEvent(new Event("input", { bubbles: true }));
          uiStatus("Voice captured.", "Text inserted into message box.", "ok");
        } else if (!hadInput) {
          uiStatus("Listening stopped.", "No speech detected for 5 seconds.", "info");
        }
      }
      if (speechRecognizer === rec) speechRecognizer = null;
    };
    rec.start();
  } catch {
    uiStatus("Voice input unavailable.", "Could not start microphone capture.", "error");
  }
}

function setCopiedGlow(btn, on) {
  if (!btn) return;
  btn.classList.toggle("copied", Boolean(on));
}

function setupCopyButtons() {
  if (copyTelegramBtn) {
    copyTelegramBtn.addEventListener("click", async () => {
      const ok = await copyToClipboard(telegramDraft.value);
      if (ok) {
        setCopiedGlow(copyTelegramBtn, true);
        uiStatus("Telegram draft copied.", "Copied to clipboard.", "ok");
        setTimeout(() => setCopiedGlow(copyTelegramBtn, false), 850);
      } else {
        uiStatus("Copy failed.", "No Telegram draft to copy.", "error");
      }
    });
  }
  if (copyDiscordBtn) {
    copyDiscordBtn.addEventListener("click", async () => {
      const ok = await copyToClipboard(discordDraft.value);
      if (ok) {
        setCopiedGlow(copyDiscordBtn, true);
        uiStatus("Discord draft copied.", "Copied to clipboard.", "ok");
        setTimeout(() => setCopiedGlow(copyDiscordBtn, false), 850);
      } else {
        uiStatus("Copy failed.", "No Discord draft to copy.", "error");
      }
    });
  }
  if (copyVoiceBtn) {
    copyVoiceBtn.addEventListener("click", async () => {
      const ok = await copyToClipboard(voiceCallDraft.value);
      if (ok) {
        setCopiedGlow(copyVoiceBtn, true);
        uiStatus("Voice script copied.", "Copied to clipboard.", "ok");
        setTimeout(() => setCopiedGlow(copyVoiceBtn, false), 850);
      } else {
        uiStatus("Copy failed.", "No voice call script to copy.", "error");
      }
    });
  }
}

function shortenRef(text, max = 140) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function setReferenceAnchor(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  selectedReferenceText = clean;
  if (!referenceAnchorBar || !referenceAnchorText) return;
  if (!clean) {
    referenceAnchorBar.style.display = "none";
    referenceAnchorText.textContent = "";
    return;
  }
  referenceAnchorText.textContent = `Ref: "${shortenRef(clean)}"`;
  referenceAnchorBar.style.display = "flex";
}

function ensureReferencePopover() {
  if (referencePopoverBtn) return referencePopoverBtn;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chat-ref-popover-btn";
  btn.textContent = "Refer this";
  btn.style.display = "none";
  btn.addEventListener("click", () => {
    const sel = window.getSelection();
    const text = String(sel?.toString() || "").trim();
    if (!text) return;
    setReferenceAnchor(text);
    btn.style.display = "none";
    uiStatus("Reference pinned.", "Your next message will include this selected context for the assistant.", "ok");
  });
  document.body.appendChild(btn);
  referencePopoverBtn = btn;
  return btn;
}

function hideReferencePopover() {
  if (!referencePopoverBtn) return;
  referencePopoverBtn.style.display = "none";
}

function initSelectionReferenceUi() {
  ensureReferencePopover();
  if (clearReferenceAnchorBtn) {
    clearReferenceAnchorBtn.addEventListener("click", () => setReferenceAnchor(""));
  }
  const showIfValidSelection = () => {
    const sel = window.getSelection();
    const selected = String(sel?.toString() || "").trim();
    if (!selected || !chatLog) {
      hideReferencePopover();
      return;
    }
    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!range) {
      hideReferencePopover();
      return;
    }
    const common = range.commonAncestorContainer;
    const containerNode = common?.nodeType === Node.TEXT_NODE ? common.parentElement : common;
    if (!containerNode || !chatLog.contains(containerNode)) {
      hideReferencePopover();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideReferencePopover();
      return;
    }
    const btn = ensureReferencePopover();
    btn.style.left = `${Math.max(12, rect.right + 8)}px`;
    btn.style.top = `${Math.max(12, rect.top - 6)}px`;
    btn.style.display = "inline-flex";
  };
  document.addEventListener("mouseup", () => setTimeout(showIfValidSelection, 0));
  document.addEventListener("keyup", () => setTimeout(showIfValidSelection, 0));
  document.addEventListener("scroll", hideReferencePopover, true);
  document.addEventListener("click", (ev) => {
    if (referencePopoverBtn && ev.target === referencePopoverBtn) return;
    if (referenceAnchorBar && referenceAnchorBar.contains(ev.target)) return;
    const sel = window.getSelection();
    if (!String(sel?.toString() || "").trim()) hideReferencePopover();
  });
}

function appendFormattedText(container, text) {
  const value = String(text || "");
  const parts = value.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      container.appendChild(strong);
    } else if (part) {
      container.appendChild(document.createTextNode(part));
    }
  }
}

function isTableSeparatorLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("-")) return false;
  const normalized = trimmed.replace(/\|/g, "").replace(/:/g, "").replace(/\s/g, "");
  return normalized.length > 0 && /^-+$/.test(normalized);
}

function parseTableRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((x) => x.trim());
}

function appendTableBlock(container, headerLine, bodyLines) {
  const table = document.createElement("table");
  table.className = "msg-table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const cell of parseTableRow(headerLine)) {
    const th = document.createElement("th");
    appendFormattedText(th, cell);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const line of bodyLines) {
    const row = document.createElement("tr");
    for (const cell of parseTableRow(line)) {
      const td = document.createElement("td");
      appendFormattedText(td, cell);
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

function appendRichMessage(container, text) {
  const lines = String(text || "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    const hasTableHeader = line.includes("|") && next && isTableSeparatorLine(next);
    if (hasTableHeader) {
      const body = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
        if (!isTableSeparatorLine(lines[i])) body.push(lines[i]);
        i += 1;
      }
      appendTableBlock(container, line, body);
      if (i < lines.length) container.appendChild(document.createElement("br"));
      continue;
    }

    appendFormattedText(container, line);
    if (i < lines.length - 1) container.appendChild(document.createElement("br"));
    i += 1;
  }
}

function showThinkingBubble() {
  if (thinkingBubble) return;
  thinkingBubble = document.createElement("div");
  thinkingBubble.className = "msg bot thinking";
  thinkingBubble.innerHTML = `
    <span class="thinking-label">Thinking</span>
    <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
  `;
  chatLog.appendChild(thinkingBubble);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function hideThinkingBubble() {
  if (!thinkingBubble) return;
  thinkingBubble.remove();
  thinkingBubble = null;
}

function typewriteMessage(div, text) {
  return new Promise((resolve) => {
    const raw = String(text || "");
    if (!raw) {
      resolve();
      return;
    }
    const speed = raw.length > 700 ? 4 : 11;
    let i = 0;
    const tick = () => {
      i += 1;
      div.textContent = raw.slice(0, i);
      chatLog.scrollTop = chatLog.scrollHeight;
      if (i >= raw.length) {
        resolve();
        return;
      }
      setTimeout(tick, speed);
    };
    tick();
  });
}

async function addMsg(text, type = "bot", opts = {}) {
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  const animate = type === "bot" && opts.animate !== false;
  if ((type === "bot" || type === "alert") && opts.reveal !== false) {
    div.classList.add("slide-decrypt");
  }
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  if (animate) {
    await typewriteMessage(div, text);
    div.innerHTML = "";
    appendRichMessage(div, text);
  } else {
    appendRichMessage(div, text);
  }
  if (type !== "mode-badge" && type !== "thinking") {
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "msg-copy-btn";
    copyBtn.title = "Copy message";
    copyBtn.setAttribute("aria-label", "Copy message");
    copyBtn.innerHTML = "⧉";
    copyBtn.addEventListener("click", async () => {
      const ok = await copyToClipboard(String(text || ""));
      if (ok) {
        copyBtn.classList.add("copied");
        uiStatus("Message copied.", "Copied to clipboard.", "ok");
        setTimeout(() => copyBtn.classList.remove("copied"), 700);
      } else {
        uiStatus("Copy failed.", "Could not copy message.", "error");
      }
    });
    div.appendChild(copyBtn);
  }
  chatLog.scrollTop = chatLog.scrollHeight;
  noteMessage(type);
  noteCompanionTone(type, text);
  return div;
}

function addModeSystemBadge(label) {
  const div = document.createElement("div");
  div.className = "msg mode-badge";
  div.textContent = `Mode: ${label}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  noteModeChange(modeSelect?.value || "support_chat");
}

function clearRecipientPicker() {
  if (recipientPickerNode && recipientPickerNode.parentNode) {
    recipientPickerNode.parentNode.removeChild(recipientPickerNode);
  }
  recipientPickerNode = null;
  recipientPickerMode = "";
  recipientPickerKind = "";
  recipientPickerFiles = [];
  latestDispatchAttachments = [];
  selectedRecipients = new Set();
}

function blinkBoundary(el, times = 3) {
  if (!el) return;
  let count = 0;
  const tick = () => {
    el.classList.toggle("blink-highlight");
    count += 1;
    if (count < times * 2) {
      setTimeout(tick, 180);
    } else {
      el.classList.remove("blink-highlight");
    }
  };
  tick();
}

function focusDraftAreaByMode(mode) {
  const m = normalizeMode(mode);
  if (m === "general_mail" || m === "physical_mail") {
    emailDraftPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    blinkBoundary(emailDraftPanel || emailDraft, 3);
    return;
  }
  if (m === "telegram_message") {
    activateDraftTab("telegram");
    telegramDraftPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    blinkBoundary(telegramDraftPanel || telegramDraft, 3);
    return;
  }
  if (m === "discord_message") {
    activateDraftTab("discord");
    discordDraftPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    blinkBoundary(discordDraftPanel || discordDraft, 3);
    return;
  }
  if (m === "voice_call") {
    activateDraftTab("voice");
    voiceDraftPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    blinkBoundary(voiceDraftPanel || voiceCallDraft, 3);
  }
}

function normalizeMode(mode) {
  const m = String(mode || "").trim();
  if (!m) return "support_chat";
  return m;
}

function getRecipientSpec(mode) {
  const m = normalizeMode(mode);
  if (m === "general_mail" || m === "physical_mail") {
    return {
      kind: "contact",
      label: "Email Mode",
      items: contactsCache.filter((c) => String(c.email || "").trim())
    };
  }
  if (m === "telegram_message") {
    return {
      kind: "contact",
      label: "Telegram Mode",
      items: contactsCache.filter((c) => String(c.telegramChatId || "").trim())
    };
  }
  if (m === "voice_call") {
    return {
      kind: "contact",
      label: "Voice Call Mode",
      items: contactsCache.filter((c) => String(c.phone || "").trim())
    };
  }
  if (m === "google_meet") {
    return {
      kind: "contact",
      label: "Google Meet Mode",
      items: contactsCache.filter((c) => String(c.email || "").trim())
    };
  }
  if (m === "discord_message") {
    return {
      kind: "channel",
      label: "Discord Mode",
      items: discordChannelsCache.filter((c) => String(c.webhookUrl || "").trim())
    };
  }
  return {
    kind: "none",
    label: "General Companion",
    items: []
  };
}

function renderRecipientPickerForMode(mode) {
  const spec = getRecipientSpec(mode);
  if (spec.kind === "none") {
    clearRecipientPicker();
    return;
  }

  const keep = new Set();
  for (const id of selectedRecipients) {
    if (spec.items.some((x) => String(x._id) === String(id))) {
      keep.add(String(id));
    }
  }
  selectedRecipients = keep;
  recipientPickerMode = normalizeMode(mode);
  recipientPickerKind = spec.kind;
  recipientPickerFiles = [];
  latestDispatchAttachments = [];

  if (recipientPickerNode && recipientPickerNode.parentNode) {
    recipientPickerNode.parentNode.removeChild(recipientPickerNode);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "msg bot recipient-picker";

  const title = document.createElement("div");
  title.className = "recipient-picker-title";
  title.textContent = `Select recipients for ${spec.label}:`;
  wrapper.appendChild(title);

  const chips = document.createElement("div");
  chips.className = "recipient-chip-wrap";

  if (!spec.items.length) {
    const empty = document.createElement("div");
    empty.className = "recipient-picker-empty";
    empty.textContent = "No eligible recipients found for this mode.";
    chips.appendChild(empty);
  } else {
    for (const item of spec.items) {
      const id = String(item._id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recipient-chip";
      const itemLabel = spec.kind === "channel" ? item.name : `${item.name}${item.type ? ` (${item.type})` : ""}`;
      btn.textContent = itemLabel;
      if (selectedRecipients.has(id)) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        if (selectedRecipients.has(id)) {
          selectedRecipients.delete(id);
          btn.classList.remove("selected");
        } else {
          selectedRecipients.add(id);
          btn.classList.add("selected");
        }
      });
      chips.appendChild(btn);
    }
  }
  wrapper.appendChild(chips);

  const msgLabel = document.createElement("div");
  msgLabel.className = "recipient-message-label";
  msgLabel.textContent = "Message to send:";
  wrapper.appendChild(msgLabel);

  const msgInputWrap = document.createElement("div");
  msgInputWrap.className = "recipient-message-wrap";
  const msgBox = document.createElement("textarea");
  msgBox.className = "recipient-message-input";
  msgBox.rows = 3;
  msgBox.placeholder =
    recipientPickerMode === "google_meet"
      ? "Provide your supporting message here. LLM will re-write before sending it, along with Google-Meet Link."
      : "Write the message intent here. LLM will rewrite it before draft/send.";
  msgInputWrap.appendChild(msgBox);
  const miniTools = document.createElement("div");
  miniTools.className = "recipient-mini-tools";
  const miniMicBtn = document.createElement("button");
  miniMicBtn.type = "button";
  miniMicBtn.className = "recipient-mini-btn";
  miniMicBtn.title = "Voice input";
  miniMicBtn.innerHTML = "&#127908;";
  miniMicBtn.addEventListener("click", () => startSpeechCapture(msgBox));
  miniTools.appendChild(miniMicBtn);
  const miniAttachBtn = document.createElement("button");
  miniAttachBtn.type = "button";
  miniAttachBtn.className = "recipient-mini-btn";
  miniAttachBtn.title = "Attach document";
  miniAttachBtn.innerHTML = "&#128206;";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.accept = "*/*";
  fileInput.style.display = "none";
  miniAttachBtn.addEventListener("click", () => fileInput.click());
  miniTools.appendChild(miniAttachBtn);
  msgInputWrap.appendChild(miniTools);
  wrapper.appendChild(msgInputWrap);
  wrapper.appendChild(fileInput);
  const attachList = document.createElement("div");
  attachList.className = "recipient-attachment-list";
  attachList.textContent = "No attachments selected.";
  wrapper.appendChild(attachList);
  recipientPickerFiles = [];
  fileInput.addEventListener("change", () => {
    recipientPickerFiles = mergePickedFiles(recipientPickerFiles, Array.from(fileInput.files || []));
    if (!recipientPickerFiles.length) {
      attachList.textContent = "No attachments selected.";
      return;
    }
    attachList.textContent = `Attachments: ${recipientPickerFiles.map((f) => f.name).join(", ")}`;
    fileInput.value = "";
  });

  const actionRow = document.createElement("div");
  actionRow.className = "recipient-action-row";
  const prepareBtn = document.createElement("button");
  prepareBtn.type = "button";
  prepareBtn.className = "ghost recipient-prepare-btn";
  prepareBtn.textContent =
    recipientPickerMode === "google_meet" ? "Rewrite & Send Google Meet Invite" : "Rewrite & Move To Draft";
  actionRow.appendChild(prepareBtn);
  wrapper.appendChild(actionRow);

  prepareBtn.addEventListener("click", async () => {
    try {
      const selected = Array.from(selectedRecipients);
      const raw = String(msgBox.value || "").trim();
      if (!selected.length) {
        uiStatus("No recipients selected.", "Select at least one recipient.", "error");
        return;
      }
      if (!raw) {
        uiStatus("Message missing.", "Write the message before submitting.", "error");
        return;
      }
      const attachmentPayload = await filesToAttachmentPayload(recipientPickerFiles);
      prepareBtn.disabled = true;
      uiStatus("Preparing message...", "LLM is rewriting your message.", "info");
      const out = await api("/api/chat/prepare-dispatch", {
        method: "POST",
        body: JSON.stringify({
          mode: recipientPickerMode,
          selectedContacts: selected,
          message: raw,
          attachments: attachmentPayload
        })
      });
      latestDispatchAttachments = attachmentPayload;
      const activeTab = modeToDraftTab[recipientPickerMode] || "";
      if (activeTab) {
        setDraftAttachmentBadge(activeTab, attachmentPayload.length);
      }
      if (recipientPickerMode === "general_mail" || recipientPickerMode === "physical_mail") {
        if (out.emailDraft) {
          emailDraft.value = `Subject: ${out.emailDraft.subject || ""}\n\n${out.emailDraft.body || ""}`;
          latestEmailContactIds = selected;
          sendEmailBtn.style.display = "inline-block";
          focusDraftAreaByMode(recipientPickerMode);
          uiStatus("Email draft prepared.", "Review and click Send Email.", "ok");
        }
      } else if (recipientPickerMode === "telegram_message") {
        if (out.telegramDraft?.text) {
          telegramDraft.value = out.telegramDraft.text;
          latestTelegramContactIds = selected;
          sendTelegramBtn.style.display = "inline-block";
          focusDraftAreaByMode(recipientPickerMode);
          uiStatus("Telegram draft prepared.", "Review and click Send Telegram.", "ok");
        }
      } else if (recipientPickerMode === "discord_message") {
        if (out.discordDraft?.text) {
          discordDraft.value = out.discordDraft.text;
          latestDiscordChannelIds = selected;
          sendDiscordBtn.style.display = "inline-block";
          focusDraftAreaByMode(recipientPickerMode);
          uiStatus("Discord draft prepared.", "Review and click Send Discord.", "ok");
        }
      } else if (recipientPickerMode === "voice_call") {
        if (out.voiceCallDraft?.text) {
          voiceCallDraft.value = out.voiceCallDraft.text;
          latestVoiceCallContactId = selected[0] || "";
          sendVoiceCallBtn.style.display = "inline-block";
          focusDraftAreaByMode(recipientPickerMode);
          uiStatus("Voice call script prepared.", "Review and click Start Voice Call.", "ok");
        }
      } else if (recipientPickerMode === "google_meet") {
        if (out.sentGoogleMeetInvite?.sent) {
          const link = out.sentGoogleMeetInvite.meetLink || "";
          await addMsg(`Google Meet invite sent to selected contacts.${link ? ` Meet link: ${link}` : ""}`, "bot");
          uiStatus("Google Meet invite sent.", "Invitations delivered by email.", "ok");
          latestDispatchAttachments = [];
          recipientPickerFiles = [];
          fileInput.value = "";
          attachList.textContent = "No attachments selected.";
        } else {
          const reason = out.sentGoogleMeetInvite?.reason || "Google Meet invite send failed.";
          await addMsg(`Google Meet invite failed: ${reason}`, "alert");
          uiStatus("Google Meet invite failed.", reason, "error");
        }
      }
    } catch (err) {
      uiStatus("Preparation failed.", err.message, "error");
    } finally {
      prepareBtn.disabled = false;
    }
  });

  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
  recipientPickerNode = wrapper;
}

function parseEmailDraftText(raw) {
  const text = String(raw || "");
  const m = text.match(/^Subject:\s*(.*)$/im);
  const subject = m ? m[1].trim() : "";
  const body = subject ? text.replace(/^Subject:\s*.*$/im, "").trim() : text.trim();
  return { subject, body };
}

async function loadDiscordChannels() {
  discordChannelsCache = await api("/api/discord-channels");
}

async function loadContacts() {
  contactsCache = await api("/api/contacts");
}

async function refreshRecipientDataForMode(mode) {
  const m = normalizeMode(mode);
  if (m === "discord_message") {
    await loadDiscordChannels();
    return;
  }
  if (
    m === "general_mail" ||
    m === "physical_mail" ||
    m === "telegram_message" ||
    m === "voice_call" ||
    m === "google_meet"
  ) {
    await loadContacts();
  }
}

function getSelectedRecipientIds(kind) {
  const selected = Array.from(selectedRecipients);
  if (kind === "channel") return selected;
  return selected;
}

async function handleDispatch({ mode, draftedMessage, subject = "", body = "", attachments = [] }) {
  const spec = getRecipientSpec(mode);
  const selected = getSelectedRecipientIds(spec.kind);
  if (!selected.length) {
    throw new Error(`Please select at least one ${spec.kind === "channel" ? "channel" : "contact"} from the chat selector.`);
  }
  return api("/api/chat/dispatch", {
    method: "POST",
    body: JSON.stringify({
      mode,
      selectedContacts: selected,
      draftedMessage: String(draftedMessage || ""),
      subject: String(subject || ""),
      body: String(body || ""),
      attachments
    })
  });
}

function prettyCallStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "dialing") return "Ring going on";
  if (s === "ringing") return "Ring going on";
  if (s === "in_progress" || s === "streaming") return "Call in progress";
  if (s === "no_pickup") return "Contact did not pick the call";
  if (s === "rejected") return "Contact rejected the call";
  if (s === "failed") return "Call failed";
  if (s === "cancelled") return "Call cancelled";
  if (s === "completed") return "Call disconnected";
  return s ? `Call status: ${s}` : "No active call.";
}

function personalizeCallIntelText(text, contactName, userName) {
  let out = String(text || "").trim();
  if (!out) return out;
  const contact = String(contactName || "").trim() || "the contact";
  const user = String(userName || "").trim() || "you";
  out = out
    .replace(/\bcaller\b/gi, contact)
    .replace(/\bcontact\b/gi, contact)
    .replace(/\buser\b/gi, user);
  return out;
}

function renderCallIntelligence(data = {}) {
  if (!callIntelBox || !callStatusNow) return;
  const latest = data.latest || null;
  const latestCompleted = data.latestCompletedWithIntel || null;
  const intelLogs = Array.isArray(data.intelLogs) ? data.intelLogs : [];
  const latestStatus = String(latest?.effectiveStatus || latest?.status || "");
  const terminalSet = new Set(["completed", "rejected", "no_pickup", "cancelled", "failed"]);
  const isLatestTerminal = terminalSet.has(
    String(latest?.effectiveTerminalStatus || latest?.effectiveStatus || latest?.terminalStatus || latest?.status || "")
  );
  const latestHasInsights =
    Boolean(String(latest?.intelligenceSummary || "").trim()) ||
    (Array.isArray(latest?.intelligenceKeyPoints) && latest.intelligenceKeyPoints.length > 0) ||
    Boolean(latest?.intelligenceExtractedAt);

  if (latestStatus) {
    callStatusNow.textContent = `${prettyCallStatus(latestStatus)}${latest.contactName ? ` (${latest.contactName})` : ""}`;
  } else {
    callStatusNow.textContent = "No active call.";
  }

  if (isLatestTerminal && !latestHasInsights) {
    callIntelBox.innerHTML = `
      <div class="call-intel-analyzing">
        <span class="call-intel-spinner" aria-hidden="true"></span>
        <div>
          <p class="call-intel-analyzing-title">Analyzing call insights...</p>
          <p class="muted">The call ended. Extracting important points shared by ${latest?.contactName || "the contact"}.</p>
        </div>
      </div>
    `;
    return;
  }

  if (!intelLogs.length && !latestCompleted) {
    callIntelBox.innerHTML = '<p class="muted">Voice-agent call insights will appear here after call disconnects.</p>';
    return;
  }

  const logsToRender = intelLogs.length ? intelLogs : [latestCompleted].filter(Boolean);
  callIntelBox.innerHTML = logsToRender
    .map((log) => {
      const summary = String(log?.intelligenceSummary || "").trim();
      const keyPoints = Array.isArray(log?.intelligenceKeyPoints)
        ? log.intelligenceKeyPoints.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      const sentMessage = String(log?.sentMessage || "").trim();
      const contactName = String(log?.contactName || "").trim() || "Contact";
      const pSummary = personalizeCallIntelText(summary, contactName, currentUserName);
      const pPoints = keyPoints.map((x) => personalizeCallIntelText(x, contactName, currentUserName));
      const pSentMessage = personalizeCallIntelText(sentMessage, contactName, currentUserName);
      const ts = log?.timestamp ? new Date(log.timestamp).toLocaleString() : "";
      return `
        <div class="call-intel-log">
          <div class="call-intel-head">
            <strong>${contactName}</strong>
            <span class="muted">${ts || ""}</span>
          </div>
          <div>
            <div class="call-intel-label">Message Sent Via Agent To ${contactName}</div>
            <p class="call-intel-message">${pSentMessage || "No sent message recorded."}</p>
          </div>
          <div>
            <div class="call-intel-label">Important Ideas Captured From ${contactName}</div>
            <p class="call-intel-summary">${pSummary || "No key summary captured."}</p>
            <ul class="call-intel-points">
              ${pPoints.length ? pPoints.map((p) => `<li>${p}</li>`).join("") : "<li>No key points captured.</li>"}
            </ul>
          </div>
        </div>
      `;
    })
    .join("");
}

async function pollVoiceCallOverview() {
  try {
    const out = await api("/api/chat/voice-calls/overview");
    renderCallIntelligence(out || {});
    const latest = out?.latest || null;
    if (latest?.id) {
      const statusText = String(latest.effectiveStatus || latest.status || "");
      const fp = `${latest.id}:${statusText}:${latest.updatedAt || ""}`;
      if (fp !== lastVoiceStatusFingerprint) {
        lastVoiceStatusFingerprint = fp;
        uiStatus(prettyCallStatus(statusText), latest.contactName ? `${latest.contactName}` : "", "info");
      }
    }
    const completed = out?.latestCompletedWithIntel || null;
    if (completed?.id && completed.id !== lastIntelCallId) {
      lastIntelCallId = completed.id;
      uiStatus("Call insights ready.", "Important points are available in Call Logs managed by AI Voice Agent.", "ok");
    }
  } catch {
    // Keep silent; avoid noisy status on transient poll errors.
  }
}

async function loadHistory() {
  const items = await api("/api/chat/history");
  chatLog.innerHTML = "";
  resetChatSnapshot();
  for (const m of items) {
    await addMsg(m.text, m.role === "user" ? "me" : "bot", { animate: false });
  }
}

async function processChat(text, actionChoice = "", referenceText = "") {
  pendingQueueCount += 1;
  renderQueueBadge();
  const run = async () => {
    llmPendingCount += 1;
    showThinkingBubble();
    try {
      const out = await api("/api/chat/message", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          actionChoice,
          referenceText: String(referenceText || ""),
          clientTimezone
        })
      });
      await addMsg(out.reply || "I am here for you.", "bot");
      return out;
    } finally {
      llmPendingCount = Math.max(0, llmPendingCount - 1);
      pendingQueueCount = Math.max(0, pendingQueueCount - 1);
      renderQueueBadge();
      if (llmPendingCount === 0) hideThinkingBubble();
    }
  };
  const queued = processChatQueue.then(run, run);
  processChatQueue = queued.catch(() => {});
  return queued;
}

if (dashboardBtn) {
  dashboardBtn.addEventListener("click", () => {
    uiStatus("Opening dashboard...", "Navigating.");
    window.location.href = "/dashboard";
  });
}

if (escalationBtn) {
  escalationBtn.addEventListener("click", () => {
    uiStatus("Opening Escalation Hub...", "Navigating to dedicated escalation page.");
    window.location.href = "/escalation";
  });
}

if (logoutBtn) {
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
}

if (deleteChatBtn) {
  deleteChatBtn.addEventListener("click", async () => {
    try {
      const ok = window.confirm(
        "Delete your entire chat history and related reports from backend/MongoDB? This cannot be undone."
      );
      if (!ok) return;
      uiStatus("Deleting entire chat...", "Removing records from backend and MongoDB.");
      const out = await api("/api/chat/history/all", { method: "DELETE" });
      if (out?.ok) {
        chatLog.innerHTML = "";
        resetChatSnapshot();
        emailDraft.value = "";
        telegramDraft.value = "";
        discordDraft.value = "";
        voiceCallDraft.value = "";
        clearDraftAttachmentBadges();
        sendEmailBtn.style.display = "none";
        sendTelegramBtn.style.display = "none";
        sendDiscordBtn.style.display = "none";
        sendVoiceCallBtn.style.display = "none";
        latestEmailContactIds = [];
        latestTelegramContactIds = [];
        latestDiscordChannelIds = [];
        latestVoiceCallContactId = "";
        latestProposalId = "";
        pendingChoiceBaseMessage = "";
        forcedActionChoice = "";
        setReferenceAnchor("");
        clearRecipientPicker();
        choiceBox.style.display = "none";
        meetProposalBox.style.display = "none";
        meetStatus.textContent = "";
        addMsg("Chat history deleted from backend and MongoDB.", "bot");
        uiStatus("Chat deleted.", "All chat records removed successfully.", "ok");
      } else {
        uiStatus("Delete failed.", "Unknown server response.", "error");
      }
    } catch (err) {
      uiStatus("Delete failed.", err.message, "error");
    }
  });
}

sendBtn.addEventListener("click", async () => {
  try {
    if (!message.value.trim()) return;
    if (normalizeMode(modeSelect?.value || "support_chat") !== "support_chat") {
      uiStatus(
        "Service mode active.",
        "Use the message box inside the recipient selector to prepare/send service messages.",
        "info"
      );
      return;
    }
    const text = message.value.trim();
    const referenceText = selectedReferenceText;
    addMsg(text, "me");
    message.value = "";
    setReferenceAnchor("");
    uiStatus("Sending message...", "Companion is thinking.");
    const out = await processChat(text, getEffectiveActionChoice(), referenceText);
    if (out.tips?.length) {
      tips.textContent = out.tips.join(" ");
      addMsg(`Tips: ${out.tips.join(" ")}`, "bot");
    }
    if (out.emailDraft) {
      const subj = out.emailDraft.subject || "";
      const body = out.emailDraft.body || "";
      emailDraft.value = `Subject: ${subj}\n\n${body}`;
      sendEmailBtn.style.display = "inline-block";
      latestEmailContactIds = (out.emailTargets || []).map((x) => x.id);
    } else {
      emailDraft.value = "";
      sendEmailBtn.style.display = "none";
      latestEmailContactIds = [];
    }
    if (out.emailAgentMessage && out.emailAgentMessage !== out.reply) {
      addMsg(out.emailAgentMessage, "bot");
    }
    if (out.emailClarification) {
      if (out.reply !== out.emailClarification) {
        addMsg(out.emailClarification, "alert");
      }
      forcedActionChoice = "general_mail";
    } else if (out.emailSendReady) {
      forcedActionChoice = "general_mail";
    }
    if (out.telegramAgentMessage && out.telegramAgentMessage !== out.reply) {
      addMsg(out.telegramAgentMessage, "bot");
    }
    if (out.telegramMessageDraft?.text && out.telegramSendReady && (out.telegramTargets || []).length) {
      telegramDraft.value = out.telegramMessageDraft.text;
      sendTelegramBtn.style.display = "inline-block";
      latestTelegramContactIds = (out.telegramTargets || []).map((x) => x.id);
      uiStatus("Telegram draft ready.", "Review and click Send Telegram.", "ok");
    } else {
      telegramDraft.value = "";
      sendTelegramBtn.style.display = "none";
      latestTelegramContactIds = [];
    }
    if (out.telegramClarification) {
      if (out.reply !== out.telegramClarification) {
        addMsg(out.telegramClarification, "alert");
      }
      forcedActionChoice = "telegram_message";
    } else if (out.telegramSendReady) {
      forcedActionChoice = "telegram_message";
    }
    if (out.meetSuggestion?.text) {
      addMsg(out.meetSuggestion.text, "alert");
    }
    if (out.interactionChoice?.text) {
      pendingChoiceBaseMessage = out.interactionChoice.baseMessage || text;
      choiceText.textContent = out.interactionChoice.text;
      const options = out.interactionChoice.options || [];
      const physical = options.find((x) => x.id === "physical_mail");
      const googleMeet = options.find((x) => x.id === "google_meet");
      const telegram = options.find((x) => x.id === "telegram_message");
      const discord = options.find((x) => x.id === "discord_message");
      if (physical?.label) choosePhysicalBtn.querySelector(".choice-title").textContent = physical.label;
      if (googleMeet?.label) chooseGoogleMeetBtn.querySelector(".choice-title").textContent = googleMeet.label;
      if (telegram?.label) chooseTelegramBtn.querySelector(".choice-title").textContent = telegram.label;
      if (discord?.label) chooseDiscordBtn.querySelector(".choice-title").textContent = discord.label;
      choiceBox.style.display = "block";
      uiStatus("Need your choice.", "Pick physical-mail, Telegram, Discord, or Google Meet.", "ok");
    } else {
      pendingChoiceBaseMessage = "";
      choiceBox.style.display = "none";
    }
    if (out.discordAgentMessage && out.discordAgentMessage !== out.reply) {
      addMsg(out.discordAgentMessage, "bot");
    }
    if (out.discordMessageDraft?.text && out.discordSendReady && (out.discordTargets || []).length) {
      discordDraft.value = out.discordMessageDraft.text;
      sendDiscordBtn.style.display = "inline-block";
      latestDiscordChannelIds = (out.discordTargets || []).map((x) => x.id);
      uiStatus("Discord draft ready.", "Review and click Send Discord.", "ok");
    } else {
      discordDraft.value = "";
      sendDiscordBtn.style.display = "none";
      latestDiscordChannelIds = [];
    }
    if (out.discordClarification) {
      if (out.reply !== out.discordClarification) {
        addMsg(out.discordClarification, "alert");
      }
      forcedActionChoice = "discord_message";
    } else if (out.discordSendReady) {
      forcedActionChoice = "discord_message";
    }
    if (out.voiceCallAgentMessage && out.voiceCallAgentMessage !== out.reply) {
      addMsg(out.voiceCallAgentMessage, "bot");
    }
    if (out.voiceCallDraft?.text && out.voiceCallSendReady && (out.voiceCallTargets || []).length) {
      voiceCallDraft.value = out.voiceCallDraft.text;
      sendVoiceCallBtn.style.display = "inline-block";
      latestVoiceCallContactId = out.voiceCallTargets[0]?.id || "";
      uiStatus("Voice call script ready.", "Review and click Start Voice Call.", "ok");
    } else {
      voiceCallDraft.value = "";
      sendVoiceCallBtn.style.display = "none";
      latestVoiceCallContactId = "";
    }
    if (out.voiceCallClarification) {
      if (out.reply !== out.voiceCallClarification) {
        addMsg(out.voiceCallClarification, "alert");
      }
      forcedActionChoice = "voice_call";
    } else if (out.voiceCallSendReady) {
      forcedActionChoice = "voice_call";
    }
    if (out.meetClarification) {
      if (out.reply !== out.meetClarification) {
        addMsg(out.meetClarification, "alert");
      }
      forcedActionChoice = "google_meet";
    }
    if (out.meetProposal?.proposalId) {
      latestProposalId = out.meetProposal.proposalId;
      meetProposalText.textContent = `Schedule meet with ${out.meetProposal.contact.name} on ${new Date(out.meetProposal.startAt).toLocaleString()}?`;
      meetProposalBox.style.display = "block";
      forcedActionChoice = "";
      uiStatus("Meet ready for confirmation.", "Confirm to proceed scheduling.", "ok");
    } else {
      latestProposalId = "";
      meetProposalBox.style.display = "none";
    }
    if (out.scheduledMeet?.created) {
      meetStatus.textContent = `Meet scheduled: ${out.scheduledMeet.meetLink || out.scheduledMeet.htmlLink}`;
    } else if (out.scheduledMeet?.reason) {
      meetStatus.textContent = out.scheduledMeet.reason;
    }
    if (out.crisis) {
      addMsg(`${out.crisis.trustedContactAlert} ${out.crisis.crisisBridge}`, "alert");
      uiStatus("Crisis protocol triggered.", "Immediate support guidance shown.", "error");
      return;
    }
    if (out.clearActionChoice) {
      forcedActionChoice = "";
    }
    uiStatus("Message processed.", "Response ready.", "ok");
  } catch (err) {
    uiStatus("Message failed.", err.message, "error");
  }
});

message.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

if (micBtn) {
  micBtn.addEventListener("click", () => startSpeechCapture(message));
}

if (modeSelect) {
  modeSelect.addEventListener("change", async () => {
    selectedModeChoice = String(modeSelect.value || "support_chat");
    syncModeVisualState();
    const modeLabel = modeSelect.options?.[modeSelect.selectedIndex]?.text || "General Companion";
    forcedActionChoice = "";
    choiceBox.style.display = "none";
    meetProposalBox.style.display = "none";
    pendingChoiceBaseMessage = "";
    addModeSystemBadge(modeLabel);
    try {
      await refreshRecipientDataForMode(selectedModeChoice);
      renderRecipientPickerForMode(selectedModeChoice);
    } catch {
      renderRecipientPickerForMode(selectedModeChoice);
    }
    uiStatus(`Mode switched: ${modeLabel}.`, "Send a message to continue in this mode.", "ok");
  });
}

if (openSnapshotBtn && snapshotDialog) {
  openSnapshotBtn.addEventListener("click", () => {
    if (typeof snapshotDialog.showModal === "function") snapshotDialog.showModal();
  });
}

if (closeSnapshotDialogX && snapshotDialog) {
  closeSnapshotDialogX.addEventListener("click", () => snapshotDialog.close());
}

if (snapshotDialog) {
  snapshotDialog.addEventListener("click", (ev) => {
    if (ev.target === snapshotDialog) snapshotDialog.close();
  });
}

choosePhysicalBtn.addEventListener("click", async () => {
  try {
    if (!pendingChoiceBaseMessage) return;
    uiStatus("Creating physical-meet email...", "Preparing email draft.");
    const out = await processChat(pendingChoiceBaseMessage, "physical_mail");
    forcedActionChoice = "";
    if (out.emailAgentMessage) addMsg(out.emailAgentMessage, "bot");
    if (out.emailDraft) {
      emailDraft.value = `Subject: ${out.emailDraft.subject || ""}\n\n${out.emailDraft.body || ""}`;
      sendEmailBtn.style.display = "inline-block";
    }
    choiceBox.style.display = "none";
    pendingChoiceBaseMessage = "";
    uiStatus("Physical-meet mail ready.", "Review draft and send email.", "ok");
  } catch (err) {
    uiStatus("Option handling failed.", err.message, "error");
  }
});

chooseGoogleMeetBtn.addEventListener("click", async () => {
  try {
    if (!pendingChoiceBaseMessage) return;
    uiStatus("Preparing Google Meet flow...", "Checking exact date/time/year.");
    const out = await processChat(pendingChoiceBaseMessage, "google_meet");
    forcedActionChoice = "google_meet";
    if (out.meetClarification) addMsg(out.meetClarification, "alert");
    if (out.meetProposal?.proposalId) {
      latestProposalId = out.meetProposal.proposalId;
      meetProposalText.textContent = `Schedule meet with ${out.meetProposal.contact.name} on ${new Date(out.meetProposal.startAt).toLocaleString()}?`;
      meetProposalBox.style.display = "block";
    }
    choiceBox.style.display = "none";
    pendingChoiceBaseMessage = "";
    uiStatus("Google Meet option selected.", "Provide exact date/time/year if asked.", "ok");
  } catch (err) {
    uiStatus("Option handling failed.", err.message, "error");
  }
});

chooseTelegramBtn.addEventListener("click", async () => {
  try {
    if (!pendingChoiceBaseMessage) return;
    uiStatus("Preparing Telegram draft...", "Generating message from your instruction.");
    const out = await processChat(pendingChoiceBaseMessage, "telegram_message");
    forcedActionChoice = "";
    if (out.telegramAgentMessage && out.telegramAgentMessage !== out.reply) addMsg(out.telegramAgentMessage, "bot");
    if (out.telegramClarification && out.reply !== out.telegramClarification) addMsg(out.telegramClarification, "alert");
    if (out.telegramClarification) forcedActionChoice = "telegram_message";
    if (out.telegramMessageDraft?.text && out.telegramSendReady && (out.telegramTargets || []).length) {
      telegramDraft.value = out.telegramMessageDraft.text;
      sendTelegramBtn.style.display = "inline-block";
      latestTelegramContactIds = (out.telegramTargets || []).map((x) => x.id);
      forcedActionChoice = "telegram_message";
      uiStatus("Telegram draft ready.", "Click Send Telegram to deliver.", "ok");
    } else {
      sendTelegramBtn.style.display = "none";
    }
    choiceBox.style.display = "none";
    pendingChoiceBaseMessage = "";
    if (!out.telegramClarification && !out.telegramSendReady) {
      uiStatus("Telegram draft not ready.", "Please provide more details.", "error");
    }
  } catch (err) {
    uiStatus("Option handling failed.", err.message, "error");
  }
});

chooseDiscordBtn.addEventListener("click", async () => {
  try {
    if (!pendingChoiceBaseMessage) return;
    uiStatus("Preparing Discord draft...", "Generating message from your instruction.");
    const out = await processChat(pendingChoiceBaseMessage, "discord_message");
    forcedActionChoice = "";
    if (out.discordAgentMessage && out.discordAgentMessage !== out.reply) addMsg(out.discordAgentMessage, "bot");
    if (out.discordClarification && out.reply !== out.discordClarification) addMsg(out.discordClarification, "alert");
    if (out.discordClarification) forcedActionChoice = "discord_message";
    if (out.discordMessageDraft?.text && out.discordSendReady && (out.discordTargets || []).length) {
      discordDraft.value = out.discordMessageDraft.text;
      sendDiscordBtn.style.display = "inline-block";
      latestDiscordChannelIds = (out.discordTargets || []).map((x) => x.id);
      forcedActionChoice = "discord_message";
      uiStatus("Discord draft ready.", "Click Send Discord to deliver.", "ok");
    } else {
      sendDiscordBtn.style.display = "none";
    }
    choiceBox.style.display = "none";
    pendingChoiceBaseMessage = "";
    if (!out.discordClarification && !out.discordSendReady) {
      uiStatus("Discord draft not ready.", "Please provide more details.", "error");
    }
  } catch (err) {
    uiStatus("Option handling failed.", err.message, "error");
  }
});

sendTelegramBtn.addEventListener("click", async () => {
  try {
    const contactIds =
      recipientPickerMode === "telegram_message"
        ? Array.from(selectedRecipients)
        : latestTelegramContactIds;
    const text = telegramDraft.value.trim();
    if (!contactIds.length) {
      uiStatus("No targets resolved.", "Mention contact name in message so I can target Telegram recipients.", "error");
      return;
    }
    if (!text) {
      uiStatus("No telegram draft available.", "Ask the AI to prepare a telegram draft first.", "error");
      return;
    }
    uiStatus("Sending Telegram message...", "Delivering via bot.");
    const out = await handleDispatch({
      mode: "telegram_message",
      draftedMessage: text,
      attachments: latestDispatchAttachments
    });
    if (out.dispatched?.sent) {
      addMsg(`Telegram sent to ${out.dispatched.sentCount}/${out.dispatched.total} selected contact(s).`, "bot");
      uiStatus("Telegram sent.", `Delivered to ${out.dispatched.sentCount} contact(s).`, "ok");
      sendTelegramBtn.style.display = "none";
      telegramDraft.value = "";
      latestDispatchAttachments = [];
      setDraftAttachmentBadge("telegram", 0);
      forcedActionChoice = "";
    } else {
      addMsg(`Telegram send failed: ${out.dispatched?.reason || "Unknown error"}`, "alert");
      uiStatus("Telegram send failed.", out.dispatched?.reason || "Unknown error", "error");
    }
  } catch (err) {
    uiStatus("Telegram send failed.", err.message, "error");
  }
});

sendDiscordBtn.addEventListener("click", async () => {
  try {
    const channelIds =
      recipientPickerMode === "discord_message"
        ? Array.from(selectedRecipients)
        : latestDiscordChannelIds;
    const text = discordDraft.value.trim();
    if (!channelIds.length) {
      uiStatus("No targets resolved.", "Mention Discord channel name in message so I can target channels.", "error");
      return;
    }
    if (!text) {
      uiStatus("No Discord draft available.", "Ask the AI to prepare a Discord draft first.", "error");
      return;
    }
    uiStatus("Sending Discord message...", "Delivering via webhook.");
    const out = await handleDispatch({
      mode: "discord_message",
      draftedMessage: text,
      attachments: latestDispatchAttachments
    });
    if (out.dispatched?.sent) {
      addMsg(`Discord sent to ${out.dispatched.sentCount}/${out.dispatched.total} selected channel(s).`, "bot");
      uiStatus("Discord sent.", `Delivered to ${out.dispatched.sentCount} channel(s).`, "ok");
      sendDiscordBtn.style.display = "none";
      discordDraft.value = "";
      latestDispatchAttachments = [];
      setDraftAttachmentBadge("discord", 0);
      forcedActionChoice = "";
    } else {
      addMsg(`Discord send failed: ${out.dispatched?.reason || "Unknown error"}`, "alert");
      uiStatus("Discord send failed.", out.dispatched?.reason || "Unknown error", "error");
    }
  } catch (err) {
    uiStatus("Discord send failed.", err.message, "error");
  }
});

sendVoiceCallBtn.addEventListener("click", async () => {
  try {
    const selectedIds =
      recipientPickerMode === "voice_call"
        ? Array.from(selectedRecipients)
        : latestVoiceCallContactId
        ? [latestVoiceCallContactId]
        : [];
    const text = voiceCallDraft.value.trim();
    if (!selectedIds.length) {
      uiStatus("No call contact resolved.", "Mention the contact name for the call first.", "error");
      return;
    }
    if (!text) {
      uiStatus("No voice script available.", "Ask the AI to prepare a voice call script first.", "error");
      return;
    }
    uiStatus("Starting voice call...", "Placing automated call now.");
    const out = await handleDispatch({
      mode: "voice_call",
      draftedMessage: text
    });
    if (out.dispatched?.sent) {
      addMsg(`Voice call started for ${out.dispatched.sentCount}/${out.dispatched.total} selected contact(s).`, "bot");
      uiStatus("Voice call started.", "Calls are in progress via Twilio.", "ok");
      sendVoiceCallBtn.style.display = "none";
      voiceCallDraft.value = "";
      latestDispatchAttachments = [];
      setDraftAttachmentBadge("voice", 0);
      latestVoiceCallContactId = "";
      forcedActionChoice = "";
    } else {
      addMsg(`Voice call failed: ${out.dispatched?.reason || "Unknown error"}`, "alert");
      uiStatus("Voice call failed.", out.dispatched?.reason || "Unknown error", "error");
    }
  } catch (err) {
    uiStatus("Voice call failed.", err.message, "error");
  }
});

sendEmailBtn.addEventListener("click", async () => {
  try {
    const contactIds =
      recipientPickerMode === "general_mail" || recipientPickerMode === "physical_mail"
        ? Array.from(selectedRecipients)
        : latestEmailContactIds;
    if (!contactIds.length) {
      uiStatus("No targets resolved.", "Mention contact name in message so I can target email recipients.", "error");
      return;
    }
    const { subject, body } = parseEmailDraftText(emailDraft.value);
    if (!subject || !body) {
      uiStatus("Draft incomplete.", "Add Subject and Body in the email draft.", "error");
      return;
    }
    uiStatus("Sending email...", "Dispatching from your Gmail account.");
    const out = await handleDispatch({
      mode: "general_mail",
      draftedMessage: `${subject}\n\n${body}`,
      subject,
      body,
      attachments: latestDispatchAttachments
    });
    if (out.dispatched?.sent) {
      addMsg(`Email sent to ${contactIds.length} selected contact(s) from your Gmail.`, "bot");
      uiStatus("Email sent.", "Message delivered from your Gmail account.", "ok");
      sendEmailBtn.style.display = "none";
      latestDispatchAttachments = [];
    } else {
      addMsg(`Email send failed: ${out.dispatched?.reason || "Unknown error"}`, "alert");
      uiStatus("Email send failed.", out.dispatched?.reason || "Unknown error", "error");
    }
  } catch (err) {
    uiStatus("Email send failed.", err.message, "error");
  }
});

confirmMeetBtn.addEventListener("click", async () => {
  try {
    if (!latestProposalId) return;
    uiStatus("Confirming meet...", "Scheduling event and sending confirmations.");
    const out = await api("/api/chat/confirm-meet", {
      method: "POST",
      body: JSON.stringify({ proposalId: latestProposalId, confirm: true, clientTimezone })
    });
    if (out.confirmed) {
      meetStatus.textContent = `Meet scheduled: ${out.event.meetLink || out.event.htmlLink}`;
      addMsg("Meet confirmed and calendars/emails updated.", "bot");
      uiStatus("Meet confirmed.", "Calendar and email confirmations sent.", "ok");
      meetProposalBox.style.display = "none";
      latestProposalId = "";
      forcedActionChoice = "";
    }
  } catch (err) {
    uiStatus("Meet confirmation failed.", err.message, "error");
  }
});

cancelMeetBtn.addEventListener("click", async () => {
  try {
    if (!latestProposalId) return;
    await api("/api/chat/confirm-meet", {
      method: "POST",
      body: JSON.stringify({ proposalId: latestProposalId, confirm: false })
    });
    meetProposalBox.style.display = "none";
    latestProposalId = "";
    forcedActionChoice = "";
    uiStatus("Meet cancelled.", "Proposal discarded.", "ok");
  } catch (err) {
    uiStatus("Meet cancel failed.", err.message, "error");
  }
});

(async function init() {
  const user = await requireSession();
  if (!user) return;
  currentUserName = String(user?.name || "You");
  resetChatSnapshot();
  if (modeSelect) {
    modeSelect.value = "support_chat";
    selectedModeChoice = String(modeSelect.value || "support_chat");
    forcedActionChoice = "";
    syncModeVisualState();
    const initialModeLabel = modeSelect.options?.[modeSelect.selectedIndex]?.text || "General Companion";
    addModeSystemBadge(initialModeLabel);
    uiStatus(`Mode switched: ${initialModeLabel}.`, "Default mode enabled after login.", "ok");
  }
  setupDraftTabs();
  setupCopyButtons();
  initSelectionReferenceUi();
  addMsg(`Hi ${user.name}, I am here to support you.`, "bot");
  try {
    uiStatus("Loading chat page...", "Fetching contacts.");
    await Promise.all([loadContacts(), loadDiscordChannels(), loadHistory()]);
    renderRecipientPickerForMode("support_chat");
    await pollVoiceCallOverview();
    if (voiceCallPollTimer) clearInterval(voiceCallPollTimer);
    voiceCallPollTimer = setInterval(pollVoiceCallOverview, 1600);
    uiStatus("Chat ready.", "You can start messaging.", "ok");
  } catch (err) {
    uiStatus("Chat initialization failed.", err.message, "error");
  }
})();

window.addEventListener("beforeunload", () => {
  if (voiceCallPollTimer) clearInterval(voiceCallPollTimer);
});

if (clearCallIntelBtn) {
  clearCallIntelBtn.addEventListener("click", async () => {
    try {
      const ok = window.confirm("Are you sure you want to delete all call intelligence logs? This cannot be undone.");
      if (!ok) {
        uiStatus("Deletion cancelled.", "Call intelligence logs were not removed.", "info");
        return;
      }
      uiStatus("Deleting call intelligence logs...", "Removing logs from UI and backend.");
      const out = await api("/api/chat/voice-calls/logs", { method: "DELETE" });
      if (!out?.ok) throw new Error("Failed to delete call logs.");
      callIntelBox.innerHTML = '<p class="muted">No call logs yet. New AI voice-agent logs will appear after completed calls.</p>';
      uiStatus("Call intelligence logs deleted.", `Deleted ${Number(out.deletedCount || 0)} log(s).`, "ok");
    } catch (err) {
      uiStatus("Delete failed.", err?.message || "Unable to delete call logs.", "error");
    }
  });
}
