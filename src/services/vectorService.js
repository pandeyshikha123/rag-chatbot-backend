// src/services/vectorService.js
import dotenv from "dotenv";
dotenv.config();

import { QdrantClient } from "@qdrant/js-client-rest";

let qdrant;
const COLLECTION = process.env.QDRANT_COLLECTION_NAME || "news_articles";

export async function initVector() {
  if (qdrant) return qdrant;
  const url = process.env.QDRANT_URL || "http://localhost:6333";
  const apiKey = process.env.QDRANT_API_KEY || undefined;
  // QdrantClient accepts { url, apiKey }
  qdrant = new QdrantClient({ url, apiKey });
  // Note: you can create collection here if needed (see Qdrant docs)
  return qdrant;
}

/**
 * upsertDocuments: points -> [{id, vector, payload:{text, title, url}}]
 */
export async function upsertDocuments(points = []) {
  await initVector();
  if (!points.length) return;
  await qdrant.upsert({
    collection_name: COLLECTION,
    points: points,
  });
}

/**
 * Search returns array of {id, score, payload}
 */
export async function vectorSearch(vector, top = 5) {
  await initVector();
  const resp = await qdrant.search({
    collection_name: COLLECTION,
    vector,
    limit: top,
    with_payload: true,
  });
  return resp;
}
