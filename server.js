"use strict";

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 10000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const BACKEND_URL = process.env.BACKEND_URL || "";

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  console.log("[startup] Supabase client configured");
} else {
  console.warn("[startup] Supabase env vars missing; database routes will return 503");
}
console.log("[startup] Node:", process.version);
console.log("[startup] PORT:", PORT);
console.log("[startup] Telegram notifications:", TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID ? "configured" : "not configured");

function adminAuth(req, res, next) {
  if (!ADMIN_API_KEY) return res.status(503).json({ error: "ADMIN_API_KEY is not configured on the server." });
  const supplied = String(req.headers["x-admin-api-key"] || "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_API_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

async function notifyAdmin(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text: message,
        disable_web_page_preview: true
      })
    });
    if (!response.ok) console.error("[telegram] sendMessage failed:", response.status, await response.text());
  } catch (error) {
    console.error("[telegram] notification error:", error.message);
  }
}

function requireDatabase(req, res, next) {
  if (!supabase) return res.status(503).json({ error: "Database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." });
  next();
}

app.get("/health", (req, res) => res.json({
  ok: true,
  service: "Sky Way Travel Agency",
  node: process.version,
  databaseConfigured: Boolean(supabase),
  telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID)
}));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

// Public intake endpoint: stores a request; it does not claim to book a live ticket/hotel.
app.post("/api/requests", requireDatabase, async (req, res) => {
  const body = req.body || {};
  const allowedTypes = ["flight", "hotel", "visa", "stopover", "package", "other"];
  const type = String(body.request_type || "").trim().toLowerCase();
  const customerName = String(body.customer_name || "").trim();
  const phone = String(body.phone || "").trim();
  const origin = String(body.origin || "").trim();
  const destination = String(body.destination || "").trim();
  const details = String(body.details || "").trim();

  if (!allowedTypes.includes(type)) return res.status(400).json({ error: "Invalid request_type." });
  if (customerName.length < 2 || phone.length < 5) {
    return res.status(400).json({ error: "Please provide a customer name and contact phone." });
  }
  if (details.length > 5000) return res.status(400).json({ error: "Details are too long." });

  const row = {
    request_type: type,
    customer_name: customerName,
    phone,
    origin: origin || null,
    destination: destination || null,
    departure_date: body.departure_date || null,
    return_date: body.return_date || null,
    passengers: Math.max(1, Math.min(20, Number.parseInt(body.passengers, 10) || 1)),
    nationality: String(body.nationality || "").trim() || null,
    stopover_country: String(body.stopover_country || "").trim() || null,
    stopover_days: body.stopover_days ? Math.max(1, Math.min(90, Number.parseInt(body.stopover_days, 10) || 1)) : null,
    details: details || null,
    status: "NEW",
    payment_status: "UNPAID",
    quoted_cost_etb: 0,
    quoted_price_etb: 0,
    extra_expenses_etb: 0,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from("travel_requests").insert(row).select("*").single();
  if (error) {
    console.error("[db] insert travel request failed:", error.message);
    return res.status(500).json({ error: "Could not save request. Check that schema.sql has been run in Supabase." });
  }

  await notifyAdmin(
    `✈️ SKY WAY — New ${type.toUpperCase()} request\n` +
    `Reference: SW-${data.id}\nName: ${customerName}\nPhone: ${phone}\n` +
    `Route: ${origin || "Not specified"} → ${destination || "Not specified"}\n` +
    `Status: NEW`
  );
  return res.status(201).json({ ok: true, request: data, message: "Request received. The agency will confirm availability and price." });
});

// Admin data routes require x-admin-api-key header.
app.get("/api/admin/requests", adminAuth, requireDatabase, async (req, res) => {
  const status = String(req.query.status || "").trim();
  let query = supabase.from("travel_requests").select("*").order("created_at", { ascending: false }).limit(500);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) {
    console.error("[db] list requests failed:", error.message);
    return res.status(500).json({ error: "Could not load requests." });
  }
  res.json({ requests: data || [] });
});

