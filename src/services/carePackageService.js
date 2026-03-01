import { CarePackage } from "../models/CarePackage.js";

function getDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function buildItemsFromNeeds(needs) {
  const items = [];

  if (needs.includes("sleep")) {
    items.push({
      type: "breathing",
      title: "4-7-8 Wind-down",
      content: "Inhale 4 seconds, hold 7, exhale 8. Repeat 4 rounds.",
      durationMin: 5
    });
  }

  if (needs.includes("grief")) {
    items.push({
      type: "journal_prompt",
      title: "Gentle grief reflection",
      content: "Write one memory that feels comforting and one feeling you are carrying.",
      durationMin: 7
    });
  }

  if (needs.includes("anxiety") || needs.includes("career_stress")) {
    items.push({
      type: "micro_habit",
      title: "Two-minute grounding reset",
      content: "Name 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste.",
      durationMin: 2
    });
  }

  items.push({
    type: "article",
    title: "Community pick: self-compassion on hard days",
    content: "Read the top community thread focused on self-kindness during stress.",
    durationMin: 5
  });

  return items.slice(0, 4);
}

export async function upsertDailyCarePackage({ userId, needs, reason }) {
  if (!needs.length) return null;

  const dateKey = getDateKey();
  const items = buildItemsFromNeeds(needs);

  return CarePackage.findOneAndUpdate(
    { userId, dateKey },
    {
      userId,
      dateKey,
      reason: reason || `Detected needs: ${needs.join(", ")}`,
      items
    },
    { upsert: true, new: true }
  );
}
