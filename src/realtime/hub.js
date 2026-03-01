import { WebSocketServer } from "ws";
import { verifyToken } from "../services/authService.js";
import { User } from "../models/User.js";

let wss = null;
const userSockets = new Map();
const chatSubscribers = new Map();

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // ignore send failure
  }
}

function addSocketToUser(userId, ws) {
  const key = String(userId);
  const set = userSockets.get(key) || new Set();
  set.add(ws);
  userSockets.set(key, set);
}

function removeSocketFromUser(userId, ws) {
  const key = String(userId);
  const set = userSockets.get(key);
  if (!set) return;
  set.delete(ws);
  if (!set.size) userSockets.delete(key);
}

function subscribeToChat(bookingId, ws) {
  const key = String(bookingId);
  const set = chatSubscribers.get(key) || new Set();
  set.add(ws);
  chatSubscribers.set(key, set);
}

function unsubscribeFromChat(bookingId, ws) {
  const key = String(bookingId);
  const set = chatSubscribers.get(key);
  if (!set) return;
  set.delete(ws);
  if (!set.size) chatSubscribers.delete(key);
}

function detachSocketEverywhere(ws) {
  for (const [, set] of chatSubscribers) {
    set.delete(ws);
  }
  for (const [key, set] of chatSubscribers) {
    if (!set.size) chatSubscribers.delete(key);
  }
}

export function initRealtime(server) {
  if (wss) return wss;
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const token = String(url.searchParams.get("token") || "");
      const payload = verifyToken(token);
      if (!payload?.sub) {
        ws.close(1008, "Unauthorized");
        return;
      }
      const user = await User.findById(payload.sub).select("_id").lean();
      if (!user?._id) {
        ws.close(1008, "Unauthorized");
        return;
      }

      ws.userId = String(user._id);
      addSocketToUser(ws.userId, ws);
      safeSend(ws, { type: "ws_ready", payload: { userId: ws.userId } });

      ws.on("message", (raw) => {
        let msg = null;
        try {
          msg = JSON.parse(String(raw || ""));
        } catch {
          msg = null;
        }
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "subscribe_chat" && msg.bookingId) {
          subscribeToChat(msg.bookingId, ws);
          safeSend(ws, { type: "chat_subscribed", payload: { bookingId: String(msg.bookingId) } });
          return;
        }
        if (msg.type === "unsubscribe_chat" && msg.bookingId) {
          unsubscribeFromChat(msg.bookingId, ws);
          safeSend(ws, { type: "chat_unsubscribed", payload: { bookingId: String(msg.bookingId) } });
          return;
        }
        if (msg.type === "ping") {
          safeSend(ws, { type: "pong", payload: { ts: Date.now() } });
        }
      });

      ws.on("close", () => {
        removeSocketFromUser(ws.userId, ws);
        detachSocketEverywhere(ws);
      });
    } catch {
      try {
        ws.close(1011, "Socket init error");
      } catch {
        // ignore
      }
    }
  });

  return wss;
}

export function emitToUsers(userIds, event, payload = {}) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const uniq = [...new Set(ids.filter(Boolean).map((x) => String(x)))];
  for (const id of uniq) {
    const set = userSockets.get(id);
    if (!set || !set.size) continue;
    for (const ws of set) {
      safeSend(ws, { type: event, payload });
    }
  }
}

export function emitToChat(bookingId, event, payload = {}, userIds = []) {
  const key = String(bookingId);
  const set = chatSubscribers.get(key);
  if (set && set.size) {
    for (const ws of set) {
      safeSend(ws, { type: event, payload: { ...payload, bookingId: key } });
    }
  }
  if (Array.isArray(userIds) && userIds.length) {
    emitToUsers(
      userIds,
      event,
      { ...payload, bookingId: key }
    );
  }
}

export function emitGlobal(event, payload = {}) {
  for (const [, set] of userSockets) {
    for (const ws of set) {
      safeSend(ws, { type: event, payload });
    }
  }
}
