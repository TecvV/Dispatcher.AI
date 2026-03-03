import { env } from "../config/env.js";

// ─── Core Groq caller ────────────────────────────────────────────────────────

async function callGroq(messages, temperature = 0.3) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.groqApiKey}`
    },
    body: JSON.stringify({
      model: env.groqModel,
      messages,
      temperature
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      const text = String(raw || "");
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(text.slice(start, end + 1));
      }
    } catch {
      // ignore
    }
    return fallback;
  }
}

function trimText(s, n = 700) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}...` : t;
}

function normalizeThirdPersonLead({ text, senderName = "", recipientName = "" }) {
  let out = String(text || "").trim();
  if (!out) return out;
  const esc = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const s = esc(senderName);
  const r = esc(recipientName);
  if (s && r) {
    // "Aryan informs Arya that ..." -> "Aryan ..."
    out = out.replace(
      new RegExp(`^\\s*${s}\\s+(?:informs?|would\\s+like\\s+to\\s+inform|wants\\s+to\\s+inform|is\\s+informing)\\s+${r}\\s+that\\s+`, "i"),
      `${senderName} `
    );
  }
  if (s) {
    // "Aryan informs that ..." -> "Aryan ..."
    out = out.replace(
      new RegExp(`^\\s*${s}\\s+(?:informs?|would\\s+like\\s+to\\s+inform|wants\\s+to\\s+inform|is\\s+informing)\\s+that\\s+`, "i"),
      `${senderName} `
    );
  }
  // Generic fallback: "informs X that" -> ""
  out = out.replace(/\b(?:informs?|would\s+like\s+to\s+inform|wants\s+to\s+inform|is\s+informing)\b\s*(?:[A-Z][\w .'-]{0,40}\s+)?that\s+/i, "");
  return out.trim();
}

function enforceContactToneGuard({
  text,
  recipientType,
  mode,
  familyGreetingStyle = "auto",
  senderName = "",
  recipientName = "",
  forceFormal = false
}) {
  // Fully LLM-driven output: no local tone/style rewrites.
  return String(text || "").trim();
}
function asContextMessages(memoryMessages = []) {
  return memoryMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: trimText(m.text, 700)
    }));
}

// ─── ROUTING ──────────────────────────────────────────────────────────────────

/**
 * PRIMARY intent classifier. Authoritative routing decision.
 * support_chat is the DEFAULT — all other intents require explicit evidence.
 */
