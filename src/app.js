
// src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import searchRouter from "./routes/search.js";

console.log("[app.js] start loading app routes (logging enabled)");

const app = express();

// --- Explicit CORS config ---
// Allow the frontend origin. For quick testing you can allow all origins.
// In production prefer to limit to the real frontend origin.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

app.use(cors({
  origin: FRONTEND_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: false, // set true only if you need cookies/auth
}));

// Make sure OPTIONS preflight is handled for all routes
app.options("*", cors({
  origin: FRONTEND_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));

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

// Send a chat message — only return doc results when there are keyword matches
app.post("/api/chat/message", async (req, res) => {
  console.log("[/api/chat/message] incoming POST", { ip: req.ip, body: req.body });
  try {
    const { sessionId, message, k } = req.body || {};
    if (!sessionId || typeof message === "undefined") {
      console.log("[/api/chat/message] bad request");
      return res.status(400).json({ error: "sessionId and message required" });
    }

    // non-blocking cache append
    tryAppendCache(sessionId, {
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    });

    // helper: tokenize text into normalized tokens
    function tokenize(text) {
      if (!text) return [];
      return String(text)
        .toLowerCase()
        .split(/\W+/)
        .filter(Boolean);
    }

    // load document texts for quick keyword-check (try to use persisted in-memory store if present)
    // We'll attempt to import vectorService to read in-memory/persisted store if it exposes it; if not, we will still call search but avoid returning results with zero keyword overlap.
    let docTexts = [];
    try {
      const vs = await import("./services/vectorService.js");
      // vectorService might export a persisted loader or store; try common fields:
      if (vs && vs._getAllDocs) {
        // custom helper if present
        docTexts = (await vs._getAllDocs()).map(d => String(d.text || ""));
      } else if (vs && vs.loadPersistedStore) {
        const store = await vs.loadPersistedStore(); // optional pattern some projects use
        docTexts = (store || []).map(d => String(d.text || ""));
      } else {
        // fallback: if there is a persisted store file in data/vector_store.json, try reading it
        try {
          const fs = await import("fs/promises");
          const path = "./data/vector_store.json";
          const raw = await fs.readFile(path, "utf8").catch(()=>null);
          if (raw) {
            const parsed = JSON.parse(raw);
            // expected structure: array of { id, vector, text, meta }
            const arr = Array.isArray(parsed) ? parsed : (parsed?.points || parsed?.items || []);
            docTexts = (arr || []).map(x => x.text || x.payload?.text || "");
          }
        } catch (e) {
          docTexts = [];
        }
      }
    } catch (e) {
      // ignore — unavailable; we'll still perform search but will apply keyword checking on returned docs
      docTexts = [];
    }

    const qTokens = tokenize(message);
    // Quick keyword-check across all documents: compute number of docs that contain at least one token
    let docsWithToken = 0;
    if (docTexts.length > 0 && qTokens.length > 0) {
      for (const dt of docTexts) {
        const lower = String(dt || "").toLowerCase();
        if (qTokens.some(t => t && lower.includes(t))) {
          docsWithToken++;
        }
      }
    }

    // If we have zero docs that contain any of the query tokens, return a friendly fallback
    if (docTexts.length > 0 && docsWithToken === 0) {
      const reply = `Hi — I couldn't find any documents that match those words. Try asking about a topic or phrase that appears in the news".`;
      tryAppendCache(sessionId, { role: "assistant", content: reply, createdAt: new Date().toISOString() });
      console.log("[/api/chat/message] no keyword matches — returning friendly fallback", { sessionId });
      return res.json({ reply, docs: [] });
    }

    // If we don't have local docTexts to pre-check, or docsWithToken > 0, run the search.
    const topK = Number.isFinite(Number(k)) ? Math.max(1, Math.min(20, Number(k))) : 5;
    let docs = [];
    try {
      const vs = await import("./services/vectorService.js");
      if (vs && typeof vs.search === "function") {
        docs = await vs.search(message, topK);
      } else {
        docs = [];
      }
    } catch (err) {
      console.warn("[/api/chat/message] search failed:", err && err.message ? err.message : err);
      docs = [];
    }

    // If we did not have docTexts earlier, attempt to do keyword check on search results:
    const keywordMatchesInResults = docs.filter(d => {
      const txt = String(d.text || d.meta?.title || "");
      const lower = txt.toLowerCase();
      return qTokens.some(t => t && lower.includes(t));
    });

    if (docTexts.length === 0 && keywordMatchesInResults.length === 0) {
      // no local corpus available and search results include zero docs with token overlap -> fallback
      const reply = `I couldn't find any documents matching those words. Try different phrasing or ask about a specific topic ).`;
      tryAppendCache(sessionId, { role: "assistant", content: reply, createdAt: new Date().toISOString() });
      return res.json({ reply, docs: [] });
    }

    // Build pretty reply when we do have docs to show
    if (!docs || docs.length === 0) {
      const reply = "I couldn't find any documents matching your query. Try a different phrasing.";
      tryAppendCache(sessionId, { role: "assistant", content: reply, createdAt: new Date().toISOString() });
      return res.json({ reply, docs: [] });
    }

    // Format reply
    let reply = `I searched my documents and found ${docs.length} result(s):\n\n`;
    docs.forEach((d,i) => {
      const title = d.meta?.title || d.meta?.original?.title || "Untitled";
      const url = d.meta?.url || d.meta?.original?.url || null;
      const snippet = (d.text || "").replace(/\s+/g," ").trim().slice(0,280);
      reply += `${i+1}. ${title}${url ? " - " + url : ""}\n   ${snippet}\n\n`;
    });
    reply += `If you'd like, ask me to summarize a specific document or expand on any item above.\n\nReferences:\n`;
    docs.forEach(d => {
      const title = d.meta?.title || d.meta?.original?.title || "Untitled";
      const url = d.meta?.url || d.meta?.original?.url || "#";
      reply += `• ${title} — ${url}\n`;
    });

    tryAppendCache(sessionId, { role: "assistant", content: reply, createdAt: new Date().toISOString(), docs });
    console.log("[/api/chat/message] responding", { sessionId, docsCount: docs.length });
    return res.json({ reply, docs });

  } catch (err) {
    console.error("[/api/chat/message] error:", err);
    res.status(500).json({ error: "failed to process message" });
  }
});



console.log("[app.js] (logging) routes loaded");
export default app;
