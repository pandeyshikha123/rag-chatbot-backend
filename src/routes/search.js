// src/routes/search.js
import express from "express";
import { search } from "../services/vectorService.js";

const router = express.Router();

// POST /api/search
// body: { query: string, k?: number }
router.post("/", async (req, res) => {
  try {
    const { query, k } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing 'query' string in request body" });
    }
    const limit = Number(k) || 5;

    console.log("[/api/search] incoming query:", query);

    const results = await search(query, limit);

    const out = results.map((r) => ({
      id: r.id,
      score: r.score ?? 0,
      title: r.meta?.title ?? null,
      url: r.meta?.url ?? null,
      snippet: (r.text || "").slice(0, 400),
    }));

    return res.json(out);
  } catch (err) {
    console.error("[/api/search] error:", err);
    return res.status(500).json({ error: "internal server error" });
  }
});

export default router;
