// src/services/generationService.js
export async function generateWithGemini(prompt, opts = {}) {
  const key = process.env.PALM_API_KEY;
  if (!key) throw new Error("PALM_API_KEY not set");
  const model = process.env.PALM_CHAT_MODEL || "chat-bison-001";
  const url = `https://generativelanguage.googleapis.com/v1beta2/models/${model}:generateMessage?key=${key}`;

  const body = {
    prompt: { messages: [{ content: prompt }] },
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.2,
    candidate_count: 1,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google generate error ${resp.status}: ${txt}`);
  }
  const js = await resp.json();
  const text = js?.candidates?.[0]?.content || js?.candidates?.[0]?.output || "";
  return text;
}

export default { generateWithGemini };
