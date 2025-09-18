import "dotenv/config";
import { getEmbedding, batchEmbeddings } from "../src/services/embeddingService.js";

async function main() {
  const text = "Hello world";
  const emb = await getEmbedding(text);
  console.log("Single embedding length:", emb.length);

  const texts = ["Chatbots are cool", "Retrieval-Augmented Generation"];
  const embs = await batchEmbeddings(texts);
  console.log("Batch embedding lengths:", embs.map(e => e.length));
}

main().catch(err => {
  console.error("Embedding test failed:", err);
  process.exit(1);
});
