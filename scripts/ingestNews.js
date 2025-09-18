/*
  scripts/ingestNews.js
  - Reads data/news_articles.json
  - Initializes vector store (Qdrant or in-memory)
  - Upserts articles in batches using vectorService.upsertDocuments
*/
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { initVector, upsertDocuments } from "../src/services/vectorService.js";

const DATA_PATH = path.resolve("./data/news_articles.json");
const BATCH_SIZE = 32;

async function loadArticles() {
  const raw = await fs.readFile(DATA_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.articles)) return parsed.articles;
  throw new Error("news_articles.json format not recognized. Expecting an array.");
}

function makeDocFromArticle(a) {
  const id = a.id || uuidv4();
  const title = a.title || a.headline || "";
  const content = a.text || a.content || a.body || a.summary || "";
const text = `${title}\n\n${content}`.trim();

  const meta = {
    title,
    url: a.url || a.source_url || null,
    publishedAt: a.publishedAt || a.date || null,
    original: a,
  };

  return { id, text, meta };
}



async function main() {
  console.log("[ingestNews] starting ingestion");
  try {
    const articles = await loadArticles();
    console.log("[ingestNews] loaded", articles.length, "articles from", DATA_PATH);

    await initVector();
    console.log("[ingestNews] vector service initialized");

    // build docs
    // const docs = articles.map(makeDocFromArticle);
    // console.log(`[ingestNews] prepared ${docs.length} docs`);

    // build docs
const docs = articles.map(makeDocFromArticle);
console.log("[ingestNews] first doc sample:", docs[0]);


    // upsert in batches
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      console.log(`[ingestNews] upserting batch ${i}-${i + batch.length - 1}`);
      try {
        const res = await upsertDocuments(batch);
        console.log(`[ingestNews] upserted ${res.length} docs`);
      } catch (err) {
        console.error(
          "[ingestNews] upsert batch failed:",
          err && err.message ? err.message : err
        );
      }
    }

    console.log("[ingestNews] ingestion complete");
    process.exit(0);
  } catch (err) {
    console.error(
      "[ingestNews] fatal error:",
      err && err.message ? err.message : err
    );
    process.exit(1);
  }
}

main();
