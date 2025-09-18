// scripts/dumpStore.js
// Nicely prints everything currently stored (id, title, url, snippet).
// This reads persisted store (vector_store.json) via vectorService.initVector()

import { initVector } from "../src/services/vectorService.js";

async function main() {
  await initVector();
  console.log("[dumpStore] vector service initialized (loaded persisted store if present)");

  // Access the inMemoryStore indirectly by loading the persisted file (vectorService already did that).
  // We'll perform a search with an empty query to fetch the current stored docs via the service.
  // But search requires a query; instead we'll import the persisted file directly if available.
  // However to avoid coupling to file paths we'll attempt to call search() with a nonsense query
  // that returns the full candidate list (search() already lists docs it knows about in debug).
  // Simpler and reliable: read vector_store.json file used by vectorService.

  // try reading the persisted store file used by vectorService
  // (we don't import fs at the top to avoid circular imports; do it here)
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const PERSIST_PATH = path.resolve("./data/vector_store.json");

    const raw = await fs.readFile(PERSIST_PATH, "utf8").catch(() => null);
    if (!raw) {
      console.log(`[dumpStore] no persisted store found at ${PERSIST_PATH}`);
      console.log("[dumpStore] If you just ran ingestNews.js, ensure it completed successfully.");
      process.exit(0);
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.log("[dumpStore] persisted store is empty or malformed.");
      process.exit(0);
    }

    console.log(`[dumpStore] loaded ${parsed.length} docs from ${PERSIST_PATH}`);
    console.log("----");

    parsed.forEach((d, i) => {
      const id = d.id || `doc-${i + 1}`;
      const title = (d.meta && d.meta.title) || (d.meta && d.meta.original && d.meta.original.title) || "";
      const url = (d.meta && d.meta.url) || (d.meta && d.meta.original && d.meta.original.url) || "";
      const text = d.text || (d.meta && d.meta.original && d.meta.original.text) || "";
      const snippet = text.length > 240 ? text.slice(0, 240).replace(/\s+/g, " ").trim() + "..." : text.replace(/\s+/g, " ").trim();

      console.log(`${i + 1}) id: ${id}`);
      if (title) console.log(`   title: ${title}`);
      if (url) console.log(`   url: ${url}`);
      console.log(`   snippet: ${snippet}`);
      console.log("----");
    });

    process.exit(0);
  } catch (err) {
    console.error("[dumpStore] failed to read persisted store:", err);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[dumpStore] fatal:", e);
  process.exit(1);
});
