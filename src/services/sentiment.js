const NEGATIVE_TERMS = ["stressed", "anxious", "panic", "overwhelmed", "sad", "depressed", "tired", "grief"];
const POSITIVE_TERMS = ["calm", "good", "grateful", "happy", "better", "relaxed"];
const CRISIS_TERMS = [
  "suicide",
  "kill myself",
  "end my life",
  "self harm",
  "hurt myself",
  "no reason to live"
];

export function analyzeSentiment(text) {
  const t = (text || "").toLowerCase();
  const negativeHits = NEGATIVE_TERMS.filter((w) => t.includes(w)).length;
  const positiveHits = POSITIVE_TERMS.filter((w) => t.includes(w)).length;
  const crisisHits = CRISIS_TERMS.filter((w) => t.includes(w)).length;
  const score = Math.max(-1, Math.min(1, (positiveHits - negativeHits) / 5));
  const emotion = crisisHits > 0 ? "crisis" : negativeHits > positiveHits ? "distressed" : positiveHits > negativeHits ? "uplifted" : "neutral";

  return {
    score,
    emotion,
    crisisScore: crisisHits
  };
}

export function extractNeeds(text) {
  const t = (text || "").toLowerCase();
  const needs = [];
  if (t.includes("sleep")) needs.push("sleep");
  if (t.includes("grief") || t.includes("loss")) needs.push("grief");
  if (t.includes("interview") || t.includes("job")) needs.push("career_stress");
  if (t.includes("postpartum")) needs.push("postpartum_anxiety");
  if (t.includes("anxious") || t.includes("anxiety") || t.includes("panic")) needs.push("anxiety");
  if (t.includes("sad") || t.includes("depress")) needs.push("low_mood");
  return Array.from(new Set(needs));
}

export function asksForHuman(text) {
  const t = (text || "").toLowerCase();
  return t.includes("human") || t.includes("listener") || t.includes("talk to someone") || t.includes("real person");
}

export function wantsEmailDraft(text) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("draft email") ||
    t.includes("write email") ||
    t.includes("send email") ||
    t.includes("send a mail") ||
    t.includes("send mail") ||
    t.includes("mail him") ||
    t.includes("mail her")
  );
}

export function wantsDoctorAppointmentMail(text) {
  const t = (text || "").toLowerCase();
  const hasDoctor = t.includes("doctor") || t.includes("psychiatrist");
  const hasVisit = t.includes("visit") || t.includes("appointment") || t.includes("meet");
  const hasMailIntent = t.includes("mail") || t.includes("email") || t.includes("inform");
  return hasDoctor && hasVisit && hasMailIntent;
}

export function wantsMeetScheduling(text) {
  const t = (text || "").toLowerCase();
  return t.includes("schedule meet") || t.includes("schedule meeting") || t.includes("book meet") || t.includes("google meet");
}

export function inferMeetingMode(text) {
  const t = (text || "").toLowerCase();
  const asksMeeting = t.includes("meeting") || t.includes("meet") || t.includes("appointment") || t.includes("schedule");
  const asksMail = t.includes("mail") || t.includes("email") || t.includes("inform");
  const isGoogleMeet = t.includes("google meet") || t.includes("virtual") || t.includes("video call") || t.includes("online meet");
  const isPhysicalMeet = t.includes("visit") || t.includes("in person") || t.includes("clinic") || t.includes("hospital") || t.includes("check-up");

  if (!asksMeeting && !asksMail) return { kind: "none" };
  if (asksMail && !isGoogleMeet) return { kind: "physical_mail" };
  if (isGoogleMeet) return { kind: "google_meet" };
  if (isPhysicalMeet) return { kind: "physical_mail" };
  if (asksMeeting && !isGoogleMeet && !isPhysicalMeet) return { kind: "ambiguous" };
  return { kind: "none" };
}

export function distressTips(needs = []) {
  const tips = [
    "Try a 4-7-8 breathing cycle for 2 to 5 minutes to slow physical anxiety.",
    "Use a tiny goal: pick one task that takes under 10 minutes and finish only that.",
    "Avoid isolation: send one short check-in text to someone you trust."
  ];
  if (needs.includes("low_mood")) {
    tips.push("When low, favor body-first care: hydration, sunlight, and a short walk.");
  }
  if (needs.includes("career_stress")) {
    tips.push("For interview stress, write 3 key points and rehearse them once, then stop.");
  }
  if (needs.includes("sleep")) {
    tips.push("For tonight, avoid screens 30 minutes before bed and dim room lighting.");
  }
  return tips.slice(0, 4);
}
