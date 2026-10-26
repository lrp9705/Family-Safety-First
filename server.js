require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const { evaluatePayment, defaultRules } = require("./guardian");
const { parseRules } = require("./ai-rules");

const app = express();
app.use(express.json());

const PORT = 3000;
const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";

if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
  console.error("Missing PAYPAL_CLIENT_ID or PAYPAL_SECRET in .env");
  process.exit(1);
}

// ---- PayPal token (reused until it expires) ----
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

// ---- Create a PayPal order (only called after the Guardian says yes) ----
async function createPayPalOrder(amount) {
  const token = await getAccessToken();
  const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        { amount: { currency_code: "USD", value: Number(amount).toFixed(2) } },
      ],
    }),
  });

  const order = await response.json();
  const approveLink = (order.links || []).find(
    (l) => l.rel === "payer-action" || l.rel === "approve"
  );

  return {
    httpStatus: response.status,
    id: order.id,
    status: order.status,
    approveUrl: approveLink ? approveLink.href : null,
  };
}

// ---- In-memory state (resets when the server restarts) ----
let currentRules = defaultRules;
const pendingRequests = [];
const activity = [];

function newId() {
  return crypto.randomUUID().slice(0, 8);
}

function logEvent(type, payment, reasons, requestId) {
  activity.push({
    time: new Date().toISOString(),
    type, // approved | held | blocked | guardian_approved | guardian_declined
    payment,
    reasons,
    requestId: requestId || null,
  });
}

// ---- Health check ----
app.get("/", (req, res) => {
  res.send("Family Safety First server is running");
});

// ---- Rules ----
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

app.get("/api/rules", (req, res) => {
  res.json({ rules: currentRules });
});

// ---- The Member tries to pay ----
app.post("/api/orders", async (req, res) => {
  try {
    const payment = {
      amount: req.body.amount || "10.00",
      recipient: req.body.recipient,
      note: req.body.note,
    };

    const verdict = evaluatePayment(payment, currentRules);

    if (verdict.decision === "block") {
      logEvent("blocked", payment, verdict.reasons);
      return res.status(403).json(verdict);
    }

    if (verdict.decision === "ask") {
      const request = {
        id: newId(),
        payment,
        reasons: verdict.reasons,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      pendingRequests.push(request);
      logEvent("held", payment, verdict.reasons, request.id);
      return res.status(202).json({
        decision: "ask",
        requestId: request.id,
        reasons: verdict.reasons,
      });
    }

    const order = await createPayPalOrder(payment.amount);
    logEvent("approved", payment, verdict.reasons);
    res.status(order.httpStatus).json({
      decision: "approve",
      id: order.id,
      status: order.status,
      approveUrl: order.approveUrl,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Could not create order" });
  }
});

// ---- Guardian: see requests waiting for a decision ----
app.get("/api/requests", (req, res) => {
  res.json(pendingRequests.filter((r) => r.status === "pending"));
});

// ---- Guardian: approve or decline a held request ----
app.post("/api/requests/:id/decide", async (req, res) => {
  try {
    const request = pendingRequests.find((r) => r.id === req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found." });
    if (request.status !== "pending") {
      return res.status(409).json({ error: "This request was already decided." });
    }

    const choice = req.body.decision;
    if (choice !== "approve" && choice !== "decline") {
      return res.status(400).json({ error: 'decision must be "approve" or "decline".' });
    }

    if (choice === "decline") {
      request.status = "declined";
      logEvent("guardian_declined", request.payment, request.reasons, request.id);
      return res.json({ requestId: request.id, status: "declined" });
    }

    const order = await createPayPalOrder(request.payment.amount);
    request.status = "approved";
    logEvent("guardian_approved", request.payment, request.reasons, request.id);
    res.status(order.httpStatus).json({
      requestId: request.id,
      status: "approved",
      id: order.id,
      orderStatus: order.status,
      approveUrl: order.approveUrl,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Could not process the decision" });
  }
});

// ---- Timeline (newest first) ----
app.get("/api/activity", (req, res) => {
  res.json([...activity].reverse());
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