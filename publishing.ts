import { sql } from "../db.ts";
import type { Bot } from "grammy";

export interface InlineButton {
  text: string;
  url: string;
}

function buildInlineKeyboard(buttons: InlineButton[]) {
  // One button per row by default — simplest, safest layout for dynamic content.
  return { inline_keyboard: buttons.map((b) => [{ text: b.text, url: b.url }]) };
}

export async function createContent(title: string, body: string, buttons: InlineButton[]): Promise<number> {
  const [row] = await sql`INSERT INTO content (title, body) VALUES (${title}, ${body}) RETURNING id`;
  const contentId = row.id as number;

  for (let i = 0; i < buttons.length; i++) {
    await sql`
      INSERT INTO buttons (content_id, text, url, position)
      VALUES (${contentId}, ${buttons[i].text}, ${buttons[i].url}, ${i})
    `;
  }
  return contentId;
}

async function getButtons(contentId: number): Promise<InlineButton[]> {
  const rows = await sql`SELECT text, url FROM buttons WHERE content_id = ${contentId} ORDER BY position ASC`;
  return rows as unknown as InlineButton[];
}

// Records every place a piece of content was posted, so buttons can be
// mass-edited later without needing any new incoming Telegram update.
async function recordPublishedMessage(contentId: number, chatId: number, messageId: number) {
  await sql`
    INSERT INTO telegram_messages (content_id, telegram_chat_id, telegram_message_id)
    VALUES (${contentId}, ${chatId}, ${messageId})
    ON CONFLICT (telegram_chat_id, telegram_message_id) DO NOTHING
  `;
}

export async function publishToChat(bot: Bot, contentId: number, chatId: number | string) {
  const [row] = await sql`SELECT title, body FROM content WHERE id = ${contentId}`;
  if (!row) throw new Error(`Content ${contentId} not found`);

  const buttons = await getButtons(contentId);
  const text = `${row.title}\n\n${row.body}`;

  const sent = await bot.api.sendMessage(chatId, text, {
    reply_markup: buttons.length ? buildInlineKeyboard(buttons) : undefined,
  });
  await recordPublishedMessage(contentId, Number(chatId), sent.message_id);
}

// Publish the same content to several destinations in one call.
export async function publishToChats(bot: Bot, contentId: number, chatIds: (number | string)[]) {
  for (const chatId of chatIds) {
    await publishToChat(bot, contentId, chatId);
  }
}

// --- Scheduling ---
export async function scheduleContent(contentId: number, chatId: string, publishAtIso: string): Promise<number> {
  const [row] = await sql`
    INSERT INTO scheduled_posts (content_id, telegram_chat_id, publish_at)
    VALUES (${contentId}, ${chatId}, ${publishAtIso}) RETURNING id
  `;
  return row.id;
}

// Called every minute from main.ts's cron to publish anything due.
export async function runDueScheduledPosts(bot: Bot) {
  const due = await sql`
    SELECT id, content_id, telegram_chat_id FROM scheduled_posts
    WHERE published_at IS NULL AND publish_at <= now()
  `;
  for (const row of due) {
    try {
      await publishToChat(bot, row.content_id, row.telegram_chat_id);
      await sql`UPDATE scheduled_posts SET published_at = now() WHERE id = ${row.id}`;
    } catch (err) {
      console.error(`[scheduler] failed to publish scheduled post ${row.id}`, err);
    }
  }
}

// The core "dynamic URL" workflow: change a button's URL once, and every
// place that content was ever posted gets its message edited automatically.
export async function updateButtonUrl(bot: Bot, buttonId: number, newUrl: string) {
  const [button] = await sql`SELECT content_id FROM buttons WHERE id = ${buttonId}`;
  if (!button) throw new Error(`Button ${buttonId} not found`);

  await sql`UPDATE buttons SET url = ${newUrl}, updated_at = now() WHERE id = ${buttonId}`;

  const contentId = button.content_id;
  const buttons = await getButtons(contentId);
  const messages = await sql`
    SELECT telegram_chat_id, telegram_message_id FROM telegram_messages WHERE content_id = ${contentId}
  `;

  for (const m of messages) {
    await bot.api.editMessageReplyMarkup(m.telegram_chat_id, m.telegram_message_id, {
      reply_markup: buildInlineKeyboard(buttons),
    });
  }

  return { contentId, affectedMessages: messages.length };
}
