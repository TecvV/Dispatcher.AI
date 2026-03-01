function ensureWidget() {
  const el = document.getElementById("liveStatusBox");
  if (!el) return null;
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
  if (!el.classList.contains("live-status-floating")) {
    el.classList.add("live-status-floating");
  }

  let fab = document.getElementById("liveStatusFab");
  let badge = document.getElementById("liveStatusFabBadge");
  if (!fab) {
    fab = document.createElement("button");
    fab.id = "liveStatusFab";
    fab.type = "button";
    fab.className = "live-status-fab";
    fab.setAttribute("aria-label", "Open live status");
    fab.innerHTML = `<span class="live-status-fab-dot" aria-hidden="true"></span><span class="live-status-fab-text">Live</span><span id="liveStatusFabBadge" class="live-status-fab-badge" style="display:none">0</span>`;
    document.body.appendChild(fab);
    badge = fab.querySelector("#liveStatusFabBadge");
    fab.addEventListener("click", () => {
      const open = el.classList.toggle("live-status-open");
      if (open) {
        unreadCount = 0;
        setUnread(0);
      }
    });
  }

  const setUnread = (count) => {
    if (!badge) return;
    const n = Number(count || 0);
    if (n <= 0) {
      badge.style.display = "none";
      badge.textContent = "0";
      return;
    }
    badge.style.display = "inline-flex";
    badge.textContent = String(Math.min(99, n));
  };

  return {
    root: el,
    line1: el.querySelector("[data-live-main]"),
    line2: el.querySelector("[data-live-sub]"),
    fab,
    setUnread
  };
}

let hideTimer = null;
let unreadCount = 0;

function setStatus(main, sub = "", tone = "info") {
  const widget = ensureWidget();
  if (!widget) return;
  widget.line1.textContent = main || "Enter details to login or sign up.";
  widget.line2.textContent = sub || "";
  widget.root.classList.remove("offline", "ok");
  if (tone === "error") widget.root.classList.add("offline");
  if (tone === "ok") widget.root.classList.add("ok");

  widget.root.classList.add("live-status-open");
  unreadCount = 0;
  widget.setUnread(0);

  widget.fab?.classList.remove("tone-info", "tone-ok", "tone-error");
  widget.fab?.classList.add(tone === "error" ? "tone-error" : tone === "ok" ? "tone-ok" : "tone-info");

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    widget.root.classList.remove("live-status-open");
  }, 4600);
}

window.setUIStatus = setStatus;
window.setUIStatus("Enter details to login or sign up.", "Ready.", "info");
