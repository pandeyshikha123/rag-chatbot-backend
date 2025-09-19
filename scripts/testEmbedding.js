// import "dotenv/config";
// import { getEmbedding, batchEmbeddings } from "../src/services/embeddingService.js";

// async function main() {
//   const text = "Hello world";
//   const emb = await getEmbedding(text);
//   console.log("Single embedding length:", emb.length);

//   const texts = ["Chatbots are cool", "Retrieval-Augmented Generation"];
//   const embs = await batchEmbeddings(texts);
//   console.log("Batch embedding lengths:", embs.map(e => e.length));
// }

// main().catch(err => {
//   console.error("Embedding test failed:", err);
//   process.exit(1);
// });


// scripts/testEmbedding.js
import { getEmbedding, batchEmbeddings } from "../src/services/embeddingService.js";

async function main() {
  const text = "The quick brown fox jumps over the lazy dog";
  console.log("[testEmbedding] input:", text);

  try {
    const emb = await getEmbedding(text);
    console.log("[testEmbedding] single embedding length:", emb?.length || "null");
  } catch (e) {
    console.error("[testEmbedding] single embedding failed:", e.message);
  }

  try {
    const arr = await batchEmbeddings([text, "Another example"]);
    console.log("[testEmbedding] batch embeddings count:", arr.length);
    console.log("[testEmbedding] first vector length:", arr[0]?.length || "null");
  } catch (e) {
    console.error("[testEmbedding] batch embeddings failed:", e.message);
  }
}

main();
