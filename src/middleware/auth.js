import { User } from "../models/User.js";
import { verifyToken } from "../services/authService.js";
import { ensureGuestSession } from "../services/guestSessionStore.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: "Unauthorized" });

    const isGuestToken = Boolean(payload.guest) || String(payload.sub || "").startsWith("guest_");

    if (isGuestToken) {
      const guestSession = ensureGuestSession(payload.sub, {
        name: payload.name || "Guest User",
        email: payload.email || ""
      });
      req.user = {
        _id: guestSession.user.id,
        id: guestSession.user.id,
        name: guestSession.user.name,
        email: guestSession.user.email,
        isGuest: true,
        guestId: guestSession.id
      };
      return next();
    }

    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
