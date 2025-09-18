// src/services/vectorService.js
// Vector service with Qdrant primary path and in-memory + on-disk fallback.
// Exports: initVector(), upsertDocuments(docs), search(queryText, k), clearMemoryStore()

import fs from "fs/promises";
import path from "path";
import { batchEmbeddings } from "./embeddingService.js";

const PERSIST_PATH = path.resolve("./data/vector_store.json");

let qdrantClient = null;
let qdrantCollection = process.env.QDRANT_COLLECTION || "news";
let inMemoryStore = []; // array of { id, vector, text, meta }
let DIM = 512; // default dim for fallback embeddings
let usingQdrant = false;

/** Persist store to disk (safe, best-effort) */
async function saveStoreToDisk() {
  try {
    const toSave = inMemoryStore.map((e) => ({
      id: e.id,
      // store vector only if present (may be null)
      vector: e.vector || null,
      text: e.text,
      meta: e.meta || {},
    }));
    await fs.mkdir(path.dirname(PERSIST_PATH), { recursive: true });
    await fs.writeFile(PERSIST_PATH, JSON.stringify(toSave, null, 2), "utf8");
    console.info(`[vectorService] persisted inMemoryStore -> ${PERSIST_PATH}`);
  } catch (err) {
    console.warn("[vectorService] failed to persist store to disk:", err?.message || err);
  }
}

/** Load store from disk (if exists) */
async function loadStoreFromDisk() {
  try {
    const raw = await fs.readFile(PERSIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      inMemoryStore = parsed.map((e) => ({
        id: e.id,
        vector: e.vector || null,
        text: e.text,
        meta: e.meta || {},
      }));
      console.info(`[vectorService] loaded ${inMemoryStore.length} docs from ${PERSIST_PATH}`);
    } else {
      console.warn("[vectorService] persisted store malformed, ignoring");
    }
  } catch (err) {
    // file might not exist — that's OK
    if (err.code !== "ENOENT") {
      console.warn("[vectorService] error reading persisted store:", err?.message || err);
    } else {
      console.info(`[vectorService] no persisted store found at ${PERSIST_PATH}`);
    }
  }
}

/** try to init qdrant client (non-blocking) */
export async function initVector() {
  // First try to load persisted on-disk store so searches in new processes work
  await loadStoreFromDisk();

  try {
    const { QdrantClient } = await import("@qdrant/js-client-rest");
    const url = process.env.QDRANT_URL || "http://localhost:6333";
    const apiKey = process.env.QDRANT_API_KEY || "";
    qdrantClient = new QdrantClient({ url, apiKey });

    try {
      const collResp = await qdrantClient.getCollections();
      const collList = (collResp?.collections || []).map((c) => c.name);
      if (!collList.includes(qdrantCollection)) {
        await qdrantClient.createCollection({
          collection_name: qdrantCollection,
          vectors: { size: DIM, distance: "Cosine" },
        });
      }
      usingQdrant = true;
      console.info("[vectorService] Qdrant initialized at", url);
    } catch (err) {
      console.warn(
        "[vectorService] Qdrant connection test failed - falling back to in-memory:",
        err?.message || err
      );
      qdrantClient = null;
      usingQdrant = false;
    }
  } catch (err) {
    console.info("[vectorService] Qdrant client not installed/failed to import, using in-memory store.");
    qdrantClient = null;
    usingQdrant = false;
  }
}

