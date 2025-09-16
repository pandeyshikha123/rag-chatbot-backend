import { v4 as uuidv4 } from "uuid";
import { cacheAppendMessage, cacheGetSessionHistory, cacheClearSession } from "../services/cacheService.js";

export const createSession = async (req, res) => {
  const sessionId = uuidv4();
  // initialize session with an empty system message
  await cacheAppendMessage(sessionId, { role: "system", content: "You are a helpful news assistant." });
  res.json({ sessionId });
};

export const getSessionHistory = async (req, res) => {
  const { sessionId } = req.params;
  const history = await cacheGetSessionHistory(sessionId);
  res.json({ sessionId, history });
};

export const clearSession = async (req, res) => {
  const { sessionId } = req.params;
  await cacheClearSession(sessionId);
  res.json({ ok: true });
};
