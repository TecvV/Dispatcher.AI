import { env } from "../config/env.js";
import { User } from "../models/User.js";

export async function getValidGoogleAccessToken(user, options = {}) {
  const forceRefresh = Boolean(options?.forceRefresh);
  const integration = user.integrations?.googleCalendar || {};
  const accessToken = integration.accessToken || "";
  const refreshToken = integration.refreshToken || "";
  const expiresAt = integration.expiresAt ? new Date(integration.expiresAt) : null;

  const stillValid =
    !forceRefresh &&
    accessToken &&
    (!expiresAt || expiresAt.getTime() > Date.now() + 60 * 1000);
  if (stillValid) return accessToken;

  if (!refreshToken) return "";
  if (!env.googleOAuth.clientId || !env.googleOAuth.clientSecret) return "";

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleOAuth.clientId,
      client_secret: env.googleOAuth.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }).toString()
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return "";
  }

  const nextExpiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null;
  await User.findByIdAndUpdate(user._id, {
    $set: {
      "integrations.googleCalendar.accessToken": data.access_token,
      "integrations.googleCalendar.expiresAt": nextExpiresAt
    }
  });

  return data.access_token;
}
