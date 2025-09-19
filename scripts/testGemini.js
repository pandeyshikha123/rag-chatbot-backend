// scripts/testGemini.js
import dotenv from "dotenv";
dotenv.config(); // load .env

// Path to your gemini wrapper/service
import * as geminiModule from "../src/services/geminiService.js";

async function callIfFunction(obj, pathParts, args = []) {
  try {
    let fn = obj;
    for (const p of pathParts) {
      if (fn == null) return { ok: false, reason: `path ${pathParts.join(".")} not found` };
      fn = fn[p];
    }
    if (typeof fn !== "function") return { ok: false, reason: `not a function at ${pathParts.join(".")}` };
    const out = await fn(...args);
    return { ok: true, result: out, path: pathParts.join(".") };
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : String(err) };
  }
}

async function main() {
  console.log("[testGemini] starting test");
  console.log("[testGemini] PALM_API_KEY in env:", !!process.env.PALM_API_KEY);

  // Show what the imported module exports (keys)
  try {
    const keys = Object.keys(geminiModule);
    console.log("[testGemini] gemini module exported keys:", keys.length ? keys : "(no named exports)");
  } catch (e) {
    console.log("[testGemini] could not list exports:", e && e.message ? e.message : e);
  }

  // Show default export if exists
  if (geminiModule && geminiModule.default) {
    console.log("[testGemini] gemini.default is present. Keys:", Object.keys(geminiModule.default || {}));
  }

  // Candidate function paths to try (common wrappers/names)
  const candidates = [
    ["generate"],
    ["generateText"],
    ["text", "generate"],
    ["textGenerate"],
    ["chat"],
    ["simpleChat"],
    ["chatComplete"],
    ["default","generate"],
    ["default","simpleChat"],
    ["default","chat"],
  ];

  // Try candidate functions until one works.
  for (const cand of candidates) {
    console.log(`[testGemini] trying path: ${cand.join(".")}`);
    // We'll pass a short prompt; many wrappers expect (prompt, opts)
    const tryArgs = ["Write a one-sentence friendly test summary of why parks are good for communities."];
    const r = await callIfFunction(geminiModule, cand, tryArgs);
    if (r.ok) {
      console.log(`[testGemini] SUCCESS using '${r.path}' — result (truncated):`);
      try {
        // if result is object, try to print something useful
        if (typeof r.result === "string") console.log(r.result.slice(0, 600));
        else if (r.result && r.result.output) console.log(JSON.stringify(r.result.output).slice(0,600));
        else console.log(JSON.stringify(r.result).slice(0,600));
      } catch (e) {
        console.log("  (couldn't stringify result)", e);
      }
      return process.exit(0);
    } else {
      console.log(`[testGemini] no success: ${r.reason}`);
    }
  }

  console.error("[testGemini] All candidate methods failed. Please open src/services/geminiService.js and check exports and API usage.");
  process.exit(1);
}

main().catch((err) => {
  console.error("[testGemini] fatal error:", err && err.message ? err.message : err);
  process.exit(1);
});
