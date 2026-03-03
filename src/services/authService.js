import crypto from "crypto";

const ITERATIONS = 120000;
const KEYLEN = 64;
const DIGEST = "sha512";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret() {
  return process.env.AUTH_SECRET || "dev_only_change_me";
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, hash] = storedHash.split(":");
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

export function issueToken(userId) {
  return issueCustomToken({ sub: String(userId) });
}

export function issueGuestToken(guestId) {
  return issueCustomToken({ sub: String(guestId), guest: true });
}

function issueCustomToken(payloadInput = {}) {
  const payload = {
    ...payloadInput,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [b64, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  if (!payload.sub || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}
