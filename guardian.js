// guardian.js
// Decides what to do with a payment BEFORE it reaches PayPal.
// Returns: { decision: "approve" | "ask" | "block", reasons: [...] }

// Example rules. Later, AI will create these from plain English.
const defaultRules = {
  maxAutoApprove: 100,
  hardBlockAbove: 1000,
  trustedRecipients: ["pharmacy@example.com", "grandson@example.com"],
  scamWords: ["gift card", "prize", "act now", "don't tell", "wire transfer", "fee to claim"],
};

function evaluatePayment(payment, rules = defaultRules) {
  const reasons = [];
  let decision = "approve";

  const amount = Number(payment.amount);
  const recipient = (payment.recipient || "").toLowerCase();
  const note = (payment.note || "").toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    return { decision: "block", reasons: ["The amount is not valid."] };
  }

  if (amount > rules.hardBlockAbove) {
    return {
      decision: "block",
      reasons: [`Amounts above $${rules.hardBlockAbove} are not allowed.`],
    };
  }

  const hits = rules.scamWords.filter((w) => note.includes(w));
  if (hits.length > 0) {
    return {
      decision: "block",
      reasons: [`The note contains common scam wording: "${hits.join('", "')}".`],
    };
  }

  if (amount > rules.maxAutoApprove) {
    decision = "ask";
    reasons.push(`The amount is above $${rules.maxAutoApprove}.`);
  }

  if (!rules.trustedRecipients.includes(recipient)) {
    decision = "ask";
    reasons.push("This is a new recipient.");
  }

  if (decision === "approve") reasons.push("Normal payment to a trusted recipient.");
  return { decision, reasons };
}

module.exports = { evaluatePayment, defaultRules };