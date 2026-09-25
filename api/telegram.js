// Telegram webhook on Vercel, so the bot answers 24/7 without this computer.
// Stateless: to revise, the user replies to a draft and we send that draft back to Gemini.
import { createHash } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { generate } from "../writer.js";

const HELP = `Send me a post idea and, ideally, one fresh fact from Meera (a customer question, number or story). I'll draft a LinkedIn post in her voice.

Example:
Topic: Why we have no fragrance
Fact: A customer emailed last week asking if we forgot to add scent.

To revise a draft, reply to it (swipe left on the message) and say what to change, e.g. "make it shorter".

/ideas - list the 11 ready-to-use post ideas`;

const IDEAS = `1. Why we have no fragrance
2. 14 months without a Vitamin C launch
3. Ask any brand for its pH
4. Parabens aren't the villain
5. Fake "cold-pressed"
6. "7 peptides" is just a label
7. You're using too little sunscreen
8. 0.1% can still be on the label
9. Ceramides at the bottom of the list
10. 67% buy again, and what we got wrong
11. Not a doctor, and that's fine

The guide suggests starting with 1, 2 and 10.`;

const token = process.env.TELEGRAM_BOT_TOKEN;
const TG = `https://api.telegram.org/bot${token}`;
const ALLOWED = (process.env.ALLOWED_USER_IDS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Derived from the bot token, so only Telegram (which we give it to via setWebhook) can call us.
export function webhookSecret(botToken) {
  return createHash("sha256").update(`webhook:${botToken}`).digest("hex");
}

async function tg(method, body) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`);
  return data.result;
}

async function send(chatId, text) {
  // Telegram caps messages at 4096 characters.
  for (let i = 0; i < text.length; i += 4000) {
    await tg("sendMessage", { chat_id: chatId, text: text.slice(i, i + 4000) });
  }
}

function prompt(msg, text) {
  const previous = msg.reply_to_message?.from?.is_bot && msg.reply_to_message.text;
  if (!previous) return text;
  return `Here is the previous draft:\n\n${previous}\n\nRevise it as follows and return the full revised post: ${text}`;
}

async function handle(msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id ?? "");
  const text = msg.text?.trim();

  if (ALLOWED.length && !ALLOWED.includes(userId)) return send(chatId, "Sorry, this bot is private.");
  if (!text) return send(chatId, "Please send text. " + HELP);
  if (text === "/start" || text === "/help") return send(chatId, HELP);
  if (text === "/ideas") return send(chatId, IDEAS);
  if (text === "/new") return send(chatId, "Fresh start. Send me the next post idea.");

  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  const typing = setInterval(
    () => tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {}),
    4500,
  );
  try {
    const { text: draft } = await generate([{ role: "user", parts: [{ text: prompt(msg, text) }] }]);
    await send(chatId, draft || "Sorry, I couldn't write that one. Try rephrasing the topic.");
  } catch (err) {
    console.error(err);
    await send(chatId, "Something went wrong drafting that. Please try again.");
  } finally {
    clearInterval(typing);
  }
}

export default function handler(req, res) {
  if (req.method !== "POST" || !token) {
    res.statusCode = 404;
    return res.end();
  }
  if (req.headers["x-telegram-bot-api-secret-token"] !== webhookSecret(token)) {
    res.statusCode = 401;
    return res.end();
  }

  const msg = req.body?.message;
  // Answer Telegram right away (so it doesn't retry), and keep drafting in the background.
  if (msg) waitUntil(handle(msg).catch((e) => console.error(e)));
  res.statusCode = 200;
  res.end("ok");
}
