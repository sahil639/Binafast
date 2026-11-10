// Vercel serverless function: reads a link or a screenshot and returns trip-item fields.
// A vision model does the OCR and the structuring in one call.
// Env: GEMINI_API_KEY (free tier) or ANTHROPIC_API_KEY. Optional: ALLOWED_EMAILS, GEMINI_MODEL, ANTHROPIC_MODEL.
const dns = require("node:dns").promises;
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");

const CATS = ["hotel", "food", "activity", "transport", "shopping", "other"];
const MODES = ["Flight", "Train", "Bus", "Cab", "Ferry", "Bike", "Other"];

function webApiKey() {
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;
  try {
    const src = fs.readFileSync(path.join(process.cwd(), "config.js"), "utf8");
    const m = /apiKey\s*:\s*["']([^"']+)["']/.exec(src);
    return m ? m[1] : "";
  } catch (e) { return ""; }
}

async function verify(req) {
  const h = String(req.headers.authorization || "");
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!tok) return null;
  const key = webApiKey();
  if (!key) return null;
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(key), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: tok })
  });
  if (!r.ok) return null;
  const j = await r.json();
  const u = j && j.users && j.users[0];
  if (!u) return null;
  const allow = String(process.env.ALLOWED_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length && allow.indexOf(String(u.email || "").toLowerCase()) < 0) return null;
  return u;
}

function privateIp(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb")) return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    return m ? privateIp(m[1]) : false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("bad-url");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) { if (privateIp(host)) throw new Error("bad-url"); return; }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("bad-url");
}

async function fetchPage(url) {
  let cur = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(cur);
    const r = await fetch(cur.href, {
      redirect: "manual", signal: AbortSignal.timeout(9000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BinafastBot/1.0)", Accept: "text/html,application/xhtml+xml" }
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { cur = new URL(r.headers.get("location"), cur); continue; }
    if (!r.ok) throw new Error("fetch-" + r.status);
    const buf = Buffer.from(await r.arrayBuffer()).subarray(0, 1500000);
    return { html: buf.toString("utf8"), finalUrl: cur.href };
  }
  throw new Error("redirects");
}

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Math.min(+n, 0x10ffff)));
}
function pageText(html) {
  const out = [];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) out.push("TITLE: " + decode(title[1]).trim());
  html.replace(/<meta\s+[^>]*>/gi, (tag) => {
    const k = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag), v = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (k && v && /^(og:|twitter:|description|keywords|product:|place:)/i.test(k[1])) out.push("META " + k[1] + ": " + decode(v[1]));
    return tag;
  });
  html.replace(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, (m, j) => { out.push("JSON-LD: " + j.trim().slice(0, 6000)); return m; });
  const body = html.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  out.push("BODY: " + decode(body).replace(/\s+/g, " ").trim().slice(0, 9000));
  return out.join("\n").slice(0, 20000);
}

function buildPrompt(b, kind) {
  const lang = b.lang === "vi" ? "Vietnamese" : "English";
  return [
    "You extract trip-planning details from " + (kind === "image" ? "a screenshot or photo (read all visible text, i.e. do OCR)" : "the text of a web page") + ".",
    "Return ONLY a JSON object. Use only facts that are clearly present; never guess. Omit a field or use null when unknown.",
    "Fields: name (short title of the place/activity/booking), category (one of " + CATS.join(", ") + "), city, date (YYYY-MM-DD), endDate (YYYY-MM-DD, hotels check-out only),",
    "time (HH:MM 24h start), endTime (HH:MM 24h), price (number, total, no symbols), currency (ISO code like VND, USD), mode (transport only, one of " + MODES.join(", ") + "), from, to (transport only), notes (max 240 chars, useful details such as address, booking reference, opening hours).",
    "Write name, city and notes in the language they appear in; if you must write free text yourself use " + lang + ".",
    "Today is " + (b.today || "unknown") + (b.tripStart ? "; the trip runs " + b.tripStart + " to " + (b.tripEnd || "?") : "") + ". If a date has no year, pick the year that falls in or after the trip/today.",
    b.currency ? "The trip currency is " + b.currency + "." : ""
  ].filter(Boolean).join("\n");
}

