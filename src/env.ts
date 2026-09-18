// Cloudflare Worker bindings + secrets, as configured in wrangler.jsonc
// and via `wrangler secret put`.
export interface Env {
  DB: D1Database;
  STATE: KVNamespace;

  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OWNER_ID: string; // numeric Telegram user id, as a string
}