export async function classifyRoutingIntent({ message, recentContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `You are a strict intent classifier for a mental wellness assistant app.

Return ONLY strict JSON — no markdown, no extra text:
{"intent":"support_chat|general_mail|physical_mail|google_meet|telegram_message|discord_message|voice_call|relay_message|ambiguous_meet|history_question|crisis","confidence":0..1,"asks_human":boolean,"distress_level":"low|moderate|high","needs":["sleep|grief|anxiety|career_stress|low_mood|postpartum_anxiety"],"reason":"short"}

CLASSIFICATION RULES (follow strictly):

DEFAULT = support_chat. Use support_chat for EVERYTHING that does not match a specific rule below.

support_chat REQUIRED for:
- ANY greeting: "hi", "hello", "hey", "good morning", "what's up", "sup", "howdy"
- Questions about the assistant: "what is your name?", "who are you?", "what can you do?", "are you an AI?", "introduce yourself"
- General conversation and small talk
- Wellness/health/mental health questions and advice
- Emotional venting and support
- Vague or ambiguous messages
- Anything not explicitly about sending a message or scheduling

general_mail: ONLY when message contains words like "send email", "draft email", "email [name]", "write an email to", "mail [name]"
physical_mail: ONLY for explicit in-person appointment email requests
telegram_message: ONLY when "telegram", "send message to [name]", "message [name] on telegram" is explicit
discord_message: ONLY when "discord", "post to [channel]" is explicit
voice_call: when user explicitly asks to call someone or place/make a phone call (examples: "I want to make a call", "call my doctor", "place a call to Arya", "start a voice call"), including when message content is provided for relay
google_meet: ONLY for "schedule a google meet", "video call", "virtual meeting", "book a meet"
ambiguous_meet: user wants meeting but physical vs virtual unclear
history_question: questions about past conversation frequency: "how many times did I...", "have I mentioned..."
crisis: explicit self-harm, suicide, or acute danger language

NOTE: When user explicitly requests MULTIPLE communication actions at once (e.g. "send both email AND telegram", "message via mail and telegram", "send to all contacts by email and telegram"), classify as general_mail (the system will detect the multi-action separately). Do not try to collapse these into a single intent — the downstream planner handles multi-action routing.

RULE: For operational intents (mail/telegram/discord/voice_call/google_meet), set distress_level="low" unless explicit emotional danger exists.
RULE: Confidence should be 1.0 for obvious support_chat cases (greetings, assistant questions).`
      },
      {
        role: "user",
        content: `Recent context:\n${recentContext || "none"}\n\nCurrent message:\n${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    intent: "support_chat",
    confidence: 1.0,
    asks_human: false,
    distress_level: "low",
    needs: [],
    reason: "fallback_to_support_chat"
  });
}

/**
 * SECONDARY fallback classifier. ONLY consulted when primary returns support_chat
 * AND confidence < 0.85. Has strict instructions to not fire on conversational messages.
 */
export async function inferOperationalMode({ message, recentContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Secondary classifier: determine if a message is an explicit operational communication request.

Return ONLY strict JSON: {"mode":"none|general_mail|physical_mail|google_meet|telegram_message|discord_message|voice_call","confidence":0..1,"reason":"short"}

ABSOLUTE RULES:
- Greetings ("hi", "hello", "hey", "good morning", etc.) → mode="none", confidence=1.0. ALWAYS.
- Questions about the assistant ("what is your name?", "who are you?", etc.) → mode="none", confidence=1.0. ALWAYS.
- General conversation, health questions, emotional messages → mode="none".
- Return a non-"none" mode ONLY when message contains an EXPLICIT action request: "send", "email", "draft", "schedule", "message [name] on telegram/discord", or "call/make a call/place a call/start a voice call".
- A contact name or channel name alone is NOT enough — an explicit action verb must be present.
- If in ANY doubt → mode="none".`
      },
      {
        role: "user",
        content: `Recent context:\n${recentContext || "none"}\n\nMessage:\n${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    mode: "none",
    confidence: 0,
    reason: "fallback_parse_error"
  });
}

export async function classifyPendingWorkflowControl({ message, recentContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Classify whether the user wants to continue or cancel/pause an in-progress workflow.

Return ONLY strict JSON: {"action":"continue|cancel|unknown","reason":"short"}

Rules:
- Return action="cancel" ONLY when the user explicitly asks to stop/pause/cancel the current workflow right now.
- If user is providing details/content for the requested workflow, return action="continue" (even if they mention time phrases like "today", "later", "other day").
- Do NOT infer cancellation from message topic alone. Example: "I can't come today, I will come some other day" is workflow content, not cancellation.
- Greetings/general chat without explicit cancel intent -> action="unknown".`
      },
      {
        role: "user",
        content: `Recent context:\n${recentContext || "none"}\n\nMessage:\n${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    action: "unknown",
    reason: "fallback_parse_error"
  });
}

export async function classifyConversationTurn({ message, recentContext, hasPendingClarification, pendingActions }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Classify the user's current turn semantically for workflow handling.

Return ONLY strict JSON:
{"kind":"general_chat|workflow_continuation|operational_switch|cancel","reason":"short"}

Definitions:
- general_chat: user is chatting casually, asking general assistant questions, or wellness discussion.
- workflow_continuation: user is answering details for an in-progress workflow (recipient/message/date/time/etc), including pronoun follow-ups like "send her a message".
- operational_switch: user is explicitly asking to switch to another operational task (email/telegram/discord/meet/call) now.
- cancel: user clearly asks to pause/cancel/stop current workflow.

Rules:
- Use semantic meaning only. Do not rely on literal keyword matching.
- If hasPendingClarification=true, prefer workflow_continuation unless the user clearly indicates general_chat or cancel.
- A short question can still be workflow_continuation when it refers to sending/scheduling in context.
- If uncertain and hasPendingClarification=true, return workflow_continuation.
- If uncertain and hasPendingClarification=false, return general_chat.`
      },
      {
        role: "user",
        content: `Has pending clarification: ${Boolean(hasPendingClarification)}\nPending actions: ${Array.isArray(pendingActions) ? pendingActions.join(", ") : "none"}\n\nRecent context:\n${recentContext || "none"}\n\nMessage:\n${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    kind: hasPendingClarification ? "workflow_continuation" : "general_chat",
    reason: "fallback_parse_error"
  });
}

export async function classifyDirectoryRequest({ message, recentContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Detect if user is asking to view/list items already saved in-app (contacts/channels).

Return ONLY strict JSON: {"action":"none|list_contacts|list_channels|list_both","include_telegram_chat_ids":boolean,"include_discord_webhooks":boolean,"reason":"short"}

Rules:
- Use semantics and recent context. Handle indirect follow-ups and pronouns.
- Examples → list intent: "who all are available in telegram", "show my contacts", "list what I added", "show channel webhooks", "give me the names"
- Set include_telegram_chat_ids=true when user asks for IDs/details.
- Set include_discord_webhooks=true when user asks for webhook details/URLs.
- Greetings, general questions, send requests → action="none".`
      },
      {
        role: "user",
        content: `Recent context:\n${recentContext || "none"}\n\nMessage:\n${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    action: "none",
    include_telegram_chat_ids: false,
    include_discord_webhooks: false,
    reason: "fallback_parse_error"
  });
}

export async function classifyDirectoryRequestSecondary({ message, recentContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Second-pass detector for in-app list access.

Return ONLY strict JSON: {"action":"none|list_contacts|list_channels|list_both","reason":"short"}

Choose list_* when user is asking to see what they previously added/saved in app.
Greetings and general messages → action="none".`
      },
      {
        role: "user",
        content: `Recent context:\n${recentContext || "none"}\n\nMessage:\n${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    action: "none",
    reason: "fallback_parse_error"
  });
}

// ─── CRISIS ───────────────────────────────────────────────────────────────────

export async function triageWithLLM({ message, recentContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Safety triage classifier for a mental-health support app.

Return ONLY strict JSON: {"is_crisis":boolean,"is_anxious":boolean,"needs":["sleep|grief|anxiety|career_stress|low_mood|postpartum_anxiety"],"emotion":"crisis|distressed|neutral|uplifted","crisis_action":"none|ask_confirmation|trigger_now"}

Rules:
- Use semantic meaning, not keywords.
- If user implies self-harm/suicide intent, hopeless finality, or inability to stay safe -> is_crisis=true.
- crisis_action="trigger_now" for acute danger: "I am going to end my life", "I cannot stay safe".
- crisis_action="ask_confirmation" for high-risk but less explicit statements.
- Greetings and small talk -> is_crisis=false, is_anxious=false, emotion="neutral", crisis_action="none".
- Analytical/report/list requests (for example: "summarize my mood in last 24 hours", "show health summary", "list channels/contacts") are NOT distress. Set is_crisis=false, is_anxious=false, emotion="neutral", crisis_action="none".
- Operational assistant requests (for example: "send a mail", "send telegram", "post on discord", "schedule meet", "make a call") are NOT distress by themselves. Set is_crisis=false, is_anxious=false, emotion="neutral", crisis_action="none" unless user explicitly expresses emotional danger.`
      },
      {
        role: "user",
        content: `Recent context:\n${recentContext || "none"}\n\nMessage:\n${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    is_crisis: false,
    is_anxious: false,
    needs: [],
    emotion: "neutral",
    crisis_action: "none"
  });
}
export async function classifyCrisisConfirmation({ message, pendingContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Classify if user is confirming emergency outreach right now.

Return ONLY strict JSON: {"decision":"confirm|deny|unclear","confidence":0..1,"reason":"short"}

Use meaning, not exact words.`
      },
      {
        role: "user",
        content: `Pending context:\n${pendingContext || "none"}\n\nUser message:\n${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    decision: "unclear",
    confidence: 0,
    reason: "fallback_parse_error"
  });
}

export async function buildCrisisBroadcast({ userName, message }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Create one crisis alert package from user text for trusted contacts.

Return ONLY strict JSON:
{
  "crisis_type":"extreme_distress|suicidal_thoughts|immediate_danger|self_harm_risk|panic_breakdown|fear_or_lonely_distress|unknown",
  "subject":"...",
  "message":"..."
}

Rules:
- Judge crisis type from semantic meaning and intent, not keyword matching.
- Distinguish fear/loneliness distress when user indicates intense fear, feeling unsafe due to fear, or severe loneliness/isolation distress without explicit self-harm intent.
- Message must be concise, urgent, and action-oriented.
- Mention that this is auto-generated and recipient should contact user immediately.
- Do not include diagnosis.`
      },
      {
        role: "user",
        content: `User name: ${userName || "someone"}\nUser text: ${message || ""}`
      }
    ],
    0.1
  );

  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    const crisisType = String(parsed.crisis_type || "unknown").trim() || "unknown";
    const subject = String(parsed.subject || "").trim() || "Urgent crisis support needed";
    const msg = String(parsed.message || "").trim();
    if (msg) {
      return {
        crisisType,
        subject,
        message: msg
      };
    }
  }

  const fallbackName = userName || "the user";
  return {
    crisisType: "unknown",
    subject: "Urgent crisis support needed",
    message: `${fallbackName} may be in immediate emotional danger and needs urgent support right now. Please contact them immediately. This is an auto-generated crisis alert from Wellness Bot.`
  };
}

