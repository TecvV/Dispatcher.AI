import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Contact } from "../models/Contact.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const contacts = await Contact.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(contacts);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, email, phone, type, notifyOnCrisis, telegramChatId, discordWebhookUrl } = req.body;
    if (!name || !email) return res.status(400).json({ error: "name and email are required" });
    const normalizedType = String(type || "other").trim().toLowerCase() || "other";
    const contact = await Contact.create({
      userId: req.user._id,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: String(phone || "").trim(),
      type: normalizedType,
      notifyOnCrisis: Boolean(notifyOnCrisis),
      telegramChatId: String(telegramChatId || "").trim(),
      discordWebhookUrl: String(discordWebhookUrl || "").trim()
    });
    res.status(201).json(contact);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "This contact email already exists." });
    next(err);
  }
});

router.patch("/:contactId", async (req, res, next) => {
  try {
    const { contactId } = req.params;
    const update = {};
    for (const key of ["name", "email", "phone", "type", "notifyOnCrisis", "telegramChatId", "discordWebhookUrl"]) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
    }
    if (update.email) update.email = String(update.email).toLowerCase().trim();
    if (Object.prototype.hasOwnProperty.call(update, "type")) {
      update.type = String(update.type || "other").trim().toLowerCase() || "other";
    }
    if (Object.prototype.hasOwnProperty.call(update, "telegramChatId")) {
      update.telegramChatId = String(update.telegramChatId || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(update, "phone")) {
      update.phone = String(update.phone || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(update, "discordWebhookUrl")) {
      update.discordWebhookUrl = String(update.discordWebhookUrl || "").trim();
    }
    const contact = await Contact.findOneAndUpdate({ _id: contactId, userId: req.user._id }, { $set: update }, { new: true });
    if (!contact) return res.status(404).json({ error: "Contact not found." });
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

router.delete("/:contactId", async (req, res, next) => {
  try {
    const { contactId } = req.params;
    await Contact.deleteOne({ _id: contactId, userId: req.user._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
