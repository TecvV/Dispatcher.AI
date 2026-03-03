import { api, getToken, setToken } from "./client.js";

const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const nameWrap = document.getElementById("nameWrap");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const toggleLoginPasswordBtn = document.getElementById("toggleLoginPassword");
const submitBtn = document.getElementById("submitBtn");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const googleSignupBtn = document.getElementById("googleSignupBtn");
const guestLoginBtn = document.getElementById("guestLoginBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const guestNoticeDialog = document.getElementById("guestNoticeDialog");
const continueGuestBtn = document.getElementById("continueGuestBtn");
const closeGuestNoticeX = document.getElementById("closeGuestNoticeX");

let mode = "login";
const uiStatus = (main, sub = "", tone = "info") => window.setUIStatus?.(main, sub, tone);
let preserveInitialStatus = false;

if (getToken()) {
  uiStatus("Session found.", "You can login again or continue to dashboard manually.", "ok");
}

const params = new URLSearchParams(window.location.search);
const googleAuthState = params.get("google_auth");
const googleAuthToken = params.get("token");
const googleAuthReason = params.get("reason");
const googleErrorMessage = {
  account_exists:
    "An account with this email already exists. Please login, or use Forgot Password if you do not remember your password.",
  no_account: "No account exists with this email. Please create an account first.",
  invalid_state: "Google auth session expired. Please try again."
};
if (googleAuthState === "success" && googleAuthToken) {
  setToken(googleAuthToken);
  preserveInitialStatus = true;
  uiStatus("Google authentication successful.", "Redirecting to dashboard...", "ok");
  window.history.replaceState({}, "", "/login");
  window.location.href = "/dashboard";
} else if (googleAuthState === "error") {
  preserveInitialStatus = true;
  const reason = decodeURIComponent(String(googleAuthReason || "Unknown OAuth error"));
  const finalReason = googleErrorMessage[reason] || reason;
  uiStatus("Google authentication failed.", finalReason, "error");
  window.history.replaceState({}, "", "/login");
}

function setMode(next, options = {}) {
  const { silent = false } = options;
  mode = next;
  const isSignup = next === "signup";
  nameWrap.style.display = isSignup ? "grid" : "none";
  submitBtn.textContent = isSignup ? "Create Account" : "Login";
  tabLogin.classList.toggle("active", !isSignup);
  tabSignup.classList.toggle("active", isSignup);
  tabLogin.classList.toggle("ghost", isSignup);
  tabSignup.classList.toggle("ghost", !isSignup);
  if (!silent) {
    uiStatus(isSignup ? "Signup mode active." : "Login mode active.", "Enter details to login or sign up.");
  }
}

tabLogin.addEventListener("click", () => setMode("login"));
tabSignup.addEventListener("click", () => setMode("signup"));

submitBtn.addEventListener("click", async () => {
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) throw new Error("Email and password are required.");

    const payload = { email, password };
    let path = "/api/auth/login";
    if (mode === "signup") {
      if (!nameInput.value.trim()) throw new Error("Name is required for first-time signup.");
      payload.name = nameInput.value.trim();
      path = "/api/auth/signup";
    }

    uiStatus(mode === "signup" ? "Creating account..." : "Logging in...", "Please wait.");
    const out = await api(path, { method: "POST", body: JSON.stringify(payload) });
    setToken(out.token);
    uiStatus("Authentication successful.", "Redirecting to dashboard...", "ok");
    window.location.href = "/dashboard";
  } catch (err) {
    uiStatus("Authentication failed.", err.message, "error");
  }
});

async function beginGoogleAuth(intent) {
  try {
    const phase = intent === "signup" ? "Google signup" : "Google login";
    uiStatus(`${phase}...`, "Redirecting to Google account selection.");
    const out = await api(`/api/oauth/google/login-url?intent=${encodeURIComponent(intent)}`);
    window.location.href = out.authUrl;
  } catch (err) {
    uiStatus("Google connect failed.", err.message, "error");
  }
}

if (googleLoginBtn) {
  googleLoginBtn.addEventListener("click", async () => {
    try {
      await beginGoogleAuth("login");
    } catch (err) {
      uiStatus("Google connect failed.", err.message, "error");
    }
  });
}

if (googleSignupBtn) {
  googleSignupBtn.addEventListener("click", async () => {
    try {
      await beginGoogleAuth("signup");
    } catch (err) {
      uiStatus("Google connect failed.", err.message, "error");
    }
  });
}

if (guestLoginBtn) {
  guestLoginBtn.addEventListener("click", async () => {
    try {
      uiStatus("Starting guest session...", "No account required.");
      const out = await api("/api/auth/guest-login", {
        method: "POST",
        body: JSON.stringify({})
      });
      setToken(out.token);
      uiStatus("Guest session ready.", "Please read the demo-mode notice.", "ok");
      if (guestNoticeDialog && typeof guestNoticeDialog.showModal === "function") {
        guestNoticeDialog.showModal();
      } else {
        window.alert(
          "Guest Mode (Demo): Your activity is available only during this session and will be deleted after logout."
        );
        window.location.href = "/dashboard";
      }
    } catch (err) {
      uiStatus("Guest login failed.", err.message, "error");
    }
  });
}

if (continueGuestBtn) {
  continueGuestBtn.addEventListener("click", () => {
    if (guestNoticeDialog?.open) guestNoticeDialog.close();
    window.location.href = "/dashboard";
  });
}

if (closeGuestNoticeX) {
  closeGuestNoticeX.addEventListener("click", () => {
    if (guestNoticeDialog?.open) guestNoticeDialog.close();
    window.location.href = "/dashboard";
  });
}

if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", async () => {
    try {
      const email = emailInput.value.trim();
      if (!email) {
        throw new Error("Enter your email first, then click Forgot Password.");
      }
      uiStatus("Processing forgot password...", "Please wait.");
      const out = await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      uiStatus("Password recovery", out.message || "If eligible, a password reset link has been emailed.", "ok");
    } catch (err) {
      uiStatus("Forgot password failed.", err.message, "error");
    }
  });
}

if (toggleLoginPasswordBtn && passwordInput) {
  toggleLoginPasswordBtn.addEventListener("click", () => {
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    toggleLoginPasswordBtn.setAttribute("aria-pressed", String(!showing));
    toggleLoginPasswordBtn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    toggleLoginPasswordBtn.title = showing ? "Show password" : "Hide password";
    toggleLoginPasswordBtn.textContent = showing ? "👁" : "🙈";
  });
}

function onAuthEnter(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    submitBtn.click();
  }
}

nameInput.addEventListener("keydown", onAuthEnter);
emailInput.addEventListener("keydown", onAuthEnter);
passwordInput.addEventListener("keydown", onAuthEnter);

if (!preserveInitialStatus) {
  uiStatus("Enter details to login or sign up.", "Ready.");
}
setMode("login", { silent: preserveInitialStatus });