// ─── SUPPORT CHAT ─────────────────────────────────────────────────────────────

export async function generateSupportReply({ userName, message, memoryMessages, sleepHours, pendingIntentInfo }) {
  if (pendingIntentInfo && Array.isArray(pendingIntentInfo.missing_fields) && pendingIntentInfo.missing_fields.length > 0) {
    const missing = pendingIntentInfo.missing_fields.join(" and ");
    return callGroq(
      [
        {
          role: "system",
          content: "You are a helpful assistant. Ask only for the missing details. Be concise."
        },
        {
          role: "user",
          content: `Missing fields: ${missing}. Ask user for these details politely.`
        }
      ],
      0.2
    );
  }

  const toneHint =
    typeof sleepHours === "number" && sleepHours < 5
      ? "User likely sleep-deprived. Keep tone extra gentle and low-pressure."
      : "Use an empathetic, action-oriented tone.";

  return callGroq(
    [
      {
        role: "system",
        content: `You are Meera (Personalized AI Support Agent), the compassionate companion AI inside Dispatcher.AI.

Your capabilities (tell users about these when asked):
- Send emails to saved contacts
- Send Telegram messages to saved contacts
- Send Discord messages to saved channels
- Schedule Google Meet with saved contacts
- Provide mental wellness support, health tips, and emotional support
- Manage contacts and channels

Emotional-intelligence behavior requirements:
- First understand emotion and intent from context before suggesting actions.
- Reflect the user feeling in one short line ("It sounds like...", "I hear that...") without exaggeration.
- Keep tone warm, calm, human, and non-judgmental.
- Ask at most one gentle follow-up question when needed.
- Do not label neutral queries as distress.
- For normal informational requests, answer directly without safety overreaction.
- Give practical, low-pressure next steps.

When user greets you ("hi", "hello", etc.): greet warmly and briefly introduce yourself.
When user asks your name: say your name is Meera (Personalized AI Support Agent).
When user asks what you can do: briefly list your capabilities above.
For health/wellness questions: provide helpful, empathetic advice.
For emotional support: listen, validate, and gently guide.
For ambiguous operational requests: ask user to clarify what they'd like to send and to whom.
Do NOT fabricate any send/schedule actions from casual conversation.

${toneHint}`
      },
      ...asContextMessages(memoryMessages || []),
      {
        role: "user",
        content: `User name: ${userName || "friend"}\nMessage: ${message}`
      }
    ],
    0.4
  );
}

// ─── CONTEXT RESOLUTION ───────────────────────────────────────────────────────

/**
 * Resolves which contacts/channels the user refers to and what the message payload is.
 * Returns EMPTY arrays for non-operational messages (greetings, chat, etc.)
 */
export async function resolveTargetAndMessage({ message, memoryMessages, contacts, channels }) {
  const historyText = (memoryMessages || [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const contactList = (contacts || []).map((c) => ({ id: String(c._id), name: c.name, type: c.type || "unknown" }));
  const channelList = (channels || []).map((c) => ({ id: String(c._id), name: c.name }));

  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Context resolution engine for a wellness routing agent.

YOUR JOB:
1. Identify which contact(s) or channel(s) the user is addressing — ONLY for explicit send/schedule requests.
2. Identify the actual message payload — ONLY if one is provided.
3. Detect if user is asking to LIST their saved contacts/channels.

CRITICAL RULES:
- For greetings ("hi", "hello", "hey"), general questions, casual conversation, wellness questions → return EMPTY resolvedContactIds=[], EMPTY resolvedChannelIds=[], actualMessageToSend=null. ALWAYS. Do NOT resolve contacts for non-operational messages.
- Only resolve contacts/channels when message contains a clear explicit send/email/telegram/discord/schedule/call directive WITH a target.
- Match contacts by role ("my doctor" → type=doctor), name, or pronoun from history.
- If no contact matches the requested role → return empty resolvedContactIds.
- If user replies with only a name or "all" → actualMessageToSend=null, resolve contact IDs.
- IMPORTANT: If user says "all of them", "all", "both", "everyone", "all contacts" in the context of scheduling a meet or sending a message → resolvedContactIds must contain ALL available contact IDs. Do not ask which one — resolve all of them.
- Never invent IDs or names outside the provided lists.

Available Contacts: ${JSON.stringify(contactList)}
Available Channels: ${JSON.stringify(channelList)}

Return ONLY strict JSON:
{
  "resolvedContactIds": [],
  "resolvedChannelIds": [],
  "requestedContactRoles": [],
  "actualMessageToSend": null,
  "directoryAction": "none|list_contacts|list_channels|list_both",
  "includeTelegramChatIds": false,
  "includeDiscordWebhooks": false,
  "reasoning": "short explanation"
}`
      },
      {
        role: "user",
        content: `Chat History:\n${historyText}\n\nLatest User Message: "${message}"`
      }
    ],
    0.1
  );

  return parseJsonSafe(raw, {
    resolvedContactIds: [],
    resolvedChannelIds: [],
    requestedContactRoles: [],
    actualMessageToSend: null,
    directoryAction: "none",
    includeTelegramChatIds: false,
    includeDiscordWebhooks: false,
    reasoning: "fallback"
  });
}

// ─── DATA QUERIES ─────────────────────────────────────────────────────────────

export async function resolveDataQuery({ message, memoryMessages, contacts, channels }) {
  const historyText = (memoryMessages || [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const contactList = (contacts || []).map((c) => ({
    id: String(c._id),
    name: c.name,
    type: c.type || "unknown",
    email: c.email || "",
    hasTelegram: Boolean(c.telegramChatId)
  }));
  const channelList = (channels || []).map((c) => ({
    id: String(c._id),
    name: c.name,
    crisisNotify: Boolean(c.notifyOnCrisis)
  }));

  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Semantic query planner for in-app saved data (contacts + Discord channels).

Return ONLY strict JSON:
{
  "action":"none|get_contact_email|get_contact_telegram|get_contact_type|list_callable_contacts|count_contacts_by_role|count_contacts_total|count_channels_total|count_channels_by_crisis_notify|summarize_health_24h|summarize_health_week|summarize_health_month",
  "resolvedContactIds":[],
  "resolvedChannelIds":[],
  "role":"doctor|psychiatrist|therapist|friend|family|other|none",
  "reason":"short"
}

Rules:
- Return action="none" for greetings, general chat, send requests, operational requests — those are NOT data queries.
- Only use non-none actions when user asks a specific factual question about saved data (emails, telegram IDs, types, counts).
- Use action="list_callable_contacts" when user asks who they can call / which contacts are available for calling right now.
- For requests like "summarize my mood/mental health in last 24 hours / week / month", choose summarize_health_24h / summarize_health_week / summarize_health_month.
- "hi", "hello", any greeting → action="none" ALWAYS.
- Never invent IDs; only use provided lists.`
      },
      {
        role: "user",
        content: `Chat History:\n${historyText}\n\nAvailable Contacts: ${JSON.stringify(contactList)}\nAvailable Channels: ${JSON.stringify(channelList)}\n\nLatest User Message: "${message}"`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    action: "none",
    resolvedContactIds: [],
    resolvedChannelIds: [],
    role: "none",
    reason: "fallback"
  });
}

