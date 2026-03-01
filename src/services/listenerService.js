import { Listener } from "../models/Listener.js";
import { ListenerMatch } from "../models/ListenerMatch.js";
import { summarizeForListener } from "./llm.js";

function scoreListener(listener, desiredTopics, language) {
  const specialtyOverlap = listener.specialties.filter((s) => desiredTopics.includes(s)).length;
  const languageBonus = listener.languages.includes(language) ? 1 : 0;
  return specialtyOverlap * 2 + languageBonus + listener.avgRating / 5;
}

export async function matchListener({ userId, message, emotion, needs, language }) {
  const available = await Listener.find({ isAvailable: true }).limit(100);
  if (!available.length) return null;

  const scored = available
    .map((l) => ({
      listener: l,
      score: scoreListener(l, needs, language || "en")
    }))
    .sort((a, b) => b.score - a.score);

  const winner = scored[0]?.listener;
  if (!winner) return null;

  const summary = await summarizeForListener({ message, emotion, needs });

  const match = await ListenerMatch.create({
    userId,
    listenerId: winner._id,
    summary,
    emotionalState: emotion,
    topics: needs,
    status: "initiated"
  });

  return { match, listener: winner };
}
