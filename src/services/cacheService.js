// src/services/cacheService.js
// Resilient cache service: tries Redis once, otherwise cleanly falls back to memory without spamming errors.

import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

let client = null;
let useMemory = false;
let triedRedis = false; // ensure we don't spam retries
const memoryStore = new Map();
const DEFAULT_TTL = process.env.SESSION_TTL ? parseInt(process.env.SESSION_TTL) : 60 * 60 * 24 * 7;

async function tryConnectRedis() {
  if (useMemory || triedRedis) return null; // skip repeated attempts
  triedRedis = true;

  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const password = process.env.REDIS_PASSWORD || undefined;

  client = createClient({ url, password });

  client.on("error", (err) => {
    // silence ECONNREFUSED noise
    if (err.code === "ECONNREFUSED") return;
    console.error("[cacheService] Redis error:", err.message);
  });

  try {
    await client.connect();
    console.log("[cacheService] ✅ Connected to Redis at", url);
    return client;
  } catch (err) {
    console.warn("[cacheService] ❌ Redis unavailable, using in-memory store. Error:", err.message);
    useMemory = true;
    client = null;
    return null;
  }
}

export async function initCache() {
  await tryConnectRedis();
}

function keyForSession(sessionId) {
  return `session:${sessionId}:history`;
}

export async function cacheAppendMessage(sessionId, message) {
  if (!sessionId) throw new Error("cacheAppendMessage requires sessionId");
  if (!message) return;

  if (!useMemory && client) {
    try {
      const key = keyForSession(sessionId);
      await client.rPush(key, JSON.stringify(message));
      await client.expire(key, DEFAULT_TTL);
      return;
    } catch (err) {
      console.warn("[cacheService] Redis append failed, switching to memory. Error:", err.message);
      useMemory = true;
    }
  }

  const arr = memoryStore.get(sessionId) || [];
  arr.push(message);
  memoryStore.set(sessionId, arr);
}

export async function cacheGetSessionHistory(sessionId) {
  if (!sessionId) return [];
  if (!useMemory && client) {
    try {
      const key = keyForSession(sessionId);
      const list = await client.lRange(key, 0, -1);
      return list.map((s) => JSON.parse(s));
    } catch (err) {
      console.warn("[cacheService] Redis get failed, using memory. Error:", err.message);
      useMemory = true;
    }
  }
  return memoryStore.get(sessionId) || [];
}

export async function cacheClearSession(sessionId) {
  if (!sessionId) return;
  if (!useMemory && client) {
    try {
      const key = keyForSession(sessionId);
      await client.del(key);
      return;
    } catch (err) {
      console.warn("[cacheService] Redis del failed, clearing memory. Error:", err.message);
      useMemory = true;
    }
  }
  memoryStore.delete(sessionId);
}