function clean(o) {
  const f = {};
  if (!o || typeof o !== "object") return f;
  const s = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : null);
  const time = (v) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
  const set = (k, v) => { if (v != null) f[k] = v; };
  set("name", s(o.name, 120));
  if (CATS.indexOf(o.category) >= 0) f.category = o.category;
  set("city", s(o.city, 80)); set("date", date(o.date)); set("endDate", date(o.endDate));
  set("time", time(o.time)); set("endTime", time(o.endTime));
  const p = typeof o.price === "number" ? o.price : parseFloat(String(o.price == null ? "" : o.price).replace(/[^\d.]/g, ""));
  if (isFinite(p) && p >= 0 && p < 1e12) f.price = p;
  if (typeof o.currency === "string" && /^[A-Za-z]{3}$/.test(o.currency)) f.currency = o.currency.toUpperCase();
  if (MODES.indexOf(o.mode) >= 0) f.mode = o.mode;
  set("from", s(o.from, 80)); set("to", s(o.to, 80)); set("notes", s(o.notes, 300));
  if (f.date && f.endDate && f.endDate < f.date) delete f.endDate;
  if (f.time && f.endTime && f.endTime <= f.time) delete f.endTime;
  return f;
}
function parseJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const m = /\{[\s\S]*\}/.exec(String(text || ""));
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

async function callGemini(prompt, text, img) {
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const parts = [{ text: prompt + (text ? "\n\n" + text : "") }];
  if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } });
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST", signal: AbortSignal.timeout(24000),
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } })
  });
  if (r.status === 429) { const e = new Error("rate"); e.status = 429; throw e; }
  if (!r.ok) throw new Error("llm-" + r.status);
  const j = await r.json();
  const c = j.candidates && j.candidates[0];
  return c && c.content && c.content.parts ? c.content.parts.map((p) => p.text || "").join("") : "";
}
async function callAnthropic(prompt, text, img) {
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
  const content = [];
  if (img) content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.b64 } });
  content.push({ type: "text", text: prompt + (text ? "\n\n" + text : "") });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: AbortSignal.timeout(24000),
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 800, temperature: 0, messages: [{ role: "user", content }] })
  });
  if (r.status === 429) { const e = new Error("rate"); e.status = 429; throw e; }
  if (!r.ok) throw new Error("llm-" + r.status);
  const j = await r.json();
  return (j.content || []).map((p) => p.text || "").join("");
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method" }); }
  try {
    if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: "not-configured" });
    const user = await verify(req);
    if (!user) return res.status(401).json({ error: "auth" });
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
    if (!b || typeof b !== "object") return res.status(400).json({ error: "body" });

    let img = null;
    if (b.image != null) {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image));
      if (!m) return res.status(400).json({ error: "image" });
      if (m[2].length > 3500000) return res.status(413).json({ error: "too-big" });
      img = { mime: m[1], b64: m[2] };
    }
    let text = "", url = null;
    if (b.url) {
      try { url = new URL(String(b.url)); } catch (e) { return res.status(400).json({ error: "url" }); }
      try {
        const page = await fetchPage(url.href);
        text = "Page URL: " + page.finalUrl + "\n" + pageText(page.html);
      } catch (e) {
        if (!img) return res.status(422).json({ error: "unreadable" });
      }
    }
    if (!img && !text) return res.status(400).json({ error: "empty" });

    const prompt = buildPrompt(b, img ? "image" : "page");
    const raw = process.env.GEMINI_API_KEY ? await callGemini(prompt, text, img) : await callAnthropic(prompt, text, img);
    return res.status(200).json({ fields: clean(parseJson(raw)) });
  } catch (e) {
    if (e && e.status === 429) return res.status(429).json({ error: "rate" });
    return res.status(502).json({ error: "failed" });
  }
};
module.exports.config = { maxDuration: 30 };
