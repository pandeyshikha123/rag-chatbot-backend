// src/services/geminiService.js
// Lightweight Gemini/PaLM wrapper using the REST endpoints.
// Exports: generate(prompt, opts), getEmbedding(text), batchEmbeddings(texts)
import dotenv from "dotenv";
dotenv.config();

const PALM_API_KEY = process.env.PALM_API_KEY || process.env.GOOGLE_API_KEY || "";
const DEFAULT_TEXT_MODEL = process.env.PALM_MODEL || "text-bison-001";
const DEFAULT_EMBEDDING_MODEL = process.env.PALM_EMBEDDING_MODEL || "textembedding-gecko-001";

console.log("[geminiService] debug: PALM_API_KEY present:", !!PALM_API_KEY);
console.log("[geminiService] debug: DEFAULT_TEXT_MODEL:", DEFAULT_TEXT_MODEL);
console.log("[geminiService] debug: DEFAULT_EMBEDDING_MODEL:", DEFAULT_EMBEDDING_MODEL);

// helper: ensure fetch present (Node 18+ has global fetch)
let _fetch = globalThis.fetch;
if (!_fetch) {
  try {
    // try dynamic import of node-fetch if not present
    // eslint-disable-next-line node/no-unsupported-features/es-syntax
    const nf = await import("node-fetch");
    _fetch = nf.default ?? nf;
    console.log("[geminiService] using node-fetch polyfill");
  } catch (e) {
    console.warn("[geminiService] fetch not available and node-fetch not installed. Install node-fetch@3 to use Gemini/PaLM REST endpoints.");
    _fetch = null;
  }
}

function makeUrl(path) {
  // Use generativelanguage endpoint
  return `https://generativelanguage.googleapis.com/v1/${path}?key=${encodeURIComponent(PALM_API_KEY)}`;
}

/**
 * generate(prompt, opts)
 * - prompt: string
 * - opts: { model, maxTokens, temperature }
 */
export async function generate(prompt, opts = {}) {
  if (!PALM_API_KEY) throw new Error("PALM_API_KEY not set in environment");
  if (!_fetch) throw new Error("fetch not available. Install node-fetch or run in Node 18+");

  const model = opts.model || DEFAULT_TEXT_MODEL;
  const url = makeUrl(`models/${model}:generate`);

  const body = {
    // simple text prompt usage — the Generative API accepts "prompt" or "input"/"text" depending on version;
    // this structure is robust for common responses.
    prompt: { text: String(prompt || "") },
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.2,
    maxOutputTokens: Number.isFinite(opts.maxTokens) ? opts.maxTokens : 256,
  };

  const resp = await _fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`PaLM generate error ${resp.status}: ${txt}`);
  }

  const j = await resp.json().catch(() => null);
  // Response shapes vary across versions; try several fallbacks:
  // - j.candidates?.[0]?.content
  // - j.output?.[0]?.content?.[0]?.text
  // - j.candidates?.[0]?.output or j.response?.[0]?.candidates
  let out = null;
  if (j) {
    if (Array.isArray(j.candidates) && j.candidates[0] && typeof j.candidates[0].content === "string") {
      out = j.candidates[0].content;
    } else if (Array.isArray(j.candidates) && j.candidates[0] && j.candidates[0].content && typeof j.candidates[0].content === "object") {
      // sometimes content is an object with text field
      out = j.candidates[0].content.text || j.candidates[0].content;
    } else if (Array.isArray(j.output) && j.output[0] && j.output[0].content) {
      // output array variant
      const c = j.output[0].content;
      if (Array.isArray(c)) out = c.map(x => x.text || x).join("\n");
      else out = c.text || String(c);
    } else if (typeof j.output === "string") {
      out = j.output;
    } else if (typeof j.text === "string") {
      out = j.text;
    }
  }
  if (!out) {
    // last resort: stringify the whole response
    out = JSON.stringify(j, null, 2);
  }
  return out;
}

/**
 * getEmbedding(text)
 * - returns an array of floats or throws
 */
export async function getEmbedding(text, opts = {}) {
  if (!PALM_API_KEY) throw new Error("PALM_API_KEY not set in environment");
  if (!_fetch) throw new Error("fetch not available. Install node-fetch or run in Node 18+");

  const model = opts.model || DEFAULT_EMBEDDING_MODEL;
  const url = makeUrl(`models/${model}:embed`);

  const body = { input: String(text || "") };

  const resp = await _fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`PaLM embed error ${resp.status}: ${txt}`);
  }

  const j = await resp.json().catch(() => null);
  // expected shapes:
  // { embedding: { value: [..] } } or { embeddings: [ { embedding: [...] } ] } or { data:[{embedding:[...]}] }
  if (!j) throw new Error("PaLM embed returned empty response");

  if (Array.isArray(j.embeddings) && j.embeddings[0] && Array.isArray(j.embeddings[0].embedding)) {
    return j.embeddings[0].embedding;
  }
  if (j.embedding && Array.isArray(j.embedding?.value)) {
    return j.embedding.value;
  }
  if (Array.isArray(j.data) && j.data[0] && Array.isArray(j.data[0].embedding)) {
    return j.data[0].embedding;
  }
  // some variants
  if (Array.isArray(j.output) && j.output[0] && Array.isArray(j.output[0].embedding)) {
    return j.output[0].embedding;
  }

  // fallback: try to find first array inside object
  const found = findFirstArray(j);
  if (found) return found;
  throw new Error("PaLM embed: unexpected response shape");
}

/** batchEmbeddings(texts) -> returns array of vectors */
export async function batchEmbeddings(texts = [], opts = {}) {
  if (!Array.isArray(texts)) throw new Error("batchEmbeddings expects array");
  // Some PaLM endpoints don't support multi-input embed in one call; call serially but gracefully
  const out = [];
  for (const t of texts) {
    try {
      const e = await getEmbedding(t, opts);
      out.push(e);
    } catch (err) {
      // on error, push a deterministic fallback vector (sha256-based) to keep lengths stable
      console.warn("[geminiService] getEmbedding failed for one item, using fallback:", err && err.message);
      out.push(localDeterministicVector(String(t || ""), opts.dim || 512));
    }
  }
  return out;
}

/** helper: deterministic fallback vector */
import crypto from "crypto";
function localDeterministicVector(text, dim = 512) {
  const hash = crypto.createHash("sha256").update(String(text || "")).digest();
  const v = new Array(dim).fill(0).map((_, i) => {
    const b = hash[i % hash.length];
    return (b / 255) * 2 - 1;
  });
  return v;
}

/** helper: find first numeric array in response object */
function findFirstArray(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === "number") return obj;
  for (const k of Object.keys(obj)) {
    try {
      const v = obj[k];
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") return v;
      if (typeof v === "object") {
        const r = findFirstArray(v);
        if (r) return r;
      }
    } catch (e) {}
  }
  return null;
}

export default { generate, getEmbedding, batchEmbeddings };
