const TOKEN_KEY = "wca_token";

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 35000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...options, headers, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data.error ||
        data.reason ||
        data.details?.reason ||
        data.message ||
        `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s. Please retry.`);
    }
    if (err instanceof TypeError) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const origin = typeof window !== "undefined" ? window.location.origin : "the app URL";
      throw new Error(
        offline
          ? "Network appears offline. Check internet and retry."
          : `Could not reach server. Ensure app is running on ${origin} and retry.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function requireSession() {
  const token = getToken();
  if (!token) {
    window.location.href = "/login.html";
    return null;
  }
  try {
    const data = await api("/api/auth/me");
    return data.user;
  } catch (err) {
    clearToken();
    window.location.href = "/login.html";
    return null;
  }
}
