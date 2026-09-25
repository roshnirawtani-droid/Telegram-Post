# Meera Post Bot

Drafts LinkedIn posts in Meera's style, using `style-guide.txt` and Google Gemini. There are two ways to use it: a website (hosted on Vercel) and a Telegram bot (@dsseoktrghhbot). Both write posts the same way (`writer.js`).

## Website (Vercel)
Type a post idea and an optional fresh fact, then press **Write post**. The draft appears on the same page with a Copy button, a list of the numbers it used, and a box to ask for revisions.

Files: `public/index.html` (the page), `api/draft.js` (talks to Gemini), `vercel.json`.

In Vercel, under Project → Settings → Environment Variables, add:
- `GEMINI_API_KEY`: your Gemini key (type: Secret)
- `GEMINI_MODEL` (optional): e.g. `gemini-flash-latest` for faster drafts

The site has no password, so anyone with the link can use it. Set a spending limit on the Gemini key in Google AI Studio.

After changing variables, redeploy for them to take effect.

# Telegram bot
The bot runs on Vercel (`api/telegram.js`), so it answers 24/7. Telegram sends each message to `https://meera-post-writer.vercel.app/api/telegram`. Vercel needs `TELEGRAM_BOT_TOKEN` and `GEMINI_API_KEY` set.

To revise a draft, reply to it in Telegram (swipe left) and say what to change.

## Running it on this computer instead (optional)
`bot.js` is the older version that runs only while `npm start` is running. It can't run at the same time as the Vercel webhook: Telegram only delivers messages one way at a time.

## Setup
Both keys are already in `.env`, and there's nothing to install.
1. `npm start`
2. Open Telegram, find @dsseoktrghhbot, and send `/start`.

To switch models, change `GEMINI_MODEL` in `.env`. For example, `gemini-flash-latest` is faster.

## Use
- Send a topic plus one fresh fact, and you get a post back in about 400-450 words, with the numbers it used listed at the end.
- To revise the draft, reply with something like "shorter" or "start with the number".
- `/new` starts over, and `/ideas` lists the 11 ready-made post ideas.

## Keeping it private
Once the bot is running, the console prints the user ID of everyone who messages it. Put your ID in `ALLOWED_USER_IDS` in `.env` so nobody else can use up your API credits.

The bot only runs while `npm start` is running on this computer.
