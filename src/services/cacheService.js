import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

let client;

export async function initCache() {
  if (client) return client;
  client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    password: process.env.REDIS_PASSWORD || undefined
  });
  client.on("error", (err) => console.error("Redis Client Error", err));
  await client.connect();
  return client;
}

const TTL = process.env.SESSION_TTL ? parseInt(process.env.SESSION_TTL) : 60 * 60 * 24 * 7; // default 7 days

export async function cacheAppendMessage(sessionId, message) {
  await initCache();
  const key = `session:${sessionId}:history`;
  await client.rPush(key, JSON.stringify(message));
  await client.expire(key, TTL);
}

export async function cacheGetSessionHistory(sessionId) {
  await initCache();
  const key = `session:${sessionId}:history`;
  const list = await client.lRange(key, 0, -1);
  return list.map((s) => JSON.parse(s));
}

export async function cacheClearSession(sessionId) {
  await initCache();
  const key = `session:${sessionId}:history`;
  await client.del(key);
}