// ─── OPERATIONAL PLANNING ─────────────────────────────────────────────────────

/**
 * Plans multi-action communication workflows.
 * MUST return empty actions[] for ALL non-operational messages.
 * This was a primary source of the "hi → email+telegram" bug.
 */
export async function planOperationalRequest({ message, recentContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Plan communication workflows from user messages.

Return ONLY strict JSON: {"actions":["general_mail|physical_mail|telegram_message|discord_message|google_meet|voice_call"],"target_scope":"all_contacts|all_channels|specific|unknown","message_payload":"string_or_empty","reason":"short"}

STRICT RULES:
- Return actions=[] (EMPTY array) for ALL of the following — NO EXCEPTIONS:
  * Greetings: "hi", "hello", "hey", "good morning", "what's up"
  * Questions about the assistant: "what is your name?", "what can you do?"
  * General conversation, small talk, emotional support, health/wellness questions
  * Any message that does NOT contain an explicit communication action verb AND has no prior operational context

- Only populate actions[] when message EXPLICITLY requests sending/scheduling, OR when recent context shows an active multi-action workflow and the current message is providing the requested payload:
  * "send email to [name]" → ["general_mail"]
  * "telegram message to [name]" → ["telegram_message"]
  * "send both email and telegram to [name]" → ["general_mail", "telegram_message"]
  * "post to discord channel" → ["discord_message"]
  * "schedule a google meet" → ["google_meet"]
  * "send google meet invite to all contacts" → ["google_meet"] with target_scope="all_contacts"
  * "invite all to a meet" → ["google_meet"] with target_scope="all_contacts"
  * If assistant previously asked "What message should I send via email + telegram?" and user replies with a message → restore the actions from context: ["general_mail", "telegram_message"]

- A contact name alone is NOT enough — explicit action verb required (unless context shows ongoing workflow).
- If user says "all contacts" OR context established all_contacts scope → target_scope="all_contacts"
- If user says "all channels" OR context established all_channels scope → target_scope="all_channels"
- Extract message_payload from the current message if it is the actual content to send (not a command).
- CRITICAL: If user explicitly LIMITS the channels (e.g. "only via telegram and mail", "telegram and mail only", "just email", "only telegram"), return EXACTLY those channels and NO others — even if context had other channels (like discord) active. User's explicit channel restriction is always the final word.
- When in doubt → actions=[]`
      },
      {
        role: "user",
        content: `Recent context:\n${recentContext || "none"}\n\nMessage:\n${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    actions: [],
    target_scope: "unknown",
    message_payload: "",
    reason: "fallback"
  });
}

// ─── MESSAGE DRAFTING ─────────────────────────────────────────────────────────

export async function assessDirectMessageSufficiency({ platform, message, recentContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Decide if user already provided enough message content to send as a direct outreach message.

Return ONLY strict JSON: {"sufficient":boolean,"reason":"short","clarification_question":"string"}

Rules:
- sufficient=true when: message conveys ANY concrete communication (announcement, notification, update, congratulations, etc.), even if brief. Date/time/location are NOT required for sufficiency.
- sufficient=false ONLY when: content is completely empty, is only a contact name/pronoun ("him", "her"), or is only a single vague word with no substance.
- A sentence of 5+ words that states something → always sufficient=true.
- Do NOT mark insufficient just because you want more details — if the user gave a message, it's sufficient.`
      },
      {
        role: "user",
        content: `Platform: ${platform}\nRecent context:\n${recentContext || "none"}\n\nLatest message content candidate:\n${message || ""}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, {
    sufficient: false,
    reason: "fallback_parse_error",
    clarification_question: "What message should I send?"
  });
}

export async function generateContactEmailDraft({ contactName, contactType, userName, context }) {
  const normalizedType = String(contactType || "").toLowerCase();
  const romanticType = ["bf", "gf", "spouse"].includes(normalizedType);
  const friendType = normalizedType === "friend";
  const familyType = normalizedType === "family";
  const professionalType = ["doctor", "psychiatrist", "other", "other user", "other_user"].includes(normalizedType);
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Draft a professional, concise email.

Return ONLY strict JSON: {"subject":"...","body":"...","needs_clarification":boolean,"clarification_question":"..."}

Rules:
- Draft a clear, actionable email based on the provided context.
- If context contains ANY message body or intent (even brief), draft it immediately. Set needs_clarification=false.
- ONLY set needs_clarification=true when context is completely empty or contains zero information about what to say.
- Do NOT ask for additional date/time/location details unless the email's purpose inherently requires them (e.g. scheduling a physical meeting). For general messages, notifications, or announcements, draft them as-is.
- Do NOT ask for clarification after the user has already provided the message content.
- Always produce a complete subject and body, never leave them empty when context exists.
${romanticType ? `- Contact type is ${contactType}. Use a warm, classy, lightly romantic tone.\n- Include a gentle affectionate touch (for example: “dear”, “thinking of you”, “take care”), while staying natural.\n- Keep it tasteful and concise; avoid cringe/overly dramatic wording.\n- Keep email structure professional with a polished subject and graceful close.` : ""}
${friendType ? `- Contact type is friend. Tone should be slightly informal but respectful, with natural friendly language.` : ""}
${familyType ? `- Contact type is family. Tone should blend formal + informal, include respectful greeting, and remain warm.` : ""}
${professionalType ? `- Contact type is ${contactType}. Tone must be strictly professional and polite.` : ""}`
      },
      {
        role: "user",
        content: `User: ${userName}\nContact: ${contactName} (${contactType})\nContext: ${context}`
      }
    ],
    0.3
  );

  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    return {
      subject: String(parsed.subject || "Support check-in"),
      body: String(parsed.body || "Hello, I would like to connect."),
      needsClarification: Boolean(parsed.needs_clarification),
      clarificationQuestion: String(parsed.clarification_question || "").trim()
    };
  }
  return {
    subject: "Support check-in request",
    body: raw,
    needsClarification: false,
    clarificationQuestion: ""
  };
}

