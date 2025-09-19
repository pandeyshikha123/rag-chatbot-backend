
// src/services/embeddingService.js
// Tries Gemini/PaLM first, then OpenAI, then local fallback (deterministic vectors).

import gemini from "./geminiService.js";
import OpenAIClient from "openai"; // dynamic import below would also work
import crypto from "crypto";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

// Local deterministic fallback: hash text and produce fixed-length vector
function localEmbed(text, dim = 512) {
  // Use sha256 and expand into floats between -1..1
  const hash = crypto.createHash("sha256").update(String(text || "")).digest();
  const vec = new Array(dim).fill(0).map((_, i) => {
    const b = hash[i % hash.length];
    // map byte 0-255 to -1..1
    return (b / 255) * 2 - 1;
  });
  return vec;
}

async function tryOpenAI(text) {
  if (!OPENAI_KEY) throw new Error("OpenAI key missing");
  // Create client lazily to avoid top-level errors
  const client = new OpenAIClient({ apiKey: OPENAI_KEY });
  try {
    const resp = await client.embeddings.create({ model: OPENAI_EMBEDDING_MODEL, input: text });
    return resp.data?.[0]?.embedding || null;
  } catch (err) {
    throw err;
  }
}

/** Get embedding with fallbacks */
export async function getEmbedding(text, opts = { dim: 512 }) {
  // 1) Try Gemini
  try {
    const emb = await geminiService.getEmbedding(String(text || ""));
    if (Array.isArray(emb) && emb.length > 0) return emb;
  } catch (e) {
    // console.warn("Gemini embedding failed:", e && e.message ? e.message : e);
  }

  // 2) Try OpenAI
  try {
    const emb = await tryOpenAI(String(text || ""));
    if (Array.isArray(emb) && emb.length > 0) return emb;
  } catch (e) {
    // console.warn("OpenAI embedding failed:", e && e.message ? e.message : e);
  }

  // 3) Local fallback
  return localEmbed(String(text || ""), opts.dim || 512);
}

/** Batch embeddings */
export async function batchEmbeddings(texts = [], opts = { dim: 512 }) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  // Try Gemini batch method (if available)
  try {
    if (gemini && typeof gemini.batchEmbeddings === "function") {
      const res = await gemini.batchEmbeddings(texts);
      // If gemini returned array of vectors (some might be null)
      if (Array.isArray(res) && res.length === texts.length) {
        return res.map((r, i) => (Array.isArray(r) ? r : localEmbed(texts[i], opts.dim)));
      }
    }
  } catch (e) {
    // ignore and continue to try OpenAI
  }

  // Try OpenAI batch (serializing to single calls is fine for small sets)
  try {
    const results = [];
    for (const t of texts) {
      try {
        const r = await tryOpenAI(t);
        if (Array.isArray(r)) results.push(r);
        else results.push(localEmbed(t, opts.dim));
      } catch (e) {
        results.push(localEmbed(t, opts.dim));
      }
    }
    return results;
  } catch (e) {
    // final fallback: local for all
    return texts.map((t) => localEmbed(t, opts.dim));
  }
}

export default { getEmbedding, batchEmbeddings };
