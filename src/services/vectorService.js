import { QdrantClient } from "qdrant-client";
import dotenv from "dotenv";
dotenv.config();

let qdrant;
const COLLECTION = process.env.QDRANT_COLLECTION_NAME || "news_articles";

export async function initVector() {
  if (qdrant) return qdrant;
  const url = process.env.QDRANT_URL || "http://localhost:6333";
  const apiKey = process.env.QDRANT_API_KEY || undefined;
  qdrant = new QdrantClient({ url, apiKey });
  // ensure collection exists; best to create with proper vector_size on ingest
  return qdrant;
}

/**
 * upsertDocuments: docs -> [{id, vector, payload:{text, title, url}}]
 */
export async function upsertDocuments(points = []) {
  await initVector();
  // points is an array of {id, vector, payload}
  await qdrant.upsert({
    collection_name: COLLECTION,
    points,
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
    with_payload: true
  });
  // resp is array of {id, score, payload}
  return resp;
}
