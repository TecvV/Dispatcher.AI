import { VoiceRelayCall } from "../models/VoiceRelayCall.js";
import { Contact } from "../models/Contact.js";
import { User } from "../models/User.js";
import { summarizeVoiceCallContactInsights } from "./llm.js";

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s) {
  const stop = new Set([
    "the", "and", "for", "with", "from", "that", "this", "have", "has", "had", "will", "would", "could", "should",
    "can", "cannot", "cant", "not", "you", "your", "yours", "they", "them", "their", "there", "here", "been", "being",
    "are", "was", "were", "is", "am", "be", "to", "of", "in", "on", "at", "as", "it", "its", "or", "if", "so", "do",
    "did", "done", "a", "an", "i", "we", "he", "she", "his", "her", "our", "us", "me", "my"
  ]);
  const out = new Set();
  for (const w of normalizeText(s).split(" ")) {
    if (!w || w.length < 3 || stop.has(w)) continue;
    out.add(w);
  }
  return out;
}

function overlapScore(baseTokens, candidateText) {
  if (!baseTokens || !baseTokens.size) return 0;
  const c = tokenSet(candidateText);
  if (!c.size) return 0;
  let inter = 0;
  for (const w of c) if (baseTokens.has(w)) inter += 1;
  return inter / Math.max(1, c.size);
}

function heuristicCallerInsights(callerTurns = []) {
  const cleaned = callerTurns
    .map((t) => String(t?.text || "").replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 6);
  if (!cleaned.length) {
    return { summary: "", keyPoints: [] };
  }
  const unique = [];
  const seen = new Set();
  for (const line of cleaned) {
    const k = line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(line);
    if (unique.length >= 8) break;
  }
  const keyPoints = unique.slice(0, 5).map((x) => `Contact said: ${x}`);
  const summarySeed = unique.slice(0, 2).join(" ");
  const summary = summarySeed
    ? `Contact shared important points: ${summarySeed}`.slice(0, 220)
    : "";
  return { summary, keyPoints };
}

export async function maybeExtractVoiceCallIntelligence(relayCallId, options = {}) {
  const force = Boolean(options?.force);
  const id = String(relayCallId || "").trim();
  if (!id) return { ok: false, reason: "missing_call_id" };
  const call = await VoiceRelayCall.findById(id).lean();
  if (!call?._id) return { ok: false, reason: "call_not_found" };
  if (call.intelligenceExtractedAt && !force) {
    return {
      ok: true,
      extracted: false,
      summary: String(call.intelligenceSummary || ""),
      keyPoints: Array.isArray(call.intelligenceKeyPoints) ? call.intelligenceKeyPoints : []
    };
  }
  const callerTurns = Array.isArray(call.turns)
    ? call.turns.filter((t) => String(t?.role || "") === "caller" && String(t?.text || "").trim())
    : [];
  if (!callerTurns.length) {
    await VoiceRelayCall.findByIdAndUpdate(id, {
      $set: {
        intelligenceSummary: "",
        intelligenceKeyPoints: [],
        intelligenceExtractedAt: new Date()
      }
    });
    return { ok: true, extracted: false, summary: "", keyPoints: [] };
  }

  const [contact, user] = await Promise.all([
    Contact.findById(call.contactId).lean(),
    User.findById(call.userId).lean()
  ]);

  const extracted = await summarizeVoiceCallContactInsights({
    relayMessage: String(call.message || ""),
    userName: String(user?.name || ""),
    contactName: String(contact?.name || ""),
    turns: call.turns || []
  });

  const callerCorpus = callerTurns.map((t) => String(t?.text || "")).join(" ");
  const callerTokens = tokenSet(callerCorpus);
  let summary = String(extracted?.summary || "").trim();
  let keyPoints = Array.isArray(extracted?.keyPoints)
    ? extracted.keyPoints.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  // Strict caller-only filter: keep only points grounded in contact's own utterances.
  keyPoints = keyPoints.filter((p) => overlapScore(callerTokens, p) >= 0.22);

  // If model summary is not grounded in caller text, replace with a grounded summary.
  if (summary && overlapScore(callerTokens, summary) < 0.2) {
    summary = "";
  }

  if (!summary && !keyPoints.length) {
    const heuristic = heuristicCallerInsights(callerTurns);
    summary = String(heuristic.summary || "").trim();
    keyPoints = Array.isArray(heuristic.keyPoints) ? heuristic.keyPoints : [];
  } else if (!summary && keyPoints.length) {
    summary = `Contact shared: ${keyPoints.slice(0, 2).map((x) => x.replace(/^Contact said:\s*/i, "")).join(" ")}`.slice(0, 220);
  }

  await VoiceRelayCall.findByIdAndUpdate(id, {
    $set: {
      intelligenceSummary: summary,
      intelligenceKeyPoints: keyPoints,
      intelligenceExtractedAt: new Date()
    }
  });

  return { ok: true, extracted: true, summary, keyPoints };
}

export function normalizeCallStatus(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (!s) return "queued";
  if (["initiated", "queued", "dialing"].includes(s)) return "dialing";
  if (["ringing"].includes(s)) return "ringing";
  if (["answered", "in-progress", "in_progress", "streaming"].includes(s)) return "in_progress";
  if (["busy", "rejected"].includes(s)) return "rejected";
  if (["no-answer", "no_answer", "not_picked", "not-picked"].includes(s)) return "no_pickup";
  if (["canceled", "cancelled"].includes(s)) return "cancelled";
  if (["failed"].includes(s)) return "failed";
  if (["completed", "disconnected", "ended"].includes(s)) return "completed";
  return s;
}
