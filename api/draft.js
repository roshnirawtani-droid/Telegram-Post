// Vercel serverless function behind the website. The browser keeps the
// conversation and sends it with each request, so revisions work without a database.
import { createHash, timingSafeEqual } from "node:crypto";
import { generate } from "../writer.js";

const MAX_MESSAGES = 21;
const MAX_BODY_CHARS = 300_000;

function samePassword(a, b) {
  const hash = (s) => createHash("sha256").update(String(s)).digest();
  return timingSafeEqual(hash(a), hash(b));
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "{}");
}

function reply(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function validContents(contents) {
  return (
    Array.isArray(contents) &&
    contents.length > 0 &&
    contents.length <= MAX_MESSAGES &&
    contents.at(-1).role === "user" &&
    contents.every((m) => (m?.role === "user" || m?.role === "model") && Array.isArray(m.parts)) &&
    JSON.stringify(contents).length <= MAX_BODY_CHARS
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return reply(res, 405, { error: "Use POST." });

  const password = process.env.APP_PASSWORD;
  if (!password) return reply(res, 500, { error: "APP_PASSWORD is not set on the server." });
  if (!samePassword(req.headers["x-app-password"] ?? "", password)) {
    return reply(res, 401, { error: "Wrong password." });
  }

  let contents;
  try {
    ({ contents } = await readBody(req));
  } catch {
    return reply(res, 400, { error: "Invalid request." });
  }
  if (!validContents(contents)) return reply(res, 400, { error: "Invalid request." });

  try {
    const { text, content } = await generate(contents);
    if (!text) return reply(res, 502, { error: "No draft came back. Try rephrasing the topic." });
    reply(res, 200, { text, parts: content.parts });
  } catch (err) {
    console.error(err);
    reply(res, 502, { error: "Something went wrong drafting that. Please try again." });
  }
}
