import { StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { fetchMem0Context, addMem0Memory } from "./mem0Service.js";
import { env } from "../config/env.js";
import { triageWithLLM } from "./llm.js";

function model() {
  return new ChatOpenAI({
    model: env.groqModel,
    temperature: 0.35,
    configuration: {
      apiKey: env.groqApiKey,
      baseURL: "https://api.groq.com/openai/v1"
    }
  });
}

function buildMemoryText(items) {
  if (!items.length) return "none";
  return items
    .slice(0, 8)
    .map((m, i) => `${i + 1}. ${typeof m === "string" ? m : m.memory || m.text || JSON.stringify(m)}`)
    .join("\n")
    .slice(0, 2500);
}

const graph = new StateGraph({
  channels: {
    userId: { value: (x, y) => y ?? x, default: () => "" },
    userName: { value: (x, y) => y ?? x, default: () => "friend" },
    message: { value: (x, y) => y ?? x, default: () => "" },
    sleepHours: { value: (x, y) => y ?? x, default: () => null },
    emergencyAction: { value: (x, y) => y ?? x, default: () => null },
    triage: { value: (x, y) => y ?? x, default: () => ({ isCrisis: false, isAnxious: false, needs: [], crisisAction: "none" }) },
    pendingCrisis: { value: (x, y) => y ?? x, default: () => ({ awaitingConfirmation: false, triggerText: "" }) },
    crisisContactName: { value: (x, y) => y ?? x, default: () => "your trusted contact" },
    crisisDecision: { value: (x, y) => y ?? x, default: () => ({ action: "none", reason: "" }) },
    crisisResult: { value: (x, y) => y ?? x, default: () => null },
    contacts: { value: (x, y) => y ?? x, default: () => [] },
    discordChannels: { value: (x, y) => y ?? x, default: () => [] },
    memoryEnabled: { value: (x, y) => y ?? x, default: () => true },
    memory: { value: (x, y) => y ?? x, default: () => [] },
    reply: { value: (x, y) => y ?? x, default: () => "" }
  }
})
  .addNode("triage_node", async (state) => {
    const t = await triageWithLLM({
      message: state.message,
      recentContext: ""
    });
    return {
      triage: {
        isCrisis: Boolean(t.is_crisis),
        isAnxious: Boolean(t.is_anxious),
        needs: Array.isArray(t.needs) ? t.needs : [],
        crisisAction: t.crisis_action || "none",
        emotion: t.emotion || "neutral"
      }
    };
  })
  .addNode("crisis_gate_node", async (state) => {
    if (state.triage.isCrisis || state.triage.crisisAction === "trigger_now") {
      return {
        crisisDecision: { action: "trigger_alert", reason: "automatic_crisis_alert" },
        reply: "I have just notified your emergency contact. They are on their way to support you. Stay with me and take one slow breath in, then out."
      };
    }

    return { crisisDecision: { action: "none", reason: "no_crisis_gate" } };
  })
  .addNode("memory_fetch_node", async (state) => {
    if (!state.memoryEnabled) return { memory: [] };
    const memory = await fetchMem0Context({
      userId: state.userId,
      query: state.message
    });
    return { memory };
  })
  .addNode("support_node", async (state) => {
    if (state.triage.isCrisis) {
      return {
        reply:
          "I am really glad you reached out. You may be in immediate danger, so please contact your local emergency services now. In the US/Canada call or text 988. If you want, I can stay with you while you reach out."
      };
    }

    const toneHint =
      typeof state.sleepHours === "number" && state.sleepHours < 5
        ? "User may be sleep deprived; keep response gentle and low-pressure."
        : "Keep response practical and empathetic.";
    const breathingPrefix = state.triage.isAnxious
      ? "Before anything else, guide a 5-minute breathing reset in 2-3 short steps, then continue."
      : "";
    const context = buildMemoryText(state.memory || []);
    const contactsText = Array.isArray(state.contacts) && state.contacts.length
      ? state.contacts
          .slice(0, 30)
          .map((c) => `${c.name} (${c.type})`)
          .join(", ")
      : "none";
    const discordChannelsText = Array.isArray(state.discordChannels) && state.discordChannels.length
      ? state.discordChannels
          .slice(0, 40)
          .map((c) => c.name)
          .join(", ")
      : "none";

    const llm = model();
    const out = await llm.invoke([
      {
        role: "system",
        content:
          "You are a compassionate mental wellness assistant for women. Distinguish between physical meet email and Google Meet scheduling. If user intent is unclear, ask them to choose. Never diagnose medically. You do have access to the user's in-app saved contacts and Discord channels provided below; do not claim you cannot access them."
      },
      {
        role: "system",
        content: `${toneHint} ${breathingPrefix} Long-term memory context:\n${context}\n\nSaved contacts (name/type): ${contactsText}\nSaved Discord channels: ${discordChannelsText}`
      },
      {
        role: "user",
        content: `User name: ${state.userName}\nMessage: ${state.message}`
      }
    ]);

    return { reply: String(out.content || "").trim() };
  })
  .addNode("crisis_action_node", async (state) => {
    if (state.crisisDecision?.action !== "trigger_alert") return {};
    if (typeof state.emergencyAction !== "function") {
      return { crisisResult: { ok: false, reason: "emergency_action_missing" } };
    }
    const result = await state.emergencyAction();
    return { crisisResult: result || { ok: false, reason: "no_result" } };
  })
  .addNode("memory_write_node", async (state) => {
    if (!state.memoryEnabled) return {};
    const triage = state.triage || {};
    const needs = Array.isArray(triage.needs) ? triage.needs : [];
    const emotion = String(triage.emotion || "neutral").toLowerCase();
    const isImportantHealthUpdate =
      triage.isCrisis === true ||
      triage.isAnxious === true ||
      needs.length > 0 ||
      emotion === "distressed" ||
      emotion === "uplifted";

    if (!isImportantHealthUpdate) return {};

    const healthMemoryLine = `Health status update | emotion=${emotion} | needs=${needs.join(",") || "none"} | message="${state.message}"`;
    await addMem0Memory({
      userId: state.userId,
      text: healthMemoryLine
    });
    return {};
  })
  .addEdge("__start__", "triage_node")
  .addEdge("triage_node", "crisis_gate_node")
  .addConditionalEdges(
    "crisis_gate_node",
    (state) => {
      const action = state.crisisDecision?.action || "none";
      if (action === "trigger_alert") return "crisis_action_node";
      return "memory_fetch_node";
    },
    {
      crisis_action_node: "crisis_action_node",
      memory_fetch_node: "memory_fetch_node",
      memory_write_node: "memory_write_node"
    }
  )
  .addEdge("memory_fetch_node", "support_node")
  .addEdge("crisis_action_node", "memory_write_node")
  .addEdge("support_node", "memory_write_node")
  .addEdge("memory_write_node", "__end__")
  .compile();

export async function runSupportGraph({
  userId,
  userName,
  message,
  sleepHours,
  pendingCrisis,
  crisisContactName,
  emergencyAction,
  memoryEnabled = true,
  contacts = [],
  discordChannels = []
}) {
  const out = await graph.invoke({
    userId: String(userId),
    userName: userName || "friend",
    message,
    sleepHours: typeof sleepHours === "number" ? sleepHours : null,
    pendingCrisis: pendingCrisis || { awaitingConfirmation: false, triggerText: "" },
    crisisContactName: crisisContactName || "your trusted contact",
    emergencyAction,
    memoryEnabled: Boolean(memoryEnabled),
    contacts: Array.isArray(contacts) ? contacts.map((c) => ({ name: c.name, type: c.type })) : [],
    discordChannels: Array.isArray(discordChannels) ? discordChannels.map((c) => ({ name: c.name })) : []
  });
  return {
    reply: out.reply || "I am here with you.",
    triage: out.triage || { isCrisis: false, isAnxious: false, needs: [], crisisAction: "none" },
    crisisDecision: out.crisisDecision || { action: "none", reason: "" },
    crisisResult: out.crisisResult || null
  };
}
