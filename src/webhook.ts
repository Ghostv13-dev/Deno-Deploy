import type { Bot } from "gramio";
import type { Env } from "./env";

const TELEGRAM_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

// Validates the secret Telegram is configured to send with every webhook
// request, then hands the parsed update to the bot. Rejects anything that
// doesn't match — spec section 23: "The webhook should validate Telegram's
// configured secret token before processing updates."
export async function handleWebhookRequest(
  request: Request,
  env: Env,
  bot: Bot,
): Promise<Response> {
  const incomingSecret = request.headers.get(TELEGRAM_SECRET_HEADER);
  if (incomingSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    await bot.handleUpdate(update as never);
  } catch (err) {
    console.error("Error handling update:", err);
    // Still acknowledge with 200 so Telegram doesn't retry indefinitely;
    // the error is logged for the owner to investigate via `wrangler tail`.
  }

  return new Response("OK", { status: 200 });
}
