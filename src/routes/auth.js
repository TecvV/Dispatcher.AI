import { Router } from "express";
import crypto from "crypto";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, issueToken, verifyPassword } from "../services/authService.js";
import { sendSystemEmail } from "../services/emailService.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function isValidEmail(email = "") {
  return EMAIL_RE.test(String(email).trim());
}

function isStrongPassword(password = "") {
  const value = String(password || "");
  if (value.length < 8) return false;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSpecial = /[^A-Za-z0-9]/.test(value);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function buildResetLink(req, { email, rawToken }) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host");
  const base = `${proto}://${host}`;
  const params = new URLSearchParams({
    email: String(email || ""),
    token: String(rawToken || "")
  });
  return `${base}/reset-password?${params.toString()}`;
}

async function issuePasswordResetEmail(req, user) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpiresAt = expiresAt;
  await user.save();

  const resetLink = buildResetLink(req, { email: user.email, rawToken });
  await sendSystemEmail({
    to: user.email,
    subject: "Dispatcher.AI password reset link",
    text:
      `Hi ${user.name || ""},\n\n` +
      `Use this link to set a new password:\n${resetLink}\n\n` +
      `This link expires in 30 minutes.\n\n` +
      `If you did not request this, you can ignore this email.\n\n` +
      `- Dispatcher.AI`
  });
}

router.post("/signup", async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!isStrongPassword(password)) {
      return res
        .status(400)
        .json({ error: "Password must be 8+ chars and include uppercase, lowercase, number, and special character." });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Email already exists." });

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: String(phone || "").trim(),
      passwordHash: hashPassword(password),
      authProvider: "manual"
    });

    const token = issueToken(user._id);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || ""
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    if (!isValidEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const token = issueToken(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || ""
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "Email is required." });
    if (!isValidEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });

    const user = await User.findOne({ email });
    const done = {
      ok: true,
      message: "If an account exists and is eligible, a password reset link has been emailed."
    };
    if (!user) return res.json(done);

    const provider = String(user.authProvider || "manual").toLowerCase();
    if (provider === "google") {
      return res.json({
        ok: true,
        message: "This account uses Google Sign-In. Please continue with Google."
      });
    }

    await issuePasswordResetEmail(req, user);

    return res.json({
      ok: true,
      message: "Password reset link sent to your email."
    });
  } catch (err) {
    next(err);
  }
});

router.post("/change-password-email", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const provider = String(user.authProvider || "manual").toLowerCase();
    if (provider === "google") {
      return res.status(400).json({
        error: "This account uses Google Sign-In. Password email reset is not applicable."
      });
    }

    const email = String(user.email || "").toLowerCase().trim();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: "A valid account email is required." });
    }

    await issuePasswordResetEmail(req, user);

    return res.json({
      ok: true,
      message: "Password reset link sent to your email."
    });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password/validate", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    const rawToken = String(req.body?.token || "").trim();
    if (!email || !rawToken) return res.status(400).json({ error: "email and token are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid or expired reset link." });
    const tokenHash = hashResetToken(rawToken);
    const valid =
      String(user.passwordResetTokenHash || "") === tokenHash &&
      user.passwordResetExpiresAt &&
      new Date(user.passwordResetExpiresAt).getTime() > Date.now();
    if (!valid) return res.status(400).json({ error: "Invalid or expired reset link." });

    return res.json({ ok: true, valid: true });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password/complete", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    const rawToken = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    if (!email || !rawToken || !newPassword) {
      return res.status(400).json({ error: "email, token, and newPassword are required" });
    }
    if (!isStrongPassword(newPassword)) {
      return res
        .status(400)
        .json({ error: "Password must be 8+ chars and include uppercase, lowercase, number, and special character." });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid or expired reset link." });
    const tokenHash = hashResetToken(rawToken);
    const valid =
      String(user.passwordResetTokenHash || "") === tokenHash &&
      user.passwordResetExpiresAt &&
      new Date(user.passwordResetExpiresAt).getTime() > Date.now();
    if (!valid) return res.status(400).json({ error: "Invalid or expired reset link." });

    user.passwordHash = hashPassword(newPassword);
    user.authProvider = "manual";
    user.passwordResetTokenHash = "";
    user.passwordResetExpiresAt = null;
    await user.save();

    return res.json({ ok: true, message: "Password has been reset successfully. Please login." });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone || ""
    }
  });
});

export default router;
