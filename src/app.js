// src/app.js — endpoint logging enabled
import express from "express";
import cors from "cors";
import morgan from "morgan";
import searchRouter from "./routes/search.js";


console.log("[app.js] start loading app routes (logging enabled)");

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/api/search", searchRouter);


// Health check
app.get("/healthz", (req, res) => {
  console.log("[/healthz] request from", req.ip);
  res.json({ status: "ok", time: new Date().toISOString() });
});

// simple session id generator (no external deps)
function makeSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function tryAppendCache(sessionId, message) {
  import("./services/cacheService.js")
    .then((cacheMod) => {
      if (cacheMod && cacheMod.cacheAppendMessage) {
        const p = cacheMod.cacheAppendMessage(sessionId, message);
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("cache timeout")), 2000));
        Promise.race([p, timeout]).catch((err) => {
          console.warn("[cache] append failed or timed out:", err && err.message ? err.message : err);
        });
      }
    })
    .catch((err) => {
      console.warn("[cache] import failed:", err && err.message ? err.message : err);
    });
}

// Create a session (returns a sessionId)
app.post("/api/session", (req, res) => {
  console.log("[/api/session] incoming POST", { ip: req.ip, bodySample: req.body ? Object.keys(req.body).slice(0,5) : null });
  try {
    const sessionId = makeSessionId();
    tryAppendCache(sessionId, {
      role: "system",
      content: "session created",
      createdAt: new Date().toISOString(),
    });
    console.log("[/api/session] responding", { sessionId });
    res.json({ sessionId });
  } catch (err) {
    console.error("[/api/session] error:", err);
    res.status(500).json({ error: "failed to create session" });
  }
});

// Send a chat message
app.post("/api/chat/message", (req, res) => {
  console.log("[/api/chat/message] incoming POST", { ip: req.ip, body: req.body });
  try {
    const { sessionId, message } = req.body || {};
    if (!sessionId || !message) {
      console.log("[/api/chat/message] bad request");
      return res.status(400).json({ error: "sessionId and message required" });
    }

    tryAppendCache(sessionId, {
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    });

    const reply = `Echo (mock assistant): "${String(message).slice(0, 200)}"`;

    tryAppendCache(sessionId, {
      role: "assistant",
      content: reply,
      createdAt: new Date().toISOString(),
    });

    console.log("[/api/chat/message] responding", { sessionId, replyPreview: reply.slice(0,60) });
    res.json({ reply });
  } catch (err) {
    console.error("[/api/chat/message] error:", err);
    res.status(500).json({ error: "failed to process message" });
  }
});

console.log("[app.js] (logging) routes loaded");
export default app;
