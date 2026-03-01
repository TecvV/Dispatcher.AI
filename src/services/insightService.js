import { ConversationMemory } from "../models/ConversationMemory.js";
import { InsightReport } from "../models/InsightReport.js";
import { User } from "../models/User.js";

function weekKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function buildInsights(memories) {
  if (!memories.length) return ["Not enough data yet for meaningful trend analysis."];

  const byWeekdayHour = new Map();
  for (const m of memories) {
    const d = new Date(m.createdAt);
    const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    const cur = byWeekdayHour.get(key) || { total: 0, count: 0 };
    cur.total += m.sentimentScore || 0;
    cur.count += 1;
    byWeekdayHour.set(key, cur);
  }

  let lowestKey = null;
  let lowestAvg = Infinity;
  for (const [key, agg] of byWeekdayHour.entries()) {
    const avg = agg.total / agg.count;
    if (avg < lowestAvg) {
      lowestAvg = avg;
      lowestKey = key;
    }
  }

  if (!lowestKey) return ["Mood has been relatively stable this week."];

  const [day, hour] = lowestKey.split("-").map(Number);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return [
    `You tended to report higher stress on ${days[day]} around ${hour}:00 UTC.`,
    "Would you like a recurring 15-minute grounding reminder at that time?"
  ];
}

export async function generateWeeklyInsightForUser(userId) {
  const wk = weekKey();
  const existing = await InsightReport.findOne({ userId, weekKey: wk });
  if (existing) return existing;

  const memories = await ConversationMemory.find({
    userId,
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    role: "user"
  }).sort({ createdAt: 1 });

  const insights = buildInsights(memories);
  const report = await InsightReport.create({
    userId,
    weekKey: wk,
    insights,
    recommendation: insights[1] || "Keep logging short check-ins for better weekly recommendations."
  });

  await User.findByIdAndUpdate(userId, {
    $push: {
      notifications: {
        title: "Weekly Insight Report",
        message: insights[0]
      }
    }
  });

  return report;
}

export async function runInsightSweep() {
  const users = await User.find({}).select("_id").limit(500);
  let count = 0;
  for (const user of users) {
    await generateWeeklyInsightForUser(user._id);
    count += 1;
  }
  return count;
}
