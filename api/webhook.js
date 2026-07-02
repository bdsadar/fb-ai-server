// ============================================================
//  Facebook Messenger Webhook — api/webhook.js
//  Vercel Serverless Function
// ============================================================

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_TOKEN   = process.env.PAGE_ACCESS_TOKEN;
const APP_SECRET   = process.env.APP_SECRET;
const SCRIPT_URL   = process.env.GOOGLE_SCRIPT_URL;
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_BASE  = "https://generativelanguage.googleapis.com/v1beta/models/";

// Multi-key rotation — Vercel এ: AIzaKey1,AIzaKey2,AIzaKey3
const GEMINI_KEYS = (process.env.GEMINI_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
let _keyIndex = 0;

function getNextKey() {
  if (!GEMINI_KEYS.length) throw new Error("GEMINI_API_KEY সেট করা নেই।");
  const key = GEMINI_KEYS[_keyIndex % GEMINI_KEYS.length];
  _keyIndex++;
  console.log(`[KEY] Using key #${(_keyIndex - 1) % GEMINI_KEYS.length + 1} of ${GEMINI_KEYS.length}`);
  return key;
}

// In-memory conversation history (per sender)
const conversations = {};

// ──────────────────────────────────────────────
//  Main handler
// ──────────────────────────────────────────────
export default async function handler(req, res) {

  // GET — Webhook verification by Facebook
  if (req.method === "GET") {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified ✓");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
    console.log({
  mode: req.query["hub.mode"],
  token: req.query["hub.verify_token"],
  challenge: req.query["hub.challenge"],
  expected: process.env.VERIFY_TOKEN,
});
  }
 

  // POST — Incoming message event
  if (req.method === "POST") {
    const body = req.body;

    if (body.object !== "page") {
      return res.status(404).send("Not a page event");
    }

    // Process each entry async (respond 200 immediately to FB)
    res.status(200).send("EVENT_RECEIVED");

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        await handleMessagingEvent(event);
      }
    }
    return;
  }

  res.status(405).send("Method not allowed");
}

// ──────────────────────────────────────────────
//  Handle individual message event
// ──────────────────────────────────────────────
async function handleMessagingEvent(event) {
  const senderId = event.sender?.id;
  if (!senderId) return;

  // Ignore echoes (our own messages)
  if (event.message?.is_echo) return;

  // Ignore delivery / read receipts
  if (event.delivery || event.read) return;

  const messageText = event.message?.text;
  if (!messageText) return;

  console.log(`[MSG] From ${senderId}: ${messageText}`);

  // Check if auto mode is ON (from Google Sheets settings)
  const settings = await getSettings();
  if (!settings.autoMode) {
    console.log("[MANUAL] Auto mode off — skipping AI reply");
    return;
  }

  try {
    // Load product info
    const productInfo = await fetchProductInfo();

    // Build conversation history
    if (!conversations[senderId]) conversations[senderId] = [];
    const history = conversations[senderId];

    // Call Gemini
    const reply = await callGemini(messageText, senderId, history, productInfo, settings.systemPrompt);

    // Save to history (max 10 turns)
    history.push({ user: messageText, bot: reply });
    if (history.length > 10) history.shift();

    // Send reply via Facebook API
    await sendFBMessage(senderId, reply);

    // Check if order confirmed → save to Sheets
    const order = extractOrder(reply, senderId);
    if (order) {
      await saveOrderToSheet(order);
    }

  } catch (err) {
    console.error("[ERROR]", err.message);
  }
}

// ──────────────────────────────────────────────
//  Send message via Facebook Graph API
// ──────────────────────────────────────────────
async function sendFBMessage(recipientId, text) {
  const url  = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_TOKEN}`;
  const body = {
    recipient: { id: recipientId },
    message:   { text },
    messaging_type: "RESPONSE"
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error("FB send error: " + JSON.stringify(err));
  }
  console.log(`[SENT] To ${recipientId}`);
}

// ──────────────────────────────────────────────
//  Gemini AI call
// ──────────────────────────────────────────────
async function callGemini(userMessage, senderId, history, productInfo, systemPrompt) {
  const defaultPrompt =
`তুমি একজন বাংলাদেশি COD ই-কমার্স পেজের কাস্টমার সার্ভিস এজেন্ট।
তোমার কাজ:
- কাস্টমারের সাথে বাংলা/বাংলিশে বন্ধুত্বপূর্ণভাবে কথা বলা
- পণ্যের তথ্য নিচের Product Information থেকে দেওয়া
- অর্ডার নেওয়া: নাম, ঠিকানা, ফোন, পণ্য ও পরিমাণ collect করা
- অর্ডার confirm হলে এই format এ লেখা:
  ✅ নাম: [নাম]
  ✅ ফোন: [নম্বর]
  ✅ ঠিকানা: [সম্পূর্ণ ঠিকানা]
  ✅ পণ্য: [পণ্যের নাম]
  ✅ পরিমাণ: [সংখ্যা]
  ✅ মূল্য: [টাকা]
  অর্ডার নিশ্চিত হয়েছে! ৩-৫ কার্যদিবসে ডেলিভারি পাবেন। 🎉
