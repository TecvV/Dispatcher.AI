import { Router } from "express";
import { CheckInTask } from "../models/CheckInTask.js";
import { CarePackage } from "../models/CarePackage.js";
import { InsightReport } from "../models/InsightReport.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { generateWeeklyInsightForUser } from "../services/insightService.js";
import { processDueCheckIns } from "../services/checkinService.js";
import { createGroundingCalendarEvent } from "../services/calendarService.js";
import { generateReportsForUser, getLatestReports } from "../services/reportService.js";
import { getValidGoogleAccessToken } from "../services/googleTokenService.js";

const router = Router();
router.use(requireAuth);

router.get("/me/checkins", async (req, res, next) => {
  try {
    const tasks = await CheckInTask.find({ userId: req.user._id }).sort({ scheduledFor: -1 }).limit(20);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

router.get("/me/care-package/today", async (req, res, next) => {
  try {
    const dateKey = new Date().toISOString().slice(0, 10);
    const pkg = await CarePackage.findOne({ userId: req.user._id, dateKey });
    res.json(pkg || null);
  } catch (err) {
    next(err);
  }
});

router.post("/me/insight/generate", async (req, res, next) => {
  try {
    const report = await generateWeeklyInsightForUser(req.user._id);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

router.get("/me/insights", async (req, res, next) => {
  try {
    const reports = await InsightReport.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(12);
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

router.post("/me/insight/schedule-grounding", async (req, res, next) => {
  try {
    const { weekday, hour } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.preferences?.calendarOptIn) {
      return res.status(400).json({ error: "Calendar opt-in is disabled for this user." });
    }
    const googleAccessToken = await getValidGoogleAccessToken(user);

    const result = await createGroundingCalendarEvent({
      accessToken: googleAccessToken,
      calendarId: user.integrations?.googleCalendar?.calendarId || "primary",
      weekday: Number.isInteger(weekday) ? weekday : 4,
      hour: Number.isInteger(hour) ? hour : 18,
      timezone: user.timezone || "UTC"
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/run-checkins", async (req, res, next) => {
  try {
    const processed = await processDueCheckIns();
    res.json({ processed });
  } catch (err) {
    next(err);
  }
});

router.post("/me/reports/generate", async (req, res, next) => {
  try {
    const reports = await generateReportsForUser(req.user._id);
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

router.get("/me/reports", async (req, res, next) => {
  try {
    const reports = await getLatestReports(req.user._id);
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

export default router;
