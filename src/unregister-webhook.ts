// Run locally: node --experimental-strip-types --env-file=.dev.vars scripts/unregister-webhook.ts

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Requires TELEGRAM_BOT_TOKEN in the env file.");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
  method: "POST",
});
const data = await res.json();
console.log(data.ok ? "Webhook removed." : data);
