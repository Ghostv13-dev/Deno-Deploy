import { InlineKeyboard } from "gramio";
import type { Env } from "../env";
import { joinApproveData, joinDeclineData } from "./callback";

// A chat_join_request update does not require the owner to be watching a
// group in real time — the bot proactively pings them, matching spec
// section 16 ("proactive bot operations").
export async function handleJoinRequest(context: any, env: Env): Promise<void> {
  const request = context.payload; // raw ChatJoinRequest
  const chatId = request?.chat?.id;
  const userId = request?.from?.id;
  if (!chatId || !userId) return;

  const label = request.from?.username
    ? `@${request.from.username}`
    : request.from?.first_name ?? `user ${userId}`;

  const keyboard = new InlineKeyboard()
    .text("Approve", joinApproveData.pack({ chatId, userId }))
    .row()
    .text("Decline", joinDeclineData.pack({ chatId, userId }));

  await context.bot.api.sendMessage({
    chat_id: Number(env.OWNER_ID),
    text: `Join request from ${label} for chat ${chatId}.`,
    reply_markup: keyboard,
  });
}
