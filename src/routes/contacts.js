import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Contact } from "../models/Contact.js";
import {
  ensureGuestSession,
  addGuestContact,
  updateGuestContact,
  deleteGuestContact
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
      return res.json(session.contacts || []);
    }

    const contacts = await Contact.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(contacts);
  } catch (err) {
    if (isGuestRequest(req) && err?.name === "CastError") {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      return res.json(session.contacts || []);
    }
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, email, phone, type, notifyOnCrisis, telegramChatId, discordWebhookUrl } = req.body;
    if (!name || !email) return res.status(400).json({ error: "name and email are required" });
    const normalizedType = String(type || "other").trim().toLowerCase() || "other";

    if (isGuestRequest(req)) {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      const normalizedEmail = String(email || "").toLowerCase().trim();
      const exists = (session.contacts || []).some((c) => String(c.email || "").toLowerCase() === normalizedEmail);
      if (exists) return res.status(409).json({ error: "This contact email already exists." });
      const item = addGuestContact(req.user.guestId || req.user._id, {
        name: name.trim(),
        email: normalizedEmail,
        phone: String(phone || "").trim(),
        type: normalizedType,
        notifyOnCrisis: Boolean(notifyOnCrisis),
        telegramChatId: String(telegramChatId || "").trim(),
        discordWebhookUrl: String(discordWebhookUrl || "").trim()
      });
      return res.status(201).json(item);
    }

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
    if (isGuestRequest(req) && err?.name === "CastError") {
      return res.status(400).json({ error: "Guest contact request was not mapped correctly. Please retry." });
    }
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

    if (isGuestRequest(req)) {
      const session = ensureGuestSession(req.user.guestId || req.user._id, {
        name: req.user.name,
        email: req.user.email
      });
      if (Object.prototype.hasOwnProperty.call(update, "email")) {
        const normalizedEmail = String(update.email || "").toLowerCase().trim();
        const duplicate = (session.contacts || []).some(
          (c) => String(c._id) !== String(contactId) && String(c.email || "").toLowerCase() === normalizedEmail
        );
        if (duplicate) return res.status(409).json({ error: "This contact email already exists." });
      }
      const item = updateGuestContact(req.user.guestId || req.user._id, contactId, update);
      if (!item) return res.status(404).json({ error: "Contact not found." });
      return res.json(item);
    }

    const contact = await Contact.findOneAndUpdate({ _id: contactId, userId: req.user._id }, { $set: update }, { new: true });
    if (!contact) return res.status(404).json({ error: "Contact not found." });
    res.json(contact);
  } catch (err) {
    if (isGuestRequest(req) && err?.name === "CastError") {
      return res.status(400).json({ error: "Invalid guest contact update request." });
    }
    next(err);
  }
});

router.delete("/:contactId", async (req, res, next) => {
  try {
    const { contactId } = req.params;
    if (isGuestRequest(req)) {
      deleteGuestContact(req.user.guestId || req.user._id, contactId);
      return res.json({ ok: true });
    }
    await Contact.deleteOne({ _id: contactId, userId: req.user._id });
    res.json({ ok: true });
  } catch (err) {
    if (isGuestRequest(req) && err?.name === "CastError") {
      return res.json({ ok: true });
    }
    next(err);
  }
});

export default router;
