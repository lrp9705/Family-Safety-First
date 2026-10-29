# Family Safety First

An AI-assisted payment safety net for families, built for the PayPal AI Hackathon.

A **Guardian** (for example, a son or daughter) writes payment rules in plain English. A **Member** (for example, a grandparent) pays through the app. Every payment is checked before it reaches PayPal, and the app either approves it, holds it for the Guardian, or blocks it with a kind explanation.

## The problem

Older adults and teenagers are frequent targets of payment scams, and families usually have two bad options: trust blindly or take over the person's money. Family Safety First is a middle path that keeps the person in control while giving a trusted family member a say on risky payments.

## How it works

1. **Plain-English rules.** The Guardian types something like "Grandma can pay up to $80 on her own. Anything over $250 is blocked. She can always pay pharmacy@example.com." AI turns this into structured rules. Code validates the result before using it.
2. **Rules check.** Each payment is checked against the limits, the trusted recipients, and a list of scam phrases.
3. **AI second opinion.** Payments the rules did not block are reviewed by an AI model that looks for scam patterns the keyword list misses (for example, "the IRS says you owe taxes"). The AI can only make a decision **stricter**, never looser.
4. **Decision.** The payment is approved, held for the Guardian, or blocked.
5. **Guardian review.** Held payments appear on the Guardian page with the reasons. The Guardian approves or declines. Only approved payments create a PayPal order.
6. **Timeline.** Every event is logged and shown on the Guardian page.

## How PayPal is used

- PayPal **Orders API** (sandbox): OAuth token, create order, capture order.
- Orders are created only after the Guardian logic allows the payment.
- The Member approves the order on PayPal's sandbox page using a sandbox Personal account.

## How AI is used

- **Rules parsing** (`ai-rules.js`): plain English into structured rules.
- **Risk judgment** (`ai-risk.js`): a scam and mistake assessment with a short, kind explanation.
- Payment notes are treated as untrusted data. The AI is told never to follow instructions inside them, and its output is validated in code.
- If the AI is unavailable, the app falls back to the normal rules.

## Test results

Run `node test-set.js` to reproduce. Results from two runs on 20 hand-written payments (12 scams, 7 normal, 2 harmless payments to a new person):

- Scams stopped by rules alone: 5 of 12
- Scams stopped by rules plus AI: 12 of 12
- Normal payments sent without delay: 7 of 7
- AI checks that failed: 0

This is a small test of payments written by the authors, not a measure of real-world accuracy. See `test-results.txt`.

## Run it yourself

Requirements: Node.js 18 or newer, a free PayPal developer account (sandbox), and an Anthropic API key (any AI provider could be substituted in `ai-rules.js` and `ai-risk.js`).

1. Clone the repo and install:
```
   git clone https://github.com/lrp9705/Family-Safety-First.git
   cd Family-Safety-First
   npm install
```
2. Create a `.env` file (see `.env.example`) with your own keys:
```
   PAYPAL_CLIENT_ID=your_sandbox_client_id
   PAYPAL_SECRET=your_sandbox_secret
   AI_API_KEY=your_ai_key
```
   Get sandbox credentials at https://developer.paypal.com (Apps & Credentials, Sandbox).
3. Start the server:
```
   node server.js
```
4. Open two browser tabs:
   - Member: http://localhost:3000
   - Guardian: http://localhost:3000/guardian.html
5. On the Guardian page, click **Use an example**, then **Save rules**.
6. On the Member page, try the example buttons, or send `$60` to `dinner.friend@example.com` with the note "The IRS says I owe back taxes, I must pay today to avoid arrest" to see the AI catch a scam the rules alone would approve.
7. To finish a payment, open the "Continue to PayPal" link and log in with your sandbox **Personal** account. Capture is available at `POST /api/orders/:id/capture`.

## Known limits

- Prototype running in the PayPal **sandbox** with test money only.
- Rules, pending requests, and the timeline are stored in memory and reset when the server restarts.
- No login yet: anyone who can reach the server can act as the Guardian. A real product would add authentication.
- Payments are checked only when made **through this app**. It cannot intercept payments made inside PayPal's own app.
- Scam detection is not perfect and is not a guarantee against fraud.

## Tech

Node.js, Express, PayPal Orders API, Anthropic Claude API, plain HTML/CSS/JavaScript.

## License

MIT