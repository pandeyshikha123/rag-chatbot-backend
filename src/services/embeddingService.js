import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * embedTexts(texts: string[]) -> Promise<number[][]>
 * returns an array of vectors in same order as texts
 *
 * NOTE: This uses OpenAI embeddings by default (works well for demo).
 * If you want Jina embeddings instead, replace this function's implementation
 * to call the Jina Embeddings API and return vectors.
 */
export async function embedTexts(texts = []) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set in env");
  }
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const resp = await openai.embeddings.create({
    model,
    input: texts
  });
  // resp.data is array with embedding in .embedding
  return resp.data.map((d) => d.embedding);
}
