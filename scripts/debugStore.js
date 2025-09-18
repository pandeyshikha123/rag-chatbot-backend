// scripts/debugStore.js
import { initVector, upsertDocuments } from "../src/services/vectorService.js";
import fs from "fs/promises";

async function main() {
  await initVector();

  // Load articles
  const raw = await fs.readFile("./data/news_articles.json", "utf8");
  const articles = JSON.parse(raw);

  console.log("[debugStore] checking articles after ingestion...");
  const docs = articles.map(a => ({
    id: a.id,
    text: `${a.title}\n\n${a.text}`,
    meta: { title: a.title, url: a.url }
  }));

  // Upsert to ensure they’re stored
  await upsertDocuments(docs);

  // Print them back
  console.log("---- STORED DOCS ----");
  docs.forEach(d => {
    console.log("id:", d.id);
    console.log("title:", d.meta.title);
    console.log("snippet:", d.text.slice(0, 150).replace(/\s+/g, " "));
    console.log("--------------");
  });
}

main().catch(err => {
  console.error("[debugStore] failed:", err);
  process.exit(1);
});
