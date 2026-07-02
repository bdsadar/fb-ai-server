// api/chat.js — Manual reply + conversation log API

const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // POST /api/chat — Send manual reply
  if (req.method === "POST") {
    const { recipientId, message } = req.body;
    if (!recipientId || !message) {
      return res.status(400).json({ success: false, error: "recipientId and message required" });
    }
    try {
      const fbRes = await fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_TOKEN}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient:      { id: recipientId },
            message:        { text: message },
            messaging_type: "RESPONSE"
          })
        }
      );
      const data = await fbRes.json();
      if (!fbRes.ok) return res.status(400).json({ success: false, error: data });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/chat — Get recent conversations from Sheets
  if (req.method === "GET") {
    try {
      if (!SCRIPT_URL) return res.json({ success: true, conversations: [] });
      const r    = await fetch(`${SCRIPT_URL}?action=getConversations`);
      const data = await r.json();
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  res.status(405).end();
}
