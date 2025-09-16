import dotenv from "dotenv";
dotenv.config();
import { readLocalNews } from "../src/services/newsService.js";
import { embedTexts } from "../src/services/embeddingService.js";
import { upsertDocuments } from "../src/services/vectorService.js";
import { initVector } from "../src/services/vectorService.js";
import { logger } from "../src/utils/logger.js";

(async () => {
  await initVector();
  const docs = await readLocalNews();
  if (!docs.length) {
    console.log("No docs found in data/news_articles.json. Please add ~50 news items and re-run.");
    process.exit(1);
  }

  // For batching
  const batchSize = 16;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const texts = batch.map(d => d.text || (d.title + "\n" + d.summary || ""));
    const vectors = await embedTexts(texts);
    const points = batch.map((d, idx) => ({
      id: d.id || `${Date.now()}-${i+idx}`,
      vector: vectors[idx],
      payload: {
        title: d.title || "",
        url: d.url || "",
        text: texts[idx]
      }
    }));
    await upsertDocuments(points);
    logger.info(`Upserted batch ${i} -> ${i + batch.length}`);
  }

  logger.info("Ingest complete.");
  process.exit(0);
})();
