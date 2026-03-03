import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { DiscordChannel } from "../models/DiscordChannel.js";
import {
  ensureGuestSession,
  addGuestDiscordChannel,
  updateGuestDiscordChannel,
  deleteGuestDiscordChannel
} from "../services/guestSessionStore.js";

const router = Router();

function isGuestRequest(req) {
  const uid = String(req.user?._id || "");
  const gid = String(req.user?.guestId || "");
  return Boolean(req.user?.isGuest) || uid.startsWith("guest_") || gid.startsWith("guest_");
}

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    if (isGuestRequest(req)) {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      return res.json(session.discordChannels || []);
    }

    const items = await DiscordChannel.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    if (isGuestRequest(req) && err?.name === "CastError") {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      return res.json(session.discordChannels || []);
    }
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, webhookUrl, notifyOnCrisis } = req.body;
    if (!name || !webhookUrl) return res.status(400).json({ error: "name and webhookUrl are required" });

    if (isGuestRequest(req)) {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      const normalizedName = String(name || "").trim().toLowerCase();
      const duplicate = (session.discordChannels || []).some(
        (x) => String(x.name || "").trim().toLowerCase() === normalizedName
      );
      if (duplicate) return res.status(409).json({ error: "This Discord channel name already exists." });
      const item = addGuestDiscordChannel(req.user.guestId || req.user._id, {
        name: String(name).trim(),
        webhookUrl: String(webhookUrl).trim(),
        notifyOnCrisis: Boolean(notifyOnCrisis)
      });
      return res.status(201).json(item);
    }

    const item = await DiscordChannel.create({
      userId: req.user._id,
      name: String(name).trim(),
      webhookUrl: String(webhookUrl).trim(),
      notifyOnCrisis: Boolean(notifyOnCrisis)
    });
    res.status(201).json(item);
  } catch (err) {
    if (isGuestRequest(req) && err?.name === "CastError") {
      return res.status(400).json({ error: "Guest Discord channel request was not mapped correctly. Please retry." });
    }
    if (err?.code === 11000) return res.status(409).json({ error: "This Discord channel name already exists." });
    next(err);
  }
});

router.patch("/:channelId", async (req, res, next) => {
  try {
    const { channelId } = req.params;
    const update = {};
    for (const key of ["name", "webhookUrl", "notifyOnCrisis"]) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
    }
    if (Object.prototype.hasOwnProperty.call(update, "name")) update.name = String(update.name || "").trim();
    if (Object.prototype.hasOwnProperty.call(update, "webhookUrl")) update.webhookUrl = String(update.webhookUrl || "").trim();
    if (Object.prototype.hasOwnProperty.call(update, "notifyOnCrisis")) update.notifyOnCrisis = Boolean(update.notifyOnCrisis);

    if (isGuestRequest(req)) {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      if (Object.prototype.hasOwnProperty.call(update, "name")) {
        const normalizedName = String(update.name || "").trim().toLowerCase();
        const duplicate = (session.discordChannels || []).some(
          (x) => String(x._id) !== String(channelId) && String(x.name || "").trim().toLowerCase() === normalizedName
        );
        if (duplicate) return res.status(409).json({ error: "This Discord channel name already exists." });
      }
      const item = updateGuestDiscordChannel(req.user.guestId || req.user._id, channelId, update);
      if (!item) return res.status(404).json({ error: "Discord channel not found." });
      return res.json(item);
    }

    const item = await DiscordChannel.findOneAndUpdate({ _id: channelId, userId: req.user._id }, { $set: update }, { new: true });
    if (!item) return res.status(404).json({ error: "Discord channel not found." });
    res.json(item);
  } catch (err) {
    if (isGuestRequest(req) && err?.name === "CastError") {
      return res.status(400).json({ error: "Invalid guest Discord update request." });
    }
    next(err);
  }
});

router.delete("/:channelId", async (req, res, next) => {
  try {
    const { channelId } = req.params;
    if (isGuestRequest(req)) {
      deleteGuestDiscordChannel(req.user.guestId || req.user._id, channelId);
      return res.json({ ok: true });
    }
    await DiscordChannel.deleteOne({ _id: channelId, userId: req.user._id });
    res.json({ ok: true });
  } catch (err) {
    if (isGuestRequest(req) && err?.name === "CastError") {
      return res.json({ ok: true });
    }
    next(err);
  }
});

export default router;
