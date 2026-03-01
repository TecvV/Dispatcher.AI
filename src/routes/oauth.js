import { Router } from "express";
import crypto from "crypto";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { hashPassword, issueToken } from "../services/authService.js";
import { createOAuthState, parseOAuthState } from "../services/oauthState.js";

const router = Router();

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/meetings.space.readonly"
];
const GOOGLE_AUTH_SCOPES = ["openid", "email", "profile"];

function stateSecret() {
  return process.env.AUTH_SECRET || "dev_only_change_me";
}

function signFlowState(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function parseFlowState(state) {
  if (!state || !String(state).includes(".")) return null;
  const [b64, sig] = String(state).split(".");
  const expected = crypto.createHmac("sha256", stateSecret()).update(b64).digest("base64url");
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

router.get("/google/url", requireAuth, (req, res) => {
  const { clientId, redirectUri } = env.googleOAuth;
  if (!clientId || !redirectUri) {
    return res.status(400).json({ error: "Google OAuth is not configured." });
  }

  const state = createOAuthState(req.user._id);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: GOOGLE_SCOPES.join(" "),
    state
  });

  res.json({
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  });
});

router.get("/google/login-url", (req, res) => {
  const { clientId, authRedirectUri } = env.googleOAuth;
  if (!clientId || !authRedirectUri) {
    return res.status(400).json({ error: "Google OAuth is not configured." });
  }

  const requestedIntent = String(req.query?.intent || "login").toLowerCase();
  const intent = requestedIntent === "signup" ? "signup" : "login";

  const state = signFlowState({
    flow: "auth_login",
    intent,
    nonce: crypto.randomBytes(8).toString("hex"),
    exp: Date.now() + 10 * 60 * 1000
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: authRedirectUri,
    response_type: "code",
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    scope: GOOGLE_AUTH_SCOPES.join(" "),
    state
  });

  res.json({
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  });
});

router.get("/google/login/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/login?google_auth=error&reason=${encodeURIComponent(String(error))}`);

    const parsed = parseFlowState(String(state || ""));
    if (!parsed || parsed.flow !== "auth_login") {
      return res.redirect("/login?google_auth=error&reason=invalid_state");
    }
    const flowIntent = String(parsed.intent || "login").toLowerCase() === "signup" ? "signup" : "login";

    const { clientId, clientSecret, authRedirectUri } = env.googleOAuth;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code || ""),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: authRedirectUri,
        grant_type: "authorization_code"
      }).toString()
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.redirect(
        `/login?google_auth=error&reason=${encodeURIComponent(tokenJson.error_description || tokenJson.error || "token_exchange_failed")}`
      );
    }

    const accessToken = String(tokenJson.access_token || "");
    if (!accessToken) {
      return res.redirect("/login?google_auth=error&reason=missing_access_token");
    }

    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const profile = await profileRes.json();
    if (!profileRes.ok) {
      return res.redirect(
        `/login?google_auth=error&reason=${encodeURIComponent(profile.error_description || profile.error || "profile_fetch_failed")}`
      );
    }

    const email = String(profile.email || "").toLowerCase().trim();
    const name = String(profile.name || profile.given_name || "").trim();
    if (!email || !name) {
      return res.redirect("/login?google_auth=error&reason=missing_profile_fields");
    }

    let user = await User.findOne({ email });
    if (flowIntent === "signup") {
      if (user) {
        return res.redirect("/login?google_auth=error&reason=account_exists");
      }
      user = await User.create({
        name,
        email,
        phone: "",
        passwordHash: hashPassword(crypto.randomUUID()),
        authProvider: "google"
      });
    } else {
      if (!user) {
        return res.redirect("/login?google_auth=error&reason=no_account");
      }
    }

    const appToken = issueToken(user._id);
    return res.redirect(`/login?google_auth=success&token=${encodeURIComponent(appToken)}`);
  } catch (err) {
    return res.redirect(`/login?google_auth=error&reason=${encodeURIComponent(err.message || "unknown_error")}`);
  }
});

router.get("/google/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/dashboard?google_oauth=error&reason=${encodeURIComponent(String(error))}`);
    const parsed = parseOAuthState(String(state || ""));
    if (!parsed) return res.redirect("/dashboard?google_oauth=error&reason=invalid_state");

    const { clientId, clientSecret, redirectUri } = env.googleOAuth;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code || ""),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      }).toString()
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.redirect(
        `/dashboard?google_oauth=error&reason=${encodeURIComponent(tokenJson.error_description || tokenJson.error || "token_exchange_failed")}`
      );
    }

    const existingUser = await User.findById(parsed.sub);
    const existingRefresh = existingUser?.integrations?.googleCalendar?.refreshToken || "";

    await User.findByIdAndUpdate(parsed.sub, {
      $set: {
        "integrations.googleCalendar.connected": true,
        "integrations.googleCalendar.accessToken": tokenJson.access_token || "",
        "integrations.googleCalendar.refreshToken": tokenJson.refresh_token || existingRefresh,
        "integrations.googleCalendar.scope": tokenJson.scope || "",
        "integrations.googleCalendar.expiresAt": tokenJson.expires_in
          ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000)
          : null,
        "preferences.calendarOptIn": true
      }
    });

    res.redirect("/dashboard?google_oauth=success");
  } catch (err) {
    res.redirect(`/dashboard?google_oauth=error&reason=${encodeURIComponent(err.message || "unknown_error")}`);
  }
});

router.post("/google/disconnect", requireAuth, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        "integrations.googleCalendar.connected": false,
        "integrations.googleCalendar.accessToken": "",
        "integrations.googleCalendar.refreshToken": "",
        "integrations.googleCalendar.scope": "",
        "integrations.googleCalendar.expiresAt": null,
        "preferences.calendarOptIn": false
      }
    });
    res.json({ ok: true, disconnected: true });
  } catch (err) {
    next(err);
  }
});

export default router;
