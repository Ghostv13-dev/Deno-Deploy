import { sql } from "../db.ts";
import type { Bot } from "grammy";

export async function requestAccess(tgUser: { id: number; username?: string }): Promise<"pending" | "approved" | "declined"> {
  const [existing] = await sql`SELECT status FROM access_requests WHERE telegram_user_id = ${tgUser.id}`;
  if (existing) return existing.status;

  await sql`
    INSERT INTO access_requests (telegram_user_id, username, status)
    VALUES (${tgUser.id}, ${tgUser.username ?? null}, 'pending')
  `;
  return "pending";
}

export async function getAccessStatus(telegramUserId: number): Promise<"pending" | "approved" | "declined" | "none"> {
  const [row] = await sql`SELECT status FROM access_requests WHERE telegram_user_id = ${telegramUserId}`;
  return row?.status ?? "none";
}

export async function listPendingAccessRequests() {
  return sql`
    SELECT id, telegram_user_id, username, requested_at
    FROM access_requests WHERE status = 'pending' ORDER BY requested_at ASC
  `;
}

async function decide(bot: Bot, telegramUserId: number, status: "approved" | "declined") {
  await sql`
    UPDATE access_requests SET status = ${status}, decided_at = now()
    WHERE telegram_user_id = ${telegramUserId}
  `;
  const message = status === "approved"
    ? "You've been approved! You can now use the full set of features."
    : "Your access request was declined.";
  await bot.api.sendMessage(telegramUserId, message);
}

export const approveAccess = (bot: Bot, telegramUserId: number) => decide(bot, telegramUserId, "approved");
export const declineAccess = (bot: Bot, telegramUserId: number) => decide(bot, telegramUserId, "declined");
