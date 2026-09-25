// Shared by the Telegram bot (bot.js) and the website (api/draft.js).
import { readFileSync } from "node:fs";

const styleGuide = readFileSync(new URL("./style-guide.txt", import.meta.url), "utf8");

export const SYSTEM = `You ghost-write LinkedIn posts for Meera Pillai, founder of Skinstinct (Indian skincare). She has a pharma background and is not a dermatologist.

Follow her style guide below exactly: the 5-step recipe, her sentence rhythm, British spelling, 400-450 words, short paragraphs, no exclamation marks, emoji, hashtags or selling.

Use ONLY facts the user gives you or facts stated in the style guide. Never invent numbers, stories or studies. If there isn't enough material for a good post, ask the user for one specific fact instead of guessing.

After the post, add a line "---" and then list every number you used and where it came from.

The user may ask for revisions to the previous draft (shorter, different opening, etc.). Apply them and return the full revised post.

Output plain text only (no markdown), because it is shown as a plain text message.

<style_guide>
${styleGuide}
</style_guide>`;

// Sends a Gemini-format conversation and returns the reply text plus the raw
// content (which carries thought signatures needed for later revisions).
export async function generate(contents) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || "gemini-pro-latest";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data.error?.message ?? "unknown error"}`);

  const content = data.candidates?.[0]?.content;
  const text = (content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();
  return { text, content };
}
