import { CallbackData } from "gramio";
import type { Env } from "../env";
import { isOwner } from "../telegram";

export const joinApproveData = new CallbackData("join_approve")
  .number("chatId")
  .number("userId");
export const joinDeclineData = new CallbackData("join_decline")
  .number("chatId")
  .number("userId");

function senderId(context: any): number | undefined {
  return context.payload?.from?.id;
}

export async function handleJoinApprove(context: any, env: Env): Promise<void> {
  if (!isOwner(env, senderId(context))) {
    await context.bot.api.answerCallbackQuery({
      callback_query_id: context.payload.id,
      text: "Owner only.",
    });
    return;
  }
  const { chatId, userId } = context.queryData;
  try {
    await context.bot.api.approveChatJoinRequest({ chat_id: chatId, user_id: userId });
    await context.bot.api.answerCallbackQuery({
      callback_query_id: context.payload.id,
      text: "Approved.",
    });
  } catch (err) {
    await context.bot.api.answerCallbackQuery({
      callback_query_id: context.payload.id,
      text: `Failed: ${(err as Error).message}`,
    });
  }
}

export async function handleJoinDecline(context: any, env: Env): Promise<void> {
  if (!isOwner(env, senderId(context))) {
    await context.bot.api.answerCallbackQuery({
      callback_query_id: context.payload.id,
      text: "Owner only.",
    });
    return;
  }
  const { chatId, userId } = context.queryData;
  try {
    await context.bot.api.declineChatJoinRequest({ chat_id: chatId, user_id: userId });
    await context.bot.api.answerCallbackQuery({
      callback_query_id: context.payload.id,
      text: "Declined.",
    });
  } catch (err) {
    await context.bot.api.answerCallbackQuery({
      callback_query_id: context.payload.id,
      text: `Failed: ${(err as Error).message}`,
    });
  }
}