export async function generateVoiceCallScript({ contactName, contactType, userName, context }) {
  const normalizedType = String(contactType || "").toLowerCase();
  const romanticType = ["bf", "gf", "spouse"].includes(normalizedType);
  const friendType = normalizedType === "friend";
  const familyType = normalizedType === "family";
  const professionalType = ["doctor", "psychiatrist", "other", "other user", "other_user"].includes(normalizedType);
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Draft a concise voice-call relay script that will be spoken by text-to-speech.

Return ONLY strict JSON: {"script":"...","needs_clarification":boolean,"clarification_question":"..."}

Rules:
- Keep it short and clear (about 1 to 3 sentences).
- Start naturally with recipient name and who is relaying.
- Use third-person relay style for sender content (not first-person).
- If context has any concrete message intent, draft immediately.
- needs_clarification=true only when context has no clear message.
${romanticType ? `- Contact type is ${contactType}. Use warm, classy, lightly romantic wording.\n- Include one gentle affectionate line and a soft closing (for example: "take care", "thinking of you", "miss you").\n- Keep it tasteful and natural, never cheesy, never overly dramatic.` : ""}
${friendType ? `- Contact type is friend. Tone should be slightly informal but respectful, while remaining clear for voice relay.` : ""}
${familyType ? `- Contact type is family. Tone should blend respectful warmth with natural family informality.` : ""}
${professionalType ? `- Contact type is ${contactType}. Tone must be strictly professional and polite.` : ""}`
      },
      {
        role: "user",
        content: `User: ${userName}\nContact: ${contactName} (${contactType})\nContext: ${context}`
      }
    ],
    0.3
  );

  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    return {
      script: String(parsed.script || "").trim(),
      needsClarification: Boolean(parsed.needs_clarification),
      clarificationQuestion: String(parsed.clarification_question || "").trim()
    };
  }
  return {
    script: String(raw || "").trim(),
    needsClarification: false,
    clarificationQuestion: ""
  };
}

export async function generateVoiceCallConversationTurn({
  relayMessage,
  callerUtterance,
  recentTurns = [],
  userName,
  contactName
}) {
  const callerText = String(callerUtterance || "").trim();
  const compactTurns = Array.isArray(recentTurns)
    ? recentTurns
        .slice(-10)
        .map((t) => `${t.role}: ${trimText(t.text, 280)}`)
        .join("\n")
    : "";
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `You are a voice relay assistant on a phone call.

Return ONLY strict JSON:
{"reply":"...","endCall":boolean}

Rules:
- Answer the caller's question directly and clearly, to the best of available context and general knowledge.
- Keep replies concise and natural for voice (1-3 sentences, max 60 words).
- Prioritize factual safety. If you are not confident, do NOT guess.
- If unknown/uncertain, use this exact line:
  "I don't know about this, however I'll confirm it once with ${userName || "the user"} and let you know as soon as possible."
- Try to resolve follow-up doubts step-by-step when possible.
- Preserve relay context and help both sides coordinate clearly.
- If the caller shares a message/request to pass to the user, acknowledge and confirm it will be conveyed to ${userName || "the user"}.
- In that acknowledgement case, DO NOT repeat or quote the caller's full sentence back.
- If caller asks to stop/end/bye semantically, set endCall=true and give a polite final line.
- If caller asks to repeat the original relay message semantically, repeat it briefly.
- Never provide diagnosis, legal certainty claims, or unsafe instructions.
- Use semantic meaning, not brittle literal matching.`
      },
      {
        role: "user",
        content: `Relay context: ${relayMessage || ""}
Original sender: ${userName || "the sender"}
Contact being called: ${contactName || "contact"}
Recent turns:
${compactTurns || "none"}

Caller just said:
${callerUtterance || ""}`
      }
    ],
    0.2
  );
  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    let reply = String(parsed.reply || "").trim();
    const endCall = Boolean(parsed.endCall);
    if (reply && isNearParrotReply(callerText, reply)) {
      reply = `Understood. I will convey this to ${userName || "the user"} as soon as possible.`;
    }
    if (reply) return { reply, endCall };
  }
  return {
    reply: "Thanks for sharing. I have noted that. If you are done, you can say goodbye, or continue speaking.",
    endCall: false
  };
}

export async function verifyVoiceReplySafety({
  draftReply,
  relayMessage,
  callerUtterance,
  userName = "",
  contactName = ""
}) {
  const fallback = `I don't know about this, however I'll confirm it once with ${userName || "the user"} and let you know as soon as possible.`;
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `You are a strict fact-safety verifier for a phone voice assistant.

Return ONLY strict JSON:
{"safeReply":"...","isAdjusted":boolean,"reason":"short"}

Rules:
- Preserve meaning when the draft reply is safe and reasonable.
- If draft reply may contain uncertain/fabricated facts, overconfident claims, or risky misinformation, rewrite to a safer response.
- Never guess unknown facts.
- If uncertain, use this exact line:
  "${fallback}"
- Keep output concise for voice (max 60 words).
- Do not add new facts not grounded in context.`
      },
      {
        role: "user",
        content: `Original sender: ${userName || "the sender"}
Contact being called: ${contactName || "contact"}
Relay context: ${relayMessage || ""}
Caller utterance: ${callerUtterance || ""}
Draft reply to verify: ${draftReply || ""}`
      }
    ],
    0
  );
  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    let safeReply = String(parsed.safeReply || "").trim();
    const isAdjusted = Boolean(parsed.isAdjusted);
    const reason = String(parsed.reason || "").trim();
    if (safeReply && isNearParrotReply(String(callerUtterance || ""), safeReply)) {
      safeReply = `Understood. I will convey this to ${userName || "the user"} as soon as possible.`;
    }
    if (safeReply) return { safeReply, isAdjusted, reason };
  }
  return { safeReply: String(draftReply || "").trim() || fallback, isAdjusted: false, reason: "fallback_passthrough" };
}

function isNearParrotReply(sourceText, replyText) {
  const a = String(sourceText || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const b = String(replyText || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const aw = new Set(a.split(" ").filter(Boolean));
  const bw = new Set(b.split(" ").filter(Boolean));
  if (!aw.size || !bw.size) return false;
  let inter = 0;
  for (const w of aw) if (bw.has(w)) inter += 1;
  const overlapA = inter / aw.size;
  const overlapB = inter / bw.size;
  return overlapA >= 0.8 && overlapB >= 0.65;
}

export async function summarizeVoiceCallContactInsights({
  relayMessage = "",
  userName = "",
  contactName = "",
  turns = []
}) {
  const callerTurns = Array.isArray(turns)
    ? turns.filter((t) => String(t?.role || "") === "caller").slice(-24)
    : [];
  if (!callerTurns.length) {
    return {
      summary: "",
      keyPoints: []
    };
  }
  const compactCallerText = callerTurns
    .map((t) => `- ${trimText(String(t?.text || ""), 240)}`)
    .join("\n");

  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Extract important actionable information from a completed phone call with a contact.

Return ONLY strict JSON:
{"summary":"...","keyPoints":["...","...","..."]}

Rules:
- Focus only on what the CONTACT said (caller role).
- Include only concrete useful points for the original user: requests, concerns, schedule constraints, promised actions, follow-ups.
- Do NOT repeat or paraphrase details that came only from the original relay message unless the contact explicitly repeated them.
- Do not fabricate details.
- Keep summary short (max 80 words).
- keyPoints should be 3-6 concise bullets.
- Exclude sensitive diagnosis claims and avoid unsafe guidance.
- If no meaningful content, return empty summary and empty keyPoints.`
      },
      {
        role: "user",
        content: `Original sender: ${userName || "user"}
Contact: ${contactName || "contact"}
Original relay message: ${relayMessage || ""}
Caller statements:
${compactCallerText}`
      }
    ],
    0.1
  );
  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    const summary = String(parsed.summary || "").trim();
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8)
      : [];
    return { summary, keyPoints };
  }
  return { summary: "", keyPoints: [] };
}

