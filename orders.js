// api/orders.js — Orders read/update API

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!SCRIPT_URL) return res.json({ success: true, orders: [] });

  // GET — fetch all orders
  if (req.method === "GET") {
    try {
      const r    = await fetch(`${SCRIPT_URL}?action=getOrders`);
      const data = await r.json();
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST — update order status
  if (req.method === "POST") {
    try {
      const r = await fetch(SCRIPT_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "updateOrder", ...req.body })
      });
      const data = await r.json();
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  res.status(405).end();
}