app.patch("/api/admin/requests/:id", adminAuth, requireDatabase, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid request id." });

  const allowedStatuses = ["NEW", "REVIEWING", "QUOTED", "AWAITING_PAYMENT", "PAID", "CONFIRMED", "COMPLETED", "CANCELLED"];
  const allowedPayments = ["UNPAID", "RECEIPT_SUBMITTED", "PAID", "REFUNDED"];
  const body = req.body || {};
  const patch = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    if (!allowedStatuses.includes(body.status)) return res.status(400).json({ error: "Invalid status." });
    patch.status = body.status;
  }
  if (body.payment_status !== undefined) {
    if (!allowedPayments.includes(body.payment_status)) return res.status(400).json({ error: "Invalid payment_status." });
    patch.payment_status = body.payment_status;
  }
  for (const key of ["quoted_cost_etb", "quoted_price_etb", "extra_expenses_etb"]) {
    if (body[key] !== undefined) {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0 || value > 1000000000) return res.status(400).json({ error: `Invalid ${key}.` });
      patch[key] = value;
    }
  }
  if (body.admin_notes !== undefined) patch.admin_notes = String(body.admin_notes).slice(0, 5000);

  const { data, error } = await supabase.from("travel_requests").update(patch).eq("id", id).select("*").single();
  if (error) {
    console.error("[db] update request failed:", error.message);
    return res.status(500).json({ error: "Could not update request." });
  }
  if (body.status || body.payment_status) {
    await notifyAdmin(`🔔 SKY WAY request SW-${id} updated\nStatus: ${data.status}\nPayment: ${data.payment_status}`);
  }
  res.json({ ok: true, request: data });
});

app.get("/api/admin/summary", adminAuth, requireDatabase, async (req, res) => {
  const { data, error } = await supabase.from("travel_requests")
    .select("id,status,payment_status,quoted_cost_etb,quoted_price_etb,extra_expenses_etb,created_at");
  if (error) return res.status(500).json({ error: "Could not load summary." });
  const rows = data || [];
  const totalSales = rows.filter(r => ["PAID", "CONFIRMED", "COMPLETED"].includes(r.status))
    .reduce((s, r) => s + Number(r.quoted_price_etb || 0), 0);
  const estimatedProfit = rows.filter(r => ["PAID", "CONFIRMED", "COMPLETED"].includes(r.status))
    .reduce((s, r) => s + Number(r.quoted_price_etb || 0) - Number(r.quoted_cost_etb || 0) - Number(r.extra_expenses_etb || 0), 0);
  res.json({
    totalRequests: rows.length,
    newRequests: rows.filter(r => r.status === "NEW").length,
    paidOrConfirmed: rows.filter(r => ["PAID", "CONFIRMED", "COMPLETED"].includes(r.status)).length,
    totalSalesEtb: totalSales,
    estimatedProfitEtb: estimatedProfit
  });
});

// Telegram webhook setup is intentionally not automatic until a public HTTPS BACKEND_URL is set.
app.get("/api/telegram/setup", adminAuth, async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN || !BACKEND_URL) return res.status(400).json({ error: "Set TELEGRAM_BOT_TOKEN and BACKEND_URL first." });
  try {
    const webhookUrl = `${BACKEND_URL.replace(/\/+$/, "")}/telegram/webhook`;
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: webhookUrl })
    });
    const result = await r.json();
    res.status(r.ok ? 200 : 502).json(result);
  } catch (e) {
    res.status(502).json({ error: "Telegram webhook setup failed." });
  }
});

app.post("/telegram/webhook", async (req, res) => {
  res.sendStatus(200);
  const update = req.body || {};
  const message = update.message;
  if (!message || !message.chat || !message.text) return;
  const chatId = message.chat.id;
  const text = message.text.trim();
  const send = async (reply) => {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: reply })
      });
    } catch (e) { console.error("[telegram] reply failed:", e.message); }
  };
  if (text === "/start" || text === "/help") {
    await send("✈️ Welcome to SKY WAY TRAVEL AGENCY!\\n\\nWe can help with flight tickets, hotels, visas and stopover packages.\\n\\nTo start a request, please contact our agency or use the request form on our website. This bot currently records enquiries; it does not issue tickets automatically.");
  }
});

app.use((err, req, res, next) => {
  console.error("[express] unhandled error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[startup] Sky Way Travel Agency listening on ${PORT}`);
});
