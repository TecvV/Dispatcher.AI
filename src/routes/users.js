import { Router } from "express";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.patch("/me/health", async (req, res, next) => {
  try {
    const { sleepHours, restingHeartRate } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          "healthSnapshot.sleepHours": sleepHours,
          "healthSnapshot.restingHeartRate": restingHeartRate,
          "healthSnapshot.updatedAt": new Date()
        }
      },
      { new: true }
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.patch("/me/preferences", async (req, res, next) => {
  try {
    const allowed = ["topics", "language", "calendarOptIn", "healthOptIn"];
    const update = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        update[`preferences.${key}`] = req.body[key];
      }
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.patch("/me/integrations/google-calendar", async (req, res, next) => {
  try {
    const { accessToken, calendarId } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          "integrations.googleCalendar.connected": Boolean(accessToken),
          "integrations.googleCalendar.accessToken": accessToken || "",
          "integrations.googleCalendar.calendarId": calendarId || "primary",
          "preferences.calendarOptIn": Boolean(accessToken)
        }
      },
      { new: true }
    );
    res.json({
      userId: user?._id,
      connected: user?.integrations?.googleCalendar?.connected || false,
      calendarId: user?.integrations?.googleCalendar?.calendarId || "primary"
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me/dashboard", async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      },
      integrations: {
        googleConnected: Boolean(user.integrations?.googleCalendar?.connected && user.integrations?.googleCalendar?.accessToken),
        googleScope: user.integrations?.googleCalendar?.scope || ""
      },
      notifications: user.notifications?.slice(-10).reverse() || []
    });
  } catch (err) {
    next(err);
  }
});

export default router;
