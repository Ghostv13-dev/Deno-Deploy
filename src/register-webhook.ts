// Run locally after deploying: node --experimental-strip-types --env-file=.dev.vars scripts/register-webhook.ts https://my-bot.example.workers.dev
//
// This deliberately runs on the developer's machine rather than as an
// in-Worker HTTP endpoint (spec section 4: "the token must never be
// exposed through the public webhook URL" — a local script means it's
// never sent over the public internet as a registration payload at all).

const publicUrl = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!publicUrl || !token || !secret) {
  console.error(
    "Usage: node --experimental-strip-types --env-file=.dev.vars scripts/register-webhook.ts <https://your-worker-url>",
  );
  console.error("Requires TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the env file.");
  process.exit(1);
}

const webhookUrl = `${publicUrl.replace(/\/$/, "")}/telegram/webhook`;

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "chat_join_request"],
  }),
});

const data = await res.json();
if (data.ok) {
  console.log(`Webhook registered: ${webhookUrl}`);
} else {
  console.error("Failed to register webhook:", data);
  process.exit(1);
}
