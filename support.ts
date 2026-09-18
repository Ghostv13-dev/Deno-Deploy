import { sql } from "../db.ts";
import type { Bot } from "grammy";

export async function findOrCreateUser(tgUser: { id: number; username?: string; first_name: string }) {
  const [row] = await sql`
    INSERT INTO users (telegram_user_id, username, first_name)
    VALUES (${tgUser.id}, ${tgUser.username ?? null}, ${tgUser.first_name})
    ON CONFLICT (telegram_user_id)
    DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name, updated_at = now()
    RETURNING id
  `;
  return row.id as number;
}

export async function findOrCreateChat(tgChat: { id: number; type: string; title?: string }) {
  const [row] = await sql`
    INSERT INTO chats (telegram_chat_id, type, title)
    VALUES (${tgChat.id}, ${tgChat.type}, ${tgChat.title ?? null})
    ON CONFLICT (telegram_chat_id) DO UPDATE SET title = EXCLUDED.title
    RETURNING id
  `;
  return row.id as number;
}

async function getOpenTicket(userId: number): Promise<number | null> {
  const [row] = await sql`
    SELECT id FROM tickets WHERE user_id = ${userId} AND status = 'open'
    ORDER BY created_at DESC LIMIT 1
  `;
  return row?.id ?? null;
}

async function createTicket(userId: number): Promise<number> {
  const [row] = await sql`INSERT INTO tickets (user_id, status) VALUES (${userId}, 'open') RETURNING id`;
  return row.id;
}

async function addMessage(
  ticketId: number,
  direction: "in" | "out",
  telegramChatId: number | null,
  telegramMessageId: number | null,
  content: string
) {
  await sql`
    INSERT INTO messages (ticket_id, telegram_chat_id, telegram_message_id, direction, content)
    VALUES (${ticketId}, ${telegramChatId}, ${telegramMessageId}, ${direction}, ${content})
  `;
}

// Called for any free-text DM that isn't a recognized command.
export async function handleIncomingUserMessage(
  bot: Bot,
  message: { from: any; chat: any; message_id: number; text?: string },
  adminNotifyChatId?: string
) {
  if (!message.from) return;

  const userId = await findOrCreateUser(message.from);
  await findOrCreateChat(message.chat);

  let ticketId = await getOpenTicket(userId);
  const isNewTicket = ticketId === null;
  if (ticketId === null) {
    ticketId = await createTicket(userId);
  }

  await addMessage(ticketId, "in", message.chat.id, message.message_id, message.text ?? "");

  if (isNewTicket) {
    await bot.api.sendMessage(
      message.chat.id,
      "Thanks — your message has been received. An agent will reply here shortly."
    );

    if (adminNotifyChatId) {
      await bot.api.sendMessage(adminNotifyChatId, `New support ticket #${ticketId}`);
    }
  }
}

// Called from the admin API when an agent replies to a ticket.
// The agent only ever sees the ticket ID — never the Telegram user ID.
export async function agentReply(bot: Bot, ticketId: number, text: string) {
  const [row] = await sql`
    SELECT u.telegram_user_id
    FROM tickets t JOIN users u ON u.id = t.user_id
    WHERE t.id = ${ticketId}
  `;
  if (!row) throw new Error(`Ticket ${ticketId} not found`);

  await addMessage(ticketId, "out", row.telegram_user_id, null, text);
  await bot.api.sendMessage(row.telegram_user_id, text);
}

export async function closeTicket(ticketId: number) {
  await sql`UPDATE tickets SET status = 'closed', updated_at = now() WHERE id = ${ticketId}`;
}

export async function listOpenTickets() {
  return sql`
    SELECT t.id, t.created_at, t.updated_at,
           (SELECT content FROM messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
    FROM tickets t WHERE t.status = 'open' ORDER BY t.updated_at DESC
  `;
}

export async function getTicketMessages(ticketId: number) {
  return sql`SELECT direction, content, created_at FROM messages WHERE ticket_id = ${ticketId} ORDER BY created_at ASC`;
}

// Auto-close tickets idle 7+ days — called from the daily cron in main.ts.
export async function autoCloseStaleTickets() {
  const result = await sql`
    UPDATE tickets SET status = 'closed', updated_at = now()
    WHERE status = 'open' AND updated_at < now() - interval '7 days'
  `;
  console.log(`[scheduler] auto-closed ${result.count} stale tickets`);
}

// Group @mention assistance — matches published content by keyword against
// the title (e.g. a product name) and replies with its buttons. Falls back
// to a generic "we'll get back to you" reply if nothing matches.
export async function answerGroupMention(bot: Bot, chatId: number, query: string) {
  if (!query) {
    await bot.api.sendMessage(chatId, "How can I help? Mention me with a question, e.g. \"@bot price of Product A\".");
    return;
  }

  const [content] = await sql`
    SELECT id, title, body FROM content WHERE title ILIKE ${"%" + query + "%"} ORDER BY updated_at DESC LIMIT 1
  `;

  if (!content) {
    await bot.api.sendMessage(chatId, "Thanks for reaching out — we'll get back to you here shortly.");
    return;
  }

  const buttons = await sql`SELECT text, url FROM buttons WHERE content_id = ${content.id} ORDER BY position ASC`;
  await bot.api.sendMessage(chatId, `${content.title}\n\n${content.body}`, {
    reply_markup: buttons.length
      ? { inline_keyboard: buttons.map((b) => [{ text: b.text, url: b.url }]) }
      : undefined,
  });
}

export async function logJoinRequest(
  bot: Bot,
  joinRequest: { chat: any; from: any },
  autoApprove: boolean
) {
  await sql`
    INSERT INTO audit_logs (actor, action, target, metadata)
    VALUES (${`telegram_user:${joinRequest.from.id}`}, 'join_request_received', ${`chat:${joinRequest.chat.id}`}, ${JSON.stringify({ username: joinRequest.from.username ?? null })})
  `;

  if (autoApprove) {
    await bot.api.approveChatJoinRequest(joinRequest.chat.id, joinRequest.from.id);
    await sql`
      INSERT INTO audit_logs (actor, action, target)
      VALUES ('system', 'join_request_auto_approved', ${`chat:${joinRequest.chat.id}:user:${joinRequest.from.id}`})
    `;
  }
}
