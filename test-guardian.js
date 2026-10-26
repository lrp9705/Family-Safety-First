const { evaluatePayment } = require("./guardian");

const tests = [
  { amount: 45, recipient: "pharmacy@example.com", note: "monthly medicine" },
  { amount: 300, recipient: "pharmacy@example.com", note: "" },
  { amount: 60, recipient: "stranger@example.com", note: "hello" },
  { amount: 250, recipient: "stranger@example.com", note: "Fee to claim your prize, act now" },
  { amount: 5000, recipient: "grandson@example.com", note: "" },
];

for (const t of tests) {
  console.log(JSON.stringify(t));
  console.log("  ->", evaluatePayment(t), "\n");
}