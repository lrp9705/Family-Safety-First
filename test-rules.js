const { parseRules } = require("./ai-rules");
const { evaluatePayment } = require("./guardian");

async function main() {
  const sentence =
    "Grandma can pay up to $80 on her own. Anything over $250 should be blocked. " +
    "She can always pay pharmacy@example.com and grandson@example.com without asking. " +
    "Flag anything that mentions 'lottery'.";

  const { rules, summary } = await parseRules(sentence);
  console.log("Summary:", summary);
  console.log("Rules:", rules);

  console.log("\n$50 to pharmacy:", evaluatePayment(
    { amount: 50, recipient: "pharmacy@example.com", note: "" }, rules));
  console.log("\n$120 to pharmacy:", evaluatePayment(
    { amount: 120, recipient: "pharmacy@example.com", note: "" }, rules));
  console.log("\n$40 to stranger, lottery note:", evaluatePayment(
    { amount: 40, recipient: "stranger@example.com", note: "lottery winnings fee" }, rules));
}

main().catch((e) => console.error("Failed:", e.message));