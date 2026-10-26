require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.AI_API_KEY });

async function main() {
  const msg = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 100,
    messages: [
      { role: "user", content: "Reply with one short sentence confirming the connection works." },
    ],
  });
  console.log(msg.content[0].text);
}

main().catch((e) => console.error("AI test failed:", e.message));