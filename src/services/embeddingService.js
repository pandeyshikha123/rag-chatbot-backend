// src/services/embeddingService.js
// Embedding service with OpenAI primary path and local fallback.
// Exports: getEmbedding(text), batchEmbeddings(texts)

import OpenAI from "openai";

/** ---- Local fallback embedding implementation ----
 * Very small, deterministic embedding generator used when OpenAI is unavailable.
 * - Tokenizes text on non-word characters
 * - Maps tokens to indices via a rolling hash
 * - Accumulates token counts into a fixed-dim vector (D)
 * - L2-normalizes before returning
 */
function localTextToVector(text, D = 512) {
  const vec = new Float32Array(D);
  if (!text) {
    // return zero vector (normalized to avoid div by zero)
    vec[0] = 1.0;
    return Array.from(vec);
  }
  const s = String(text).toLowerCase();
  // simple tokenization
  const tokens = s.split(/\\W+/).filter(Boolean);
  for (const t of tokens) {
    // rolling hash for token -> index
    let h = 2166136261 >>> 0;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const idx = h % D;
    vec[idx] = vec[idx] + 1.0; // count
  }
  // L2 normalize
  let norm = 0.0;
  for (let i = 0; i < D; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm || 1.0);
  for (let i = 0; i < D; i++) vec[i] = vec[i] / norm;
  return Array.from(vec);
}

/** ---- OpenAI client helper (lazy) ---- */
function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/** ---- Primary single embedding function ---- */
export async function getEmbedding(text, options = {}) {
  const client = getOpenAIClient();
  const model = options.model || "text-embedding-3-small";
  if (client) {
    try {
      const resp = await client.embeddings.create({ model, input: String(text || "") });
      const emb = resp?.data?.[0]?.embedding;
      if (Array.isArray(emb) && emb.length > 0) return emb;
      // fallthrough to local fallback if response malformed
      console.warn("[embeddingService] OpenAI returned no embedding, falling back to local generator");
    } catch (err) {
      // log the error and fall back
      console.warn("[embeddingService] OpenAI embedding failed — falling back to local. Error:", err?.message || err);
    }
  }
  // local fallback
  return localTextToVector(text, options.dim || 512);
}

/** ---- Batch embeddings (tries OpenAI batch then falls back per-item) ---- */
export async function batchEmbeddings(texts = [], options = {}) {
  if (!Array.isArray(texts)) throw new Error("batchEmbeddings expects an array of strings");
  const client = getOpenAIClient();
  const model = options.model || "text-embedding-3-small";
  if (client && texts.length > 0) {
    try {
      const resp = await client.embeddings.create({ model, input: texts });
      if (resp?.data && Array.isArray(resp.data) && resp.data.length === texts.length) {
        return resp.data.map((it) => it.embedding);
      } else {
        console.warn("[embeddingService] OpenAI batch returned unexpected shape, falling back to local for remaining items");
      }
    } catch (err) {
      console.warn("[embeddingService] OpenAI batch failed — falling back to local. Error:", err?.message || err);
    }
  }
  // Fallback: compute local embeddings for each text
  return texts.map((t) => localTextToVector(t, options.dim || 512));
}

export default { getEmbedding, batchEmbeddings };
