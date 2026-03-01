import crypto from "crypto";

function secret() {
  return process.env.AUTH_SECRET || "dev_only_change_me";
}

export function createOAuthState(userId) {
  const payload = {
    sub: String(userId),
    exp: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomBytes(8).toString("hex")
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function parseOAuthState(state) {
  if (!state || !state.includes(".")) return null;
  const [b64, sig] = state.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(b64).digest("base64url");
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  if (!payload.sub || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}
