import fs from "fs";
import path from "path";

export async function readLocalNews() {
  const p = path.resolve("data/news_articles.json");
  if (!fs.existsSync(p)) return [];
  const txt = fs.readFileSync(p, "utf-8");
  const arr = JSON.parse(txt);
  // each item expected: { id, title, url, text }
  return arr;
}
