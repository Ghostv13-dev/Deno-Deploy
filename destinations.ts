import { sql } from "../db.ts";

export async function addDestination(chatId: number, label: string, type: "channel" | "group") {
  const [row] = await sql`
    INSERT INTO destinations (telegram_chat_id, label, type)
    VALUES (${chatId}, ${label}, ${type})
    ON CONFLICT (telegram_chat_id) DO UPDATE SET label = EXCLUDED.label, type = EXCLUDED.type
    RETURNING id
  `;
  return row.id as number;
}

export async function removeDestination(id: number) {
  await sql`DELETE FROM destinations WHERE id = ${id}`;
}

export async function listDestinations() {
  return sql`SELECT id, telegram_chat_id, label, type, created_at FROM destinations ORDER BY label ASC`;
}

// Resolves destination IDs (from the admin UI) to raw Telegram chat IDs
// for publishToChats(). Falls back to treating unmatched values as raw
// chat IDs, so callers can still pass one directly if they want to.
export async function resolveDestinationChatIds(destinationIds: number[]): Promise<number[]> {
  if (destinationIds.length === 0) return [];
  const rows = await sql`
    SELECT telegram_chat_id FROM destinations WHERE id IN ${sql(destinationIds)}
  `;
  return rows.map((r) => Number(r.telegram_chat_id));
}