export async function rewriteDispatchMessage({
  mode,
  userName,
  recipientLabel,
  recipientName = "",
  recipientType = "",
  familyGreetingStyle = "auto",
  forceFormal = false,
  context
}) {
  const normalizedType = String(recipientType || "").trim().toLowerCase();
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Rewrite user-provided outbound communication text with better grammar and clarity.

Return ONLY strict JSON:
{"text":"...","subject":"optional"}

Rules:
- Keep original intent exactly.
- Voice perspective rule:
  - For modes general_mail, physical_mail, google_meet: write in first-person from the user.
  - For modes telegram_message, discord_message, voice_call: write in third-person relay style.
- Be slightly elaborative and polished (not too short, not too long).
- Do not add new facts.
- For mode=general_mail or physical_mail, also provide a polished subject.
- For mode=google_meet, make it invite-appropriate and clear.
- For mode=discord_message, tone must be informative + formal (group/channel broadcast style).
- For mode=telegram_message and mode=discord_message, append this exact final line:
  "This is an auto-generated message, do not reply to this."
- NON-NEGOTIABLE tone matrix (must follow):
  - recipientType = gf/bf/spouse AND FORCE FORMAL is false:
    use classy romantic tone (warm, caring, affectionate but not cheesy). Do NOT output dry corporate phrasing.
    Include at least one warm emotional phrase naturally (example style: "he is really looking forward to seeing you", "he cares deeply and hopes to make it up soon").
  - recipientType = friend: slightly informal + respectful.
  - recipientType = family: respectful, warm, with greeting.
  - recipientType = doctor/psychiatrist/other: professional + formal.
  - recipientType unknown: neutral respectful.
- If FORCE FORMAL is true, override all personal tones and write one common formal message.
- Never mention "tone", "style", or meta commentary in the output.
${forceFormal ? "- FORCE FORMAL: Use formal, neutral, respectful language regardless of recipient type. Do not use romantic/informal tone." : ""}`
      },
      {
        role: "user",
        content: `Mode: ${mode}
Sender: ${userName}
Recipients: ${recipientLabel}
Primary recipient: ${recipientName || "N/A"}
Primary recipient type: ${normalizedType || "unknown"}
Raw message: ${context}`
      }
    ],
    0.2
  );
  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    const rewrittenText = enforceContactToneGuard({
      text: String(parsed.text || "").trim(),
      recipientType: normalizedType,
      mode,
      familyGreetingStyle,
      senderName: userName,
      recipientName,
      forceFormal
    });
    return {
      text: rewrittenText,
      subject: String(parsed.subject || "").trim()
    };
  }
  return {
    text: enforceContactToneGuard({
      text: String(context || "").trim(),
      recipientType: normalizedType,
      mode,
      familyGreetingStyle,
      senderName: userName,
      recipientName,
      forceFormal
    }),
    subject: ""
  };
}

export async function generateContactTelegramMessage({ contactName, contactType, userName, context }) {
  const normalizedType = String(contactType || "").toLowerCase();
  const romanticType = ["bf", "gf", "spouse"].includes(normalizedType);
  const friendType = normalizedType === "friend";
  const familyType = normalizedType === "family";
  const professionalType = ["doctor", "psychiatrist", "other", "other user", "other_user"].includes(normalizedType);
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Draft a short, respectful Telegram message.

Return ONLY strict JSON: {"text":"...","needs_clarification":boolean,"clarification_question":"..."}

Rules:
- Write in third-person relay voice.
- Draft based strictly on user intent.
- If details are ambiguous or missing, needs_clarification=true.
${romanticType ? `- Contact type is ${contactType}. Use a classy romantic tone (subtle, respectful, not cringe).` : ""}
${friendType ? `- Contact type is friend. Use a slightly informal but respectful tone.` : ""}
${familyType ? `- Contact type is family. Use a respectful warm tone with natural family greeting style.` : ""}
${professionalType ? `- Contact type is ${contactType}. Use a strictly professional tone.` : ""}`
      },
      {
        role: "user",
        content: `User: ${userName}\nContact: ${contactName} (${contactType})\nContext: ${context}`
      }
    ],
    0.3
  );

  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    return {
      text: String(parsed.text || "").trim(),
      needsClarification: Boolean(parsed.needs_clarification),
      clarificationQuestion: String(parsed.clarification_question || "").trim()
    };
  }
  return {
    text: "",
    needsClarification: true,
    clarificationQuestion: "Please share the exact message you want me to send on Telegram."
  };
}

