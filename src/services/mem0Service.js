import MemoryClient from "mem0ai";
import { env } from "../config/env.js";

let memoryClient = null;

function getClient() {
  if (!env.mem0.enabled || !env.mem0.apiKey) return null;
  if (!memoryClient) {
    memoryClient = new MemoryClient({
      apiKey: env.mem0.apiKey
    });
  }
  return memoryClient;
}

export async function fetchMem0Context({ userId, query }) {
  const client = getClient();
  if (!client) return [];
  try {
    const results = await client.search(query, { user_id: String(userId) });
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

export async function addMem0Memory({ userId, text }) {
  const client = getClient();
  if (!client || !text) return { ok: false, skipped: true };
  try {
    await client.add(
      [
        {
          role: "user",
          content: text
        }
      ],
      { user_id: String(userId) }
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function clearMem0UserMemory({ userId }) {
  const client = getClient();
  if (!client) return { ok: false, skipped: true, reason: "mem0_disabled_or_missing_key" };
  try {
    await client.deleteAll({ user_id: String(userId) });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "mem0_delete_failed" };
  }
}
