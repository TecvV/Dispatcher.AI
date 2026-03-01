import { User } from "../models/User.js";
import { verifyToken } from "../services/authService.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: "Unauthorized" });

    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