export async function updateTelegramDraftState({ contactName, contactType, userName, newMessage, currentDetails }) {
  const normalizedType = String(contactType || "").toLowerCase();
  const romanticType = ["bf", "gf", "spouse"].includes(normalizedType);
  const friendType = normalizedType === "friend";
  const familyType = normalizedType === "family";
  const professionalType = ["doctor", "psychiatrist", "other", "other user", "other_user"].includes(normalizedType);
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Maintain a structured draft state for a Telegram message.

Merge current known details with new user message semantically. Never discard known details unless user explicitly changes them. Preserve user intent exactly.

Mandatory rules:
- A concrete message intent/purpose is required before ready=true.
- If latest input is only target-selection text (name only, no message content), set ready=false and ask what should be sent.
- If the user has provided ANY message content or intent (even brief), set ready=true and draft it. Do NOT ask for more.
- Date/time/location are NEVER required unless the message's purpose is specifically about scheduling. For general messages, set ready=true immediately.
- Do NOT ask for clarification after content has been provided.
- NEVER set missing_fields to date/time/location for non-scheduling messages.
- Draft text must be in third-person relay voice.
${romanticType ? `- Contact type is ${contactType}. Draft text in a warm, classy, lightly romantic tone.\n- Include a subtle affectionate touch (for example: "thinking of you", "take care", "miss you"), but keep it brief.\n- Keep it natural and respectful; avoid cheesy or excessive lines.` : ""}
${friendType ? `- Contact type is friend. Draft text should be slightly informal but respectful.` : ""}
${familyType ? `- Contact type is family. Draft text should blend warm family tone with respectful greeting style.` : ""}
${professionalType ? `- Contact type is ${contactType}. Draft text must be strictly professional and polite.` : ""}

Return ONLY strict JSON:
{"updated_details":{"purpose":"","date":"","time":"","location":"","contactFullName":"","invitees":"","notes":""},"missing_fields":[],"clarification_question":"...","ready":boolean,"draft_text":"..."}`
      },
      {
        role: "user",
        content: `User: ${userName}\nContact: ${contactName} (${contactType})\nCurrent details JSON: ${JSON.stringify(currentDetails || {})}\nNew message: ${newMessage}`
      }
    ],
    0.2
  );

  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    const details = parsed.updated_details && typeof parsed.updated_details === "object" ? parsed.updated_details : {};
    return {
      updatedDetails: {
        purpose: String(details.purpose || ""),
        date: String(details.date || ""),
        time: String(details.time || ""),
        location: String(details.location || ""),
        contactFullName: String(details.contactFullName || ""),
        invitees: String(details.invitees || ""),
        notes: String(details.notes || "")
      },
      missingFields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields.map((x) => String(x)) : [],
      clarificationQuestion: String(parsed.clarification_question || ""),
      ready: Boolean(parsed.ready),
      draftText: String(parsed.draft_text || "")
    };
  }

  return {
    updatedDetails: { purpose: "", date: "", time: "", location: "", contactFullName: "", invitees: "", notes: "" },
    missingFields: ["purpose"],
    clarificationQuestion: "Please share the exact message intent so I can finalize the Telegram message.",
    ready: false,
    draftText: ""
  };
}

export async function updateDiscordDraftState({ contactName, contactType, userName, newMessage, currentDetails }) {
  const normalizedType = String(contactType || "").toLowerCase();
  const romanticType = ["bf", "gf", "spouse"].includes(normalizedType);
  const friendType = normalizedType === "friend";
  const familyType = normalizedType === "family";
  const professionalType = ["doctor", "psychiatrist", "other", "other user", "other_user"].includes(normalizedType);
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Maintain a structured draft state for a Discord message.

Merge current known details with new user message semantically. Never discard known details unless explicitly changed. Preserve user intent exactly.

Mandatory rules:
- A concrete message intent/purpose is required before ready=true.
- If latest input is only target-selection text -> ready=false, ask what should be sent.
- Date/time/location are optional unless explicitly needed.
- Draft text must be in third-person relay voice.
- Discord tone baseline must be informative + formal for group/channel audience.
${romanticType ? `- If recipient context is ${contactType}, keep a classy affectionate nuance but preserve informative/formal clarity.` : ""}
${friendType ? `- If friend context applies, keep it slightly informal but still respectful and clear.` : ""}
${familyType ? `- If family context applies, keep it respectful and warm without becoming overly casual.` : ""}
${professionalType ? `- If professional context applies (${contactType}), maintain strictly professional wording.` : ""}

Return ONLY strict JSON:
{"updated_details":{"purpose":"","date":"","time":"","location":"","contactFullName":"","invitees":"","notes":""},"missing_fields":[],"clarification_question":"...","ready":boolean,"draft_text":"..."}`
      },
      {
        role: "user",
        content: `User: ${userName}\nContact: ${contactName} (${contactType})\nCurrent details JSON: ${JSON.stringify(currentDetails || {})}\nNew message: ${newMessage}`
      }
    ],
    0.2
  );

  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object") {
    const details = parsed.updated_details && typeof parsed.updated_details === "object" ? parsed.updated_details : {};
    return {
      updatedDetails: {
        purpose: String(details.purpose || ""),
        date: String(details.date || ""),
        time: String(details.time || ""),
        location: String(details.location || ""),
        contactFullName: String(details.contactFullName || ""),
        invitees: String(details.invitees || ""),
        notes: String(details.notes || "")
      },
      missingFields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields.map((x) => String(x)) : [],
      clarificationQuestion: String(parsed.clarification_question || ""),
      ready: Boolean(parsed.ready),
      draftText: String(parsed.draft_text || "")
    };
  }

  return {
    updatedDetails: { purpose: "", date: "", time: "", location: "", contactFullName: "", invitees: "", notes: "" },
    missingFields: ["purpose"],
    clarificationQuestion: "Please share the exact message intent so I can finalize the Discord message.",
    ready: false,
    draftText: ""
  };
}

