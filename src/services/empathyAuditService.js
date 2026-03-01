import { env } from "../config/env.js";

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

async function callGroq(messages) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.groqApiKey}`
    },
    body: JSON.stringify({
      model: env.groqModel,
      messages,
      temperature: 0.1
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function analyzeSessionEmpathy({ transcript }) {
  const compact = (Array.isArray(transcript) ? transcript : [])
    .slice(-80)
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n")
    .slice(0, 9000);

  if (!compact.trim()) {
    return {
      empathyScore: 0.5,
      flagged: false,
      lowEffortSignals: 0,
      summary: "No transcript content found."
    };
  }

  const raw = await callGroq([
    {
      role: "system",
      content: `You are an empathy quality auditor for emotional support sessions.

Return ONLY strict JSON:
{
  "empathy_score": 0.0,
  "low_effort_signals": 0,
  "flagged": false,
  "summary": "short"
}

Rules:
- Judge by semantic quality of support, not keywords.
- Penalize repetitive one-liners, stalling, or generic filler.
- Reward active listening, specific validation, and constructive support.
- Set flagged=true when effort appears clearly low or exploitative.`
    },
    { role: "user", content: `Session transcript:\n${compact}` }
  ]);

  const parsed = parseJsonSafe(raw, {
    empathy_score: 0.5,
    low_effort_signals: 0,
    flagged: false,
    summary: "Fallback audit result."
  });

  return {
    empathyScore: Number(parsed.empathy_score || 0),
    lowEffortSignals: Number(parsed.low_effort_signals || 0),
    flagged: Boolean(parsed.flagged),
    summary: String(parsed.summary || "No summary")
  };
}

