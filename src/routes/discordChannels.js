import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { DiscordChannel } from "../models/DiscordChannel.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const items = await DiscordChannel.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, webhookUrl, notifyOnCrisis } = req.body;
    if (!name || !webhookUrl) return res.status(400).json({ error: "name and webhookUrl are required" });
    const item = await DiscordChannel.create({
      userId: req.user._id,
      name: String(name).trim(),
      webhookUrl: String(webhookUrl).trim(),
      notifyOnCrisis: Boolean(notifyOnCrisis)
    });
    res.status(201).json(item);
  } catch (err) {
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
    const item = await DiscordChannel.findOneAndUpdate({ _id: channelId, userId: req.user._id }, { $set: update }, { new: true });
    if (!item) return res.status(404).json({ error: "Discord channel not found." });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.delete("/:channelId", async (req, res, next) => {
  try {
    const { channelId } = req.params;
    await DiscordChannel.deleteOne({ _id: channelId, userId: req.user._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
