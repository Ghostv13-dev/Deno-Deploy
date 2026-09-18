import type { Bot } from "gramio";
import type { Env } from "../env";
import * as d1 from "../storage/d1";
import { buildKeyboard } from "./buttons";

// Publishes content to one or more destinations, recording exactly where
// each message landed so it can be edited or deleted later without a new
// incoming Telegram update (spec sections 13, 16).
export async function publishContent(
  bot: Bot,
  env: Env,
  contentId: string,
  chatIds: number[],
): Promise<{ published: number; failed: number }> {
  const [content, buttons] = await Promise.all([
    d1.getContent(env, contentId),
    d1.listButtons(env, contentId),
  ]);
  if (!content) throw new Error(`Content ${contentId} not found`);

  const keyboard = buildKeyboard(buttons);
  let published = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      const sent = await bot.api.sendMessage({
        chat_id: chatId,
        text: `${content.title}\n\n${content.body}`,
        reply_markup: keyboard,
      });
      await d1.recordPublishedMessage(env, contentId, chatId, sent.message_id);
      published++;
    } catch (err) {
      console.error(`Failed to publish content ${contentId} to ${chatId}:`, err);
      failed++;
    }
  }

  return { published, failed };
}

// Edits the text of every already-published copy of this content
// (editMessageText, spec section 14) — no new post required.
export async function propagateContentEdit(
  bot: Bot,
  env: Env,
  contentId: string,
): Promise<{ updated: number }> {
  const [content, publishedMessages] = await Promise.all([
    d1.getContent(env, contentId),
    d1.listPublishedMessages(env, contentId),
  ]);
  if (!content) throw new Error(`Content ${contentId} not found`);

  let updated = 0;
  for (const msg of publishedMessages) {
    try {
      await bot.api.editMessageText({
        chat_id: msg.chatId,
        message_id: msg.messageId,
        text: `${content.title}\n\n${content.body}`,
      });
      updated++;
    } catch (err) {
      console.error(`Failed to edit message ${msg.messageId} in ${msg.chatId}:`, err);
    }
  }
  return { updated };
}

// Deletes every published copy of this content (deleteMessage).
export async function unpublishContent(
  bot: Bot,
  env: Env,
  contentId: string,
): Promise<{ deleted: number }> {
  const publishedMessages = await d1.listPublishedMessages(env, contentId);
  let deleted = 0;
  for (const msg of publishedMessages) {
    try {
      await bot.api.deleteMessage({ chat_id: msg.chatId, message_id: msg.messageId });
      deleted++;
    } catch (err) {
      console.error(`Failed to delete message ${msg.messageId} in ${msg.chatId}:`, err);
    }
  }
  return { deleted };
}