- COD = পণ্য পেলে টাকা দেবেন, আগে না
- সংক্ষেপে উত্তর দাও, Emoji পরিমিতভাবে`;

  const finalSystem = (systemPrompt || defaultPrompt)
    + (productInfo ? `\n\n📦 পণ্যের তথ্য:\n${productInfo}` : "");

  const messages = [];
  history.slice(-10).forEach(h => {
    messages.push({ role: "user",  parts: [{ text: h.user }] });
    messages.push({ role: "model", parts: [{ text: h.bot  }] });
  });
  messages.push({ role: "user", parts: [{ text: userMessage }] });

  // Try each key — rate limit হলে next key তে যাও
  let lastErr;
  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const apiKey = getNextKey();
    try {
      return await callGeminiWithKey(apiKey, finalSystem, messages);
    } catch (err) {
      lastErr = err;
      // 429 = rate limit → next key try করো
      if (err.message.includes("429") || err.message.includes("quota")) {
        console.warn(`[KEY] Rate limit on key #${attempt + 1}, trying next...`);
        continue;
      }
      throw err; // অন্য error হলে সাথে সাথে throw
    }
  }
  throw lastErr || new Error("সব key-তে rate limit হয়েছে।");
}

async function callGeminiWithKey(apiKey, finalSystem, messages) {
  const res = await fetch(
    `${GEMINI_BASE}${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: finalSystem }] },
        contents: messages,
        generationConfig: { temperature: 0.7, maxOutputTokens: 350 }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error ${res.status}`);
  }

  const data  = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error("Gemini reply empty");
  return reply.trim();
}

// ──────────────────────────────────────────────
//  Google Sheets helpers
// ──────────────────────────────────────────────
let _productCache    = null;
let _productCacheAt  = 0;
let _settingsCache   = null;
let _settingsCacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

async function fetchProductInfo() {
  if (!SCRIPT_URL) return null;
  const now = Date.now();
  if (_productCache && now - _productCacheAt < CACHE_MS) return _productCache;
  try {
    const res  = await fetch(`${SCRIPT_URL}?action=getProduct`);
    const data = await res.json();
    if (data.success) { _productCache = data.content; _productCacheAt = now; }
  } catch (e) { console.warn("fetchProductInfo:", e.message); }
  return _productCache;
}

async function getSettings() {
  if (!SCRIPT_URL) return { autoMode: true };
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < CACHE_MS) return _settingsCache;
  try {
    const res  = await fetch(`${SCRIPT_URL}?action=getSettings`);
    const data = await res.json();
    if (data.success) { _settingsCache = data.settings; _settingsCacheAt = now; }
  } catch (e) { console.warn("getSettings:", e.message); }
  return _settingsCache || { autoMode: true };
}

async function saveOrderToSheet(order) {
  if (!SCRIPT_URL) return;
  try {
    await fetch(SCRIPT_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "saveOrder", ...order })
    });
  } catch (e) { console.warn("saveOrder:", e.message); }
}

// ──────────────────────────────────────────────
//  Extract order from AI reply
// ──────────────────────────────────────────────
function extractOrder(reply, senderId) {
  if (!reply.includes("✅ নাম") && !reply.includes("অর্ডার নিশ্চিত")) return null;

  const grab = (...patterns) => {
    for (const p of patterns) {
      const m = reply.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return "";
  };

  return {
    senderName:  grab(/✅ নাম[:\s]+(.+)/,   /নাম[:\s]+(.+)/),
    phone:       grab(/✅ ফোন[:\s]+(.+)/,   /01[3-9]\d{8}/),
    address:     grab(/✅ ঠিকানা[:\s]+(.+)/,/ঠিকানা[:\s]+(.+)/),
    product:     grab(/✅ পণ্য[:\s]+(.+)/,  /পণ্য[:\s]+(.+)/),
    quantity:    grab(/✅ পরিমাণ[:\s]+(.+)/,/পরিমাণ[:\s]+(.+)/),
    totalPrice:  grab(/✅ মূল্য[:\s]+(.+)/,/মূল্য[:\s]+(.+)/),
    fbSenderId:  senderId,
    status:      "Pending",
    notes:       ""
  };
}
