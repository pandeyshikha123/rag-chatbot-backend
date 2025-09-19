// scripts/testImport.js
try {
  const mod = await import("@google/generative-ai");
  console.log("Gemini SDK imported:", Object.keys(mod));
} catch (e) {
  console.error("Gemini SDK import failed:", e);
}