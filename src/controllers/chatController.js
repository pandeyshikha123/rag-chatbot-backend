import { embedTexts } from "../services/embeddingService.js";
import { vectorSearch } from "../services/vectorService.js";
import { generateAnswer } from "../services/llmService.js";
import { cacheAppendMessage, cacheGetSessionHistory } from "../services/cacheService.js";
import { logger } from "../utils/logger.js";

export const handleMessage = async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) return res.status(400).json({ error: "sessionId and message required" });

  // store user message in cache
  await cacheAppendMessage(sessionId, { role: "user", content: message });

  // 1) Embed query
  const embeddings = await embedTexts([message]); // returns [[...vector...]]
  const vector = embeddings[0];

  // 2) Search top-k contexts from vector DB
  const k = 5;
  const results = await vectorSearch(vector, k);

  // build context text from results payloads
  const contexts = results.map((r, i) => `Passage ${i+1}:\n${r.payload.text}`).join("\n\n");

  // 3) Fetch session history to send as part of prompt (optional)
  const sessionHistory = await cacheGetSessionHistory(sessionId);

  // 4) Compose prompt for LLM
  const prompt = `
You are a news assistant. Use the provided passages from the news corpus to answer user's question. If the passages don't contain the answer, be honest.

User question:
${message}

Passages:
${contexts}

Conversation history:
${sessionHistory.map(h => `${h.role}: ${h.content}`).join("\n")}
`;

  // 5) Call LLM (non-streaming HTTP response)
  const answer = await generateAnswer(prompt, {
    // additional options if needed
    stream: false
  });

  // store assistant reply in cache
  await cacheAppendMessage(sessionId, { role: "assistant", content: answer });

  // optionally also emit via socket if present
  try {
    const io = req.app.get("io");
    if (io) {
      io.to(sessionId).emit("assistant_message", { content: answer });
    }
  } catch (err) {
    logger.warn("Socket emission failed", err);
  }

  res.json({ answer });
};
