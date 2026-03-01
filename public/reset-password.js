import { api } from "./client.js";

const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const showNewPassword = document.getElementById("showNewPassword");
const showConfirmPassword = document.getElementById("showConfirmPassword");
const resetBtn = document.getElementById("resetBtn");
const uiStatus = (main, sub = "", tone = "info") => window.setUIStatus?.(main, sub, tone);

const params = new URLSearchParams(window.location.search);
const token = String(params.get("token") || "").trim();
const email = String(params.get("email") || "").toLowerCase().trim();
let linkValid = false;

function isStrongPassword(password = "") {
  const value = String(password || "");
  if (value.length < 8) return false;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSpecial = /[^A-Za-z0-9]/.test(value);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

async function validateLink() {
  if (!token || !email) {
    uiStatus("Invalid reset link.", "Missing token or email.", "error");
    resetBtn.disabled = true;
    return;
  }
  try {
    uiStatus("Validating reset link...", "Please wait.");
    await api("/api/auth/reset-password/validate", {
      method: "POST",
      body: JSON.stringify({ token, email })
    });
    linkValid = true;
    resetBtn.disabled = false;
    uiStatus("Reset link verified.", "Enter a new password and submit.", "ok");
  } catch (err) {
    uiStatus("Reset link invalid.", err.message || "Invalid or expired reset link.", "error");
    resetBtn.disabled = true;
  }
}

resetBtn.addEventListener("click", async () => {
  try {
    if (!linkValid) throw new Error("Reset link is invalid or expired.");
    const newPassword = String(newPasswordInput.value || "");
    const confirmPassword = String(confirmPasswordInput.value || "");
    if (!newPassword || !confirmPassword) throw new Error("Please enter and confirm your new password.");
    if (!isStrongPassword(newPassword)) {
      throw new Error("Password must be 8+ chars and include uppercase, lowercase, number, and special character.");
    }
    if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");

    uiStatus("Resetting password...", "Applying your new password.");
    await api("/api/auth/reset-password/complete", {
      method: "POST",
      body: JSON.stringify({ token, email, newPassword })
    });
    uiStatus("Password reset successful.", "Redirecting to login...", "ok");
    setTimeout(() => {
      window.location.href = "/login";
    }, 900);
  } catch (err) {
    uiStatus("Password reset failed.", err.message, "error");
  }
});

function onEnter(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    resetBtn.click();
  }
}

newPasswordInput.addEventListener("keydown", onEnter);
confirmPasswordInput.addEventListener("keydown", onEnter);

if (showNewPassword) {
  showNewPassword.addEventListener("change", () => {
    newPasswordInput.type = showNewPassword.checked ? "text" : "password";
  });
}

if (showConfirmPassword) {
  showConfirmPassword.addEventListener("change", () => {
    confirmPasswordInput.type = showConfirmPassword.checked ? "text" : "password";
  });
}

validateLink();