export async function extractRelayMessage({ message, recentContext }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Extract the exact core message user wants relayed to their contact.

Return ONLY strict JSON: {"relay_text":"...","tone":"short"}`
      },
      {
        role: "user",
        content: `Recent context:\n${recentContext || "none"}\n\nUser message:\n${message}`
      }
    ],
    0.2
  );

  const parsed = parseJsonSafe(raw, null);
  if (parsed && typeof parsed === "object" && parsed.relay_text) {
    return String(parsed.relay_text).trim();
  }
  return String(message || "").trim();
}

export async function detectMissingInfo({ intent, message, recentContext }) {
  if (intent === "support_chat" || intent === "history_question" || intent === "crisis") return null;

  const raw = await callGroq(
    [
      {
        role: "system",
        content: `For intent "${intent}", identify missing details. Return ONLY strict JSON: {"missing_fields":["..."],"reason":"..."}. Required for general/physical mail: recipient_name and purpose. Required for google_meet: person_name, exact_date_time_year, meet_mode.`
      },
      {
        role: "user",
        content: `Context: ${recentContext || "none"}\nMessage: ${message}`
      }
    ],
    0
  );

  return parseJsonSafe(raw, { missing_fields: [], reason: "" });
}

export async function summarizeForListener({ message, emotion, needs }) {
  const content = await callGroq(
    [
      {
        role: "system",
        content: "Create a short anonymized handoff summary for a human listener. No personal identifiers."
      },
      {
        role: "user",
        content: `Emotion: ${emotion}\nNeeds: ${(needs || []).join(", ")}\nMessage: ${message}`
      }
    ],
    0.2
  );
  return content.slice(0, 500);
}

export async function countDoctorMeetRequests({ historyTexts, currentQuestion }) {
  const texts = Array.isArray(historyTexts) ? historyTexts : [];
  if (!texts.length) return 0;

  let count = 0;
  const batchSize = 30;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const numbered = batch.map((t, idx) => `${idx + 1}. ${trimText(t, 320)}`).join("\n");

    const raw = await callGroq(
      [
        {
          role: "system",
          content: `Detect whether each user message is a request to meet/visit/schedule an appointment with doctor/psychiatrist (in-person or virtual). Use semantic meaning. Return ONLY strict JSON: {"matching_indices":[number],"reason":"short"} where indices are 1-based positions from the provided batch only.`
        },
        {
          role: "user",
          content: `Question being answered:\n${currentQuestion}\n\nBatch messages:\n${numbered}`
        }
      ],
      0
    );

    const parsed = parseJsonSafe(raw, { matching_indices: [] });
    const idxs = Array.isArray(parsed.matching_indices) ? parsed.matching_indices : [];
    const valid = idxs.filter((n) => Number.isInteger(n) && n >= 1 && n <= batch.length);
    count += new Set(valid).size;
  }

  return count;
}

export async function summarizeEscalationTakeaways({ transcript, speakerName, listenerName }) {
  const compact = (Array.isArray(transcript) ? transcript : [])
    .slice(-120)
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n")
    .slice(0, 12000);

  if (!compact.trim()) {
    return "- No key takeaways were captured.";
  }

  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Create a privacy-safe session takeaway summary.

Return ONLY plain bullet points (3 to 5 bullets), each on a new line starting with "- ".

Rules:
- Focus on supportive insights and practical next steps.
- Remove or generalize any personally identifiable information (names, emails, phone numbers, links, exact addresses).
- Do not include private identifiers from transcript.
- Keep concise and useful for the speaker's wellness log.`
      },
      {
        role: "user",
        content: `Speaker: ${speakerName || "speaker"}\nListener: ${listenerName || "listener"}\nTranscript:\n${compact}`
      }
    ],
    0.2
  );

  const lines = String(raw || "")
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.startsWith("- "))
    .slice(0, 5);
  if (lines.length >= 3) return lines.join("\n");
  return "- Session focused on emotional support and stabilization.\n- Key concerns were acknowledged and reflected with empathy.\n- Follow-up support steps were identified for the coming days.";
}

export async function auditListenerSupportQuality({
  transcript,
  speakerName,
  listenerName
}) {
  const compact = (Array.isArray(transcript) ? transcript : [])
    .slice(-160)
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n")
    .slice(0, 14000);

  if (!compact.trim()) {
    return {
      intents: [],
      engagementScore: 0,
      verdict: "No transcript available.",
      notes: "No content to audit."
    };
  }

  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Audit the listener quality in a support chat.

Return ONLY strict JSON:
{
  "intents": ["Active Listening","Reflective Response","Validation","Problem Solving"],
  "engagementScore": 0-10,
  "verdict": "short plain sentence",
  "notes": "1-2 lines, no PII"
}

Rules:
- Score on support quality and engagement from listener messages.
- 0-3 means poor/low effort; 4-6 mixed effort; 7-10 good supportive effort.
- Use semantic meaning, not message count only.
- Keep output privacy-safe.`
      },
      {
        role: "user",
        content: `Speaker: ${speakerName || "speaker"}\nListener: ${listenerName || "listener"}\nTranscript:\n${compact}`
      }
    ],
    0.1
  );

  const parsed = parseJsonSafe(raw, null);
  const intents = Array.isArray(parsed?.intents)
    ? parsed.intents.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : [];
  const score = Number(parsed?.engagementScore);
  const engagementScore = Number.isFinite(score) ? Math.max(0, Math.min(10, Number(score.toFixed(2)))) : 0;
  return {
    intents,
    engagementScore,
    verdict: String(parsed?.verdict || "").trim() || "Audit completed.",
    notes: String(parsed?.notes || "").trim() || ""
  };
}


