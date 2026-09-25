import { generate } from "./writer.js";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is missing from .env");
if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing from .env");

const TG = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const ALLOWED = (process.env.ALLOWED_USER_IDS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const HELP = `Send me a post idea and, ideally, one fresh fact from Meera (a customer question, number or story). I'll draft a LinkedIn post in her voice.

Example:
Topic: Why we have no fragrance
Fact: A customer emailed last week asking if we forgot to add scent.

After a draft, you can reply "make it shorter" or "stronger first line" to revise it.

/new - start a fresh post (forget the previous draft)
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

// Per-chat conversation so users can ask for revisions. Kept in memory only.
const histories = new Map();
const MAX_TURNS = 10;

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

async function draft(chatId, userText) {
  const history = histories.get(chatId) || [];
  history.push({ role: "user", parts: [{ text: userText }] });

  let result;
  try {
    result = await generate(history);
  } catch (err) {
    history.pop();
    throw err;
  }

  const { text, content } = result;
  if (!text) {
    history.pop();
    return "Sorry, I couldn't write that one. Try rephrasing the topic.";
  }

  // Keep the full reply (including any thought signatures) so revisions work.
  history.push({ role: "model", parts: content.parts });
  histories.set(chatId, history.slice(-MAX_TURNS * 2));
  return text;
}

async function handle(msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id ?? "");
  const text = msg.text?.trim();
  console.log(`Message from ${msg.from?.first_name ?? "?"} (user ID ${userId})`);

  if (ALLOWED.length && !ALLOWED.includes(userId)) {
    return send(chatId, "Sorry, this bot is private.");
  }
  if (!text) return send(chatId, "Please send text. " + HELP);

  if (text === "/start" || text === "/help") return send(chatId, HELP);
  if (text === "/ideas") return send(chatId, IDEAS);
  if (text === "/new") {
    histories.delete(chatId);
    return send(chatId, "Fresh start. Send me the next post idea.");
  }

  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  const typing = setInterval(
    () => tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {}),
    4500,
  );
  try {
    await send(chatId, await draft(chatId, text));
  } catch (err) {
    console.error(err);
    await send(chatId, "Something went wrong drafting that. Please try again.");
  } finally {
    clearInterval(typing);
  }
}

async function main() {
  const me = await tg("getMe", {});
  console.log(`Connected as @${me.username}. Open Telegram and message the bot. Ctrl+C to stop.`);

  let offset = 0;
  while (true) {
    try {
      const updates = await tg("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) handle(u.message).catch((e) => console.error(e));
      }
    } catch (err) {
      console.error("Polling error:", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main();
