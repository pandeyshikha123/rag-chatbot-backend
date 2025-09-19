
// src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import searchRouter from "./routes/search.js";


console.log("[app.js] start loading app routes (logging enabled)");

const app = express();

// --- Explicit CORS config ---
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: false,
  })
);

// --- Generic preflight handler ---
// avoids path-to-regexp '*' parsing errors on Render
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header(
      "Access-Control-Allow-Origin",
      FRONTEND_ORIGIN === "*" ? "*" : FRONTEND_ORIGIN
    );
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    return res.sendStatus(204);
  }
  return next();
});

app.use(express.json());
app.use(morgan("dev"));

// attach search router
app.use("/api/search", searchRouter);

// Health check
app.get("/healthz", (req, res) => {
  console.log("[/healthz] request from", req.ip);
  res.json({ status: "ok", time: new Date().toISOString() });
});

// ------------------------------
// Helper utilities
// ------------------------------
function makeSessionId() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

function tryAppendCache(sessionId, message) {
  import("./services/cacheService.js")
    .then((cacheMod) => {
      if (cacheMod?.cacheAppendMessage) {
        const p = cacheMod.cacheAppendMessage(sessionId, message);
        const timeout = new Promise((_, rej) =>
          setTimeout(() => rej(new Error("cache timeout")), 2000)
        );
        Promise.race([p, timeout]).catch((err) => {
          console.warn(
            "[cache] append failed or timed out:",
            err?.message || err
          );
        });
      }
    })
    .catch((err) => {
      console.warn("[cache] import failed:", err?.message || err);
    });
}

// ------------------------------
// Session creation
// ------------------------------
app.post("/api/session", (req, res) => {
  console.log("[/api/session] incoming POST", {
    ip: req.ip,
    bodySample: req.body ? Object.keys(req.body).slice(0, 5) : null,
  });
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

// ------------------------------
// Chat message handling
// ------------------------------
app.post("/api/chat/message", async (req, res) => {
  console.log("[/api/chat/message] incoming POST", {
    ip: req.ip,
    body: req.body,
  });
  try {
    const { sessionId, message, k } = req.body || {};
    if (!sessionId || typeof message === "undefined") {
      console.log("[/api/chat/message] bad request");
      return res
        .status(400)
        .json({ error: "sessionId and message required" });
    }

    // non-blocking cache append (user message)
    tryAppendCache(sessionId, {
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    });

    // -------------------
    // Tokenize helper
    function tokenize(text) {
      if (!text) return [];
      return String(text).toLowerCase().split(/\W+/).filter(Boolean);
    }
    const qTokens = tokenize(message);

    // -------------------
    // Attempt to load corpus texts for keyword check
    let docTexts = [];
    try {
      const vs = await import("./services/vectorService.js");
      if (vs?._getAllDocs) {
        docTexts = (await vs._getAllDocs()).map((d) => d.text || "");
      } else {
        const fs = await import("fs/promises");
        const raw = await fs.readFile("./data/vector_store.json", "utf8").catch(() => null);
        if (raw) {
          const arr = JSON.parse(raw);
          const parsed = Array.isArray(arr) ? arr : arr?.points || [];
          docTexts = parsed.map((x) => x.text || x.payload?.text || "");
        }
      }
    } catch {
      docTexts = [];
    }

    // -------------------
    // Keyword check
    let docsWithToken = 0;
    if (docTexts.length > 0 && qTokens.length > 0) {
      for (const dt of docTexts) {
        const lower = String(dt || "").toLowerCase();
        if (qTokens.some((t) => t && lower.includes(t))) {
          docsWithToken++;
        }
      }
    }

    if (docTexts.length > 0 && docsWithToken === 0) {
      const reply =
        "Hi — I couldn't find any documents that match those words. Try asking about a topic or phrase that appears in the news.";
      tryAppendCache(sessionId, {
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
      });
      return res.json({ reply, docs: [] });
    }

    // -------------------
    // Run vector search
    const topK = Number.isFinite(Number(k))
      ? Math.max(1, Math.min(20, Number(k)))
      : 5;
    let docs = [];
    try {
      const vs = await import("./services/vectorService.js");
      if (vs?.search) {
        docs = await vs.search(message, topK);
      }
    } catch (err) {
      console.warn("[/api/chat/message] search failed:", err?.message || err);
    }

    // -------------------
    // Fallback if no docs
    if (!docs || docs.length === 0) {
      const reply =
        "I couldn't find any documents matching your query. Try a different phrasing.";
      tryAppendCache(sessionId, {
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
      });
      return res.json({ reply, docs: [] });
    }

    // -------------------
    // Format reply
    let reply = `I searched my documents and found ${docs.length} result(s):\n\n`;
    docs.forEach((d, i) => {
      const title = d.meta?.title || d.meta?.original?.title || "Untitled";
      const url = d.meta?.url || d.meta?.original?.url || null;
      const snippet = (d.text || "").replace(/\s+/g, " ").trim().slice(0, 280);
      reply += `${i + 1}. ${title}${url ? " - " + url : ""}\n   ${snippet}\n\n`;
    });
    reply +=
      "If you'd like, ask me to summarize a specific document or expand on any item above.\n\nReferences:\n";
    docs.forEach((d) => {
      const title = d.meta?.title || d.meta?.original?.title || "Untitled";
      const url = d.meta?.url || d.meta?.original?.url || "#";
      reply += `• ${title} — ${url}\n`;
    });

    tryAppendCache(sessionId, {
      role: "assistant",
      content: reply,
      createdAt: new Date().toISOString(),
      docs,
    });

    console.log("[/api/chat/message] responding", {
      sessionId,
      docsCount: docs.length,
    });
    return res.json({ reply, docs });
  } catch (err) {
    console.error("[/api/chat/message] error:", err);
    res.status(500).json({ error: "failed to process message" });
  }
});

console.log("[app.js] (logging) routes loaded");
export default app;
