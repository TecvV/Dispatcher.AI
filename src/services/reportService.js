import { ConversationMemory } from "../models/ConversationMemory.js";
import { MoodReport } from "../models/MoodReport.js";

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function weekKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function monthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function moodBucket(entry) {
  if (entry.emotion === "crisis") return "crisis";
  if (entry.emotion === "distressed" || (entry.sentimentScore || 0) < -0.2) return "distressed";
  if (entry.emotion === "uplifted" || (entry.sentimentScore || 0) > 0.2) return "uplifted";
  return "neutral";
}

function sentimentBand(score) {
  if (score < -0.2) return -1;
  if (score > 0.2) return 1;
  return 0;
}

function toSimpleMoodWord(avg) {
  if (avg <= -0.35) return "feeling very low";
  if (avg <= -0.15) return "feeling low";
  if (avg < 0.15) return "feeling okay";
  if (avg < 0.35) return "feeling better";
  return "feeling very good";
}

function toSimpleDominantMoodWord(dominantMood) {
  if (dominantMood === "distressed") return "feeling low";
  if (dominantMood === "uplifted") return "feeling better";
  if (dominantMood === "crisis") return "in urgent distress";
  return "feeling okay";
}

function buildRecommendation(avg, distressedCount, period) {
  const recommendations = [];
  const highThreshold = period === "daily" ? 3 : period === "weekly" ? 8 : 20;
  const moderateThreshold = period === "daily" ? 2 : period === "weekly" ? 5 : 12;
  if (avg < -0.35 || distressedCount >= highThreshold) {
    recommendations.push("High distress trend detected. Reach out to a trusted family member or friend today.");
    recommendations.push("If this pattern continues for 24-48 hours, consult your doctor or psychiatrist.");
    return {
      recommendations,
      consultAdvice: "Consult doctor/psychiatrist if distress persists or worsens."
    };
  }
  if (avg < -0.15 || distressedCount >= moderateThreshold) {
    recommendations.push("Moderate stress trend detected. Use grounding and contact a friend for check-in.");
    recommendations.push("If sleep/mood worsens, consider booking a professional consultation.");
    return {
      recommendations,
      consultAdvice: "Consult family/friends first; escalate to doctor if no improvement."
    };
  }
  recommendations.push("Mood appears relatively stable. Maintain routine check-ins and self-care habits.");
  return {
    recommendations,
    consultAdvice: "No urgent escalation indicated."
  };
}

async function generateForPeriod(userId, period) {
  const now = new Date();
  const rangeMs =
    period === "daily"
      ? 24 * 60 * 60 * 1000
      : period === "weekly"
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  const key = period === "daily" ? dayKey(now) : period === "weekly" ? weekKey(now) : monthKey(now);

  const existing = await MoodReport.findOne({ userId, period, key });
  if (existing) return existing;

  const entries = await ConversationMemory.find({
    userId,
    role: "user",
    $or: [{ mode: "companion" }, { mode: { $exists: false } }],
    createdAt: { $gte: new Date(Date.now() - rangeMs) }
  }).sort({ createdAt: 1 });

  const total = entries.reduce((acc, x) => acc + (x.sentimentScore || 0), 0);
  const avg = entries.length ? total / entries.length : 0;
  const distressedCount = entries.filter((x) => x.emotion === "distressed" || (x.sentimentScore || 0) < -0.2).length;
  const moodCounts = {
    distressed: 0,
    neutral: 0,
    uplifted: 0,
    crisis: 0
  };
  for (const e of entries) {
    moodCounts[moodBucket(e)] += 1;
  }
  let swingCount = 0;
  let lastBand = null;
  for (const e of entries) {
    const currentBand = sentimentBand(e.sentimentScore || 0);
    if (lastBand !== null && currentBand !== lastBand) swingCount += 1;
    lastBand = currentBand;
  }
  const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";
  const rec = buildRecommendation(avg, distressedCount, period);
  const label = period === "daily" ? "Last 24 hours" : period === "weekly" ? "Last week" : "Last month";
  const summary = `${label}: ${entries.length} check-ins. Overall trend: ${toSimpleMoodWord(avg)}. Feeling low moments: ${moodCounts.distressed}. Feeling better moments: ${moodCounts.uplifted}. Neutral moments: ${moodCounts.neutral}. Urgent distress moments: ${moodCounts.crisis}. Mood shifts: ${swingCount}. Most common state: ${toSimpleDominantMoodWord(dominantMood)}.`;

  return MoodReport.create({
    userId,
    period,
    key,
    avgSentiment: avg,
    distressedCount,
    summary,
    details: {
      totalEntries: entries.length,
      moodCounts,
      swingCount,
      dominantMood
    },
    recommendations: rec.recommendations,
    consultAdvice: rec.consultAdvice
  });
}

export async function generateDailyReportForUser(userId) {
  return generateForPeriod(userId, "daily");
}

export async function generateWeeklyReportForUser(userId) {
  return generateForPeriod(userId, "weekly");
}

export async function generateReportsForUser(userId) {
  const [daily, weekly, monthly] = await Promise.all([
    generateDailyReportForUser(userId),
    generateWeeklyReportForUser(userId),
    generateForPeriod(userId, "monthly")
  ]);
  return { daily, weekly, monthly };
}

export async function getLatestReports(userId) {
  const [daily, weekly, monthly] = await Promise.all([
    MoodReport.findOne({ userId, period: "daily" }).sort({ createdAt: -1 }),
    MoodReport.findOne({ userId, period: "weekly" }).sort({ createdAt: -1 }),
    MoodReport.findOne({ userId, period: "monthly" }).sort({ createdAt: -1 })
  ]);
  return { daily, weekly, monthly };
}
