import { CheckInTask } from "../models/CheckInTask.js";
import { User } from "../models/User.js";

function inferTomorrowEvening(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setHours(19, 0, 0, 0);
  return date;
}

export async function maybeScheduleCheckIn({ userId, triggerMemoryId, message }) {
  const lower = message.toLowerCase();
  const shouldSchedule =
    lower.includes("tomorrow") &&
    (lower.includes("stressed") || lower.includes("anxious") || lower.includes("interview") || lower.includes("worried"));

  if (!shouldSchedule) return null;

  return CheckInTask.create({
    userId,
    triggerMemoryId,
    title: "Accountability follow-up",
    prompt: "You mentioned stress about tomorrow. How did it go? I am here if you want to debrief.",
    scheduledFor: inferTomorrowEvening()
  });
}

export async function processDueCheckIns() {
  const now = new Date();
  const due = await CheckInTask.find({
    status: "pending",
    scheduledFor: { $lte: now }
  }).limit(50);

  for (const task of due) {
    await User.findByIdAndUpdate(task.userId, {
      $push: {
        notifications: {
          title: task.title,
          message: task.prompt
        }
      }
    });
    task.status = "sent";
    task.sentAt = new Date();
    await task.save();
  }

  return due.length;
}
