// scripts/testSearch.js
import { initVector, search } from "../src/services/vectorService.js";

async function main() {
  await initVector();
  console.log("[testSearch] vector service initialized");

  const q = process.argv[2] || "news";
  console.log("[testSearch] query:", q);

  const results = await search(q, 5);
  console.log("[testSearch] top results:");

  if (!results || results.length === 0) {
    console.log("  (no results found)");
    return;
  }

  results.forEach((r, i) => {
    const snippet =
      r.text?.length > 200
        ? r.text.slice(0, 200).replace(/\s+/g, " ").trim() + "..."
        : (r.text || "").replace(/\s+/g, " ").trim();

    console.log(`${i + 1}) id=${r.id} score=${(r.score || 0).toFixed(4)}`);
    if (r.meta?.title) console.log("   title:", r.meta.title);
    if (r.meta?.url) console.log("   url:", r.meta.url);
    console.log("   snippet:", snippet);
  });
}

main().catch((e) => {
  console.error("testSearch failed:", e);
  process.exit(1);
});
