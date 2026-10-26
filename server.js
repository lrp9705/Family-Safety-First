require("dotenv").config();
const express = require("express");
const { evaluatePayment, defaultRules } = require("./guardian");
const { parseRules } = require("./ai-rules");

const app = express();
app.use(express.json());

const PORT = 3000;
const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";

// Stop early if the keys are missing from .env
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
  console.error("Missing PAYPAL_CLIENT_ID or PAYPAL_SECRET in .env");
  process.exit(1);
}

// ---- Get a PayPal token automatically (and reuse it until it expires) ----
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
  ).toString("base64");

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json();
  if (!res.ok) throw new Error("Token request failed: " + JSON.stringify(data));

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// ---- The rules currently in force (starts with the defaults) ----
let currentRules = defaultRules;

// ---- Health check ----
app.get("/", (req, res) => {
  res.send("Family Safety First server is running");
});

// ---- Guardian sends a plain-English sentence; we parse and activate it ----
app.post("/api/rules", async (req, res) => {
  try {
    const text = (req.body.text || "").slice(0, 1000);
    if (!text.trim()) {
      return res.status(400).json({ error: "Please write the rules first." });
    }

    const { rules, summary } = await parseRules(text);
    currentRules = rules;
    res.json({ summary, rules });
  } catch (err) {
    console.error(err.message);
    res.status(400).json({ error: "I couldn't turn that into rules. Try rewording it." });
  }
});

// ---- Show the rules currently active ----
app.get("/api/rules", (req, res) => {
  res.json({ rules: currentRules });
});

// ---- Create an order (the Guardian checks it first) ----
app.post("/api/orders", async (req, res) => {
  try {
    const amount = req.body.amount || "10.00";

    // Guardian check BEFORE anything reaches PayPal
    const verdict = evaluatePayment(
      {
        amount,
        recipient: req.body.recipient,
        note: req.body.note,
      },
      currentRules
    );
    if (verdict.decision !== "approve") {
      return res.status(403).json(verdict);
    }

    const token = await getAccessToken();

    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value: amount } }],
      }),
    });

    const order = await response.json();
    const approveLink = (order.links || []).find(
      (l) => l.rel === "payer-action" || l.rel === "approve"
    );

    res.status(response.status).json({
      id: order.id,
      status: order.status,
      approveUrl: approveLink ? approveLink.href : null,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Could not create order" });
  }
});

// ---- Capture an approved order ----
app.post("/api/orders/:id/capture", async (req, res) => {
  try {
    const token = await getAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders/${req.params.id}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      }
    );

    const result = await response.json();
    res.status(response.status).json({ id: result.id, status: result.status });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Could not capture order" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});