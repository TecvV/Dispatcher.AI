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
        content: `You are a compassionate mental wellness assistant named WcA (Wellness Care Assistant).

Your capabilities (tell users about these when asked):
- Send emails to saved contacts
- Send Telegram messages to saved contacts
- Send Discord messages to saved channels
- Schedule Google Meet with saved contacts
- Provide mental wellness support, health tips, and emotional support
- Manage contacts and channels

When user greets you ("hi", "hello", etc.): greet them warmly and briefly introduce yourself.
When user asks your name: say your name is WcA (Wellness Care Assistant).
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
  const romanticType = ["bf", "gf", "spouse"].includes(String(contactType || "").toLowerCase());
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
${romanticType ? `- Contact type is ${contactType}. Use a warm, classy, lightly romantic tone.\n- Include a gentle affectionate touch (for example: “dear”, “thinking of you”, “take care”), while staying natural.\n- Keep it tasteful and concise; avoid cringe/overly dramatic wording.\n- Keep email structure professional with a polished subject and graceful close.` : ""}`
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
  const romanticType = ["bf", "gf", "spouse"].includes(String(contactType || "").toLowerCase());
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Draft a concise voice-call relay script that will be spoken by text-to-speech.

Return ONLY strict JSON: {"script":"...","needs_clarification":boolean,"clarification_question":"..."}

Rules:
- Keep it short and clear (about 1 to 3 sentences).
- Start naturally with recipient name and who is relaying.
- If context has any concrete message intent, draft immediately.
- needs_clarification=true only when context has no clear message.
${romanticType ? `- Contact type is ${contactType}. Use warm, classy, lightly romantic wording.\n- Include one gentle affectionate line and a soft closing (for example: "take care", "thinking of you", "miss you").\n- Keep it tasteful and natural, never cheesy, never overly dramatic.` : ""}`
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

export async function rewriteDispatchMessage({
  mode,
  userName,
  recipientLabel,
  recipientName = "",
  recipientType = "",
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
- Use first-person voice from the user.
- Be slightly elaborative and polished (not too short, not too long).
- Do not add new facts.
- For mode=general_mail or physical_mail, also provide a polished subject.
- For mode=google_meet, make it invite-appropriate and clear.
- For mode=discord_message, tone must be informative + formal (group/channel broadcast style).
- For recipient types gf/bf/spouse: classy romantic (subtle, respectful, never cringe).
- For recipient type friend: a little informal but respectful.
- For recipient type family: blended formal+informal with respectful greeting.
- For recipient types doctor/psychiatrist/other: strictly professional tone.
- If recipient type is unknown, use neutral respectful tone.`
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
    return {
      text: String(parsed.text || "").trim(),
      subject: String(parsed.subject || "").trim()
    };
  }
  return {
    text: String(context || "").trim(),
    subject: ""
  };
}

export async function generateContactTelegramMessage({ contactName, contactType, userName, context }) {
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Draft a short, respectful Telegram message.

Return ONLY strict JSON: {"text":"...","needs_clarification":boolean,"clarification_question":"..."}

Rules:
- Write in first-person voice from the user.
- Draft based strictly on user intent.
- If details are ambiguous or missing → needs_clarification=true.`
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
  const romanticType = ["bf", "gf", "spouse"].includes(String(contactType || "").toLowerCase());
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
- Draft text must be in first-person voice from the user.
${romanticType ? `- Contact type is ${contactType}. Draft text in a warm, classy, lightly romantic tone.\n- Include a subtle affectionate touch (for example: “thinking of you”, “take care”, “miss you”), but keep it brief.\n- Keep it natural and respectful; avoid cheesy or excessive lines.` : ""}

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
  const raw = await callGroq(
    [
      {
        role: "system",
        content: `Maintain a structured draft state for a Discord message.

Merge current known details with new user message semantically. Never discard known details unless explicitly changed. Preserve user intent exactly.

Mandatory rules:
- A concrete message intent/purpose is required before ready=true.
- If latest input is only target-selection text → ready=false, ask what should be sent.
- Date/time/location are optional unless explicitly needed.

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

// ─── MISC ─────────────────────────────────────────────────────────────────────

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