/** Upsert documents: [{ id, text, meta }] */
export async function upsertDocuments(docs = []) {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  const texts = docs.map((d) => d.text || "");

  // try to compute embeddings; if it fails, proceed with nulls
  let embs = [];
  try {
    embs = await batchEmbeddings(texts, { dim: DIM });
  } catch (err) {
    console.warn("[vectorService] embedding generation failed, continuing without vectors:", err?.message || err);
    embs = texts.map(() => null);
  }

  // If Qdrant available, try to upsert there first; catch and fall back to memory
  if (usingQdrant && qdrantClient) {
    try {
      const points = docs.map((d, i) => ({
        id: d.id,
        vector: embs[i] || Array(DIM).fill(0),
        payload: { text: d.text, meta: d.meta || {} },
      }));
      await qdrantClient.upsert({ collection_name: qdrantCollection, points });
      console.info("[vectorService] upserted", points.length, "points to Qdrant");
      // Still save a local mirror for convenience
      // Mirror to inMemoryStore and persist to disk
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        const vec = embs[i] || null;
        const idx = inMemoryStore.findIndex((x) => x.id === d.id);
        const entry = { id: d.id, vector: vec, text: d.text, meta: d.meta || {} };
        if (idx >= 0) inMemoryStore[idx] = entry;
        else inMemoryStore.push(entry);
      }
      await saveStoreToDisk();
      return docs.map((d) => ({ id: d.id }));
    } catch (err) {
      console.warn("[vectorService] Qdrant upsert failed, falling back to in-memory:", err?.message || err);
      usingQdrant = false;
      qdrantClient = null;
      // fall-through to in-memory path below
    }
  }

  // In-memory upsert (always save docs, even if vectors missing)
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    const vec = embs[i] || null; // allow null vectors
    const idx = inMemoryStore.findIndex((x) => x.id === d.id);
    const entry = { id: d.id, vector: vec, text: d.text, meta: d.meta || {} };
    if (idx >= 0) inMemoryStore[idx] = entry;
    else inMemoryStore.push(entry);
  }

  // persist to disk so new processes can read it
  await saveStoreToDisk();

  console.info("[vectorService] upserted", docs.length, "docs to in-memory store (even if no vectors)");
  return docs.map((d) => ({ id: d.id }));
}

/** Cosine similarity helper */
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function norm(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s || 1.0);
}

/** Tokenize and normalize */
function tokenize(text) {
  if (!text) return [];
  return String(text).toLowerCase().split(/\W+/).filter(Boolean);
}

/** Keyword overlap */
function keywordScore(queryTokens, docText) {
  if (!queryTokens || queryTokens.length === 0) return 0;
  const lowerText = (docText || "").toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (!t) continue;
    if (lowerText.includes(t)) score += 1;
  }
  return score;
}

/** Search top-k nearest neighbors for queryText */
export async function search(queryText, k = 5) {
  if (!queryText) return [];

  const qTokens = tokenize(queryText);
  console.log("[debug] query tokens:", qTokens);

  let qEmb = null;
  try {
    qEmb = (await batchEmbeddings([queryText], { dim: DIM }).then((r) => r[0])) || null;
  } catch {
    qEmb = null;
  }

  const results = [];

  for (const e of inMemoryStore) {
    // search in title + text
    const fullText = [e.meta?.title, e.text].filter(Boolean).join(" ");
    const ks = keywordScore(qTokens, fullText);
    let score = ks;

    if (qEmb && e.vector && e.vector.length === qEmb.length) {
      const cos = dot(qEmb, e.vector) / (norm(qEmb) * norm(e.vector) || 1);
      const bonus = ((cos + 1) / 2) * 0.5; // small cosine bonus
      score += bonus;
    }

    results.push({ id: e.id, score, text: e.text, meta: e.meta });

    // Debug log per doc
    console.log(
      `[debug] doc id=${e.id}, ks=${ks}, finalScore=${score.toFixed(4)}, text="${(fullText || "")
        .slice(0, 120)
        .replace(/\s+/g, " ")}..."`
    );
  }

  if (results.length === 0) {
    console.log("[debug] no docs found at all in memory store");
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, k);
}

/** Helper to clear in-memory store and persisted file */
export async function clearMemoryStore() {
  inMemoryStore = [];
  try {
    await fs.unlink(PERSIST_PATH).catch(() => {});
    console.info("[vectorService] cleared persisted store file");
  } catch (err) {
    console.warn("[vectorService] failed to clear persisted store file:", err?.message || err);
  }
}

export default { initVector, upsertDocuments, search, clearMemoryStore };
