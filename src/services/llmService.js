import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/**
 * generateAnswer(prompt, {stream:false})
 * Returns a string answer.
 *
 * This function uses OpenAI chat completions by default (for a working demo).
 * If you need to use Google Gemini, replace the OpenAI call with a request to the
 * Gemini endpoint (AI Studio REST API) - authentication with GEMINI_API_KEY.
 */
export async function generateAnswer(prompt, opts = { stream: false }) {
  if (process.env.LLM_PROVIDER === "gemini") {
    // Placeholder: implement Gemini API call here.
    // Use process.env.GEMINI_ENDPOINT and process.env.GEMINI_API_KEY.
    // For now, throw to remind you to implement Gemini if you set provider=gemini
    throw new Error("Gemini provider selected but not implemented in code. See comments to implement.");
  }

  // OpenAI fallback
  if (!openai) throw new Error("OPENAI_API_KEY not configured");

  const model = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You are a helpful news assistant that cites the source passages when possible." },
      { role: "user", content: prompt }
    ],
    max_tokens: 800
  });

  // response.choices[0].message.content typically holds result
  return response.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate an answer.";
}
