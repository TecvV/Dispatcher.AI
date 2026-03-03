import { Router } from "express";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { ensureGuestSession } from "../services/guestSessionStore.js";

const router = Router();

function isGuestRequest(req) {
  const uid = String(req.user?._id || "");
  const gid = String(req.user?.guestId || "");
  return Boolean(req.user?.isGuest) || uid.startsWith("guest_") || gid.startsWith("guest_");
}

router.use(requireAuth);

router.patch("/me/health", async (req, res, next) => {
  try {
    if (isGuestRequest(req)) {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      const sleepHours = req.body?.sleepHours;
      const restingHeartRate = req.body?.restingHeartRate;
      session.user.healthSnapshot = {
        ...(session.user.healthSnapshot || {}),
        sleepHours,
        restingHeartRate,
        updatedAt: new Date().toISOString()
      };
      return res.json({
        _id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        healthSnapshot: session.user.healthSnapshot
      });
    }

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
    const allowed = ["topics", "language", "familyGreetingStyle", "calendarOptIn", "healthOptIn"];

    if (isGuestRequest(req)) {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      session.user.preferences = session.user.preferences || {};
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
          if (key === "familyGreetingStyle") {
            const v = String(req.body[key] || "auto").trim().toLowerCase();
            session.user.preferences[key] = ["auto", "namaste", "hello"].includes(v) ? v : "auto";
          } else {
            session.user.preferences[key] = req.body[key];
          }
        }
      }
      return res.json({
        _id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        preferences: session.user.preferences
      });
    }

    const update = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        if (key === "familyGreetingStyle") {
          const v = String(req.body[key] || "auto").trim().toLowerCase();
          update[`preferences.${key}`] = ["auto", "namaste", "hello"].includes(v) ? v : "auto";
        } else {
          update[`preferences.${key}`] = req.body[key];
        }
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
    if (isGuestRequest(req)) {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      const { accessToken, calendarId } = req.body;
      session.user.integrations = session.user.integrations || {};
      session.user.integrations.googleCalendar = {
        connected: Boolean(accessToken),
        accessToken: accessToken || "",
        calendarId: calendarId || "primary"
      };
      session.user.preferences = session.user.preferences || {};
      session.user.preferences.calendarOptIn = Boolean(accessToken);
      return res.json({
        userId: session.user.id,
        connected: session.user.integrations.googleCalendar.connected,
        calendarId: session.user.integrations.googleCalendar.calendarId
      });
    }

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
    if (isGuestRequest(req)) {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      const google = session.user?.integrations?.googleCalendar || {};
      return res.json({
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          preferences: {
            familyGreetingStyle: session.user?.preferences?.familyGreetingStyle || "auto"
          }
        },
        integrations: {
          googleConnected: Boolean(google.connected && google.accessToken),
          googleScope: google.scope || ""
        },
        notifications: (session.notifications || []).slice(-10).reverse()
      });
    }

    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferences: {
          familyGreetingStyle: user.preferences?.familyGreetingStyle || "auto"
        }
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
