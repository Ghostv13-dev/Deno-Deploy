// A fresh Bot instance is created per Worker invocation (there's no
// persistent process to keep one alive between requests). This is cheap:
// registering handlers is just attaching closures, no network I/O happens
// until bot.api.* or bot.handleUpdate() is actually called.

import { Bot } from "gramio";
import type { Env } from "./env";

export function createBot(env: Env): Bot {
  return new Bot(env.TELEGRAM_BOT_TOKEN);
}

export function isOwner(env: Env, userId: number | undefined): boolean {
  return userId !== undefined && String(userId) === env.OWNER_ID;
}
