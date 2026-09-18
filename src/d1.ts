// D1 access layer. Kept intentionally small (spec section 8): only content
// the owner creates, buttons, published-message identifiers, and optional
// scheduled tasks. No user/message-history tables live here.

import type { Env } from "../env";

export interface Content {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface ButtonRow {
  id: string;
  contentId: string;
  text: string;
  url: string;
  position: number;
}

export interface PublishedMessage {
  id: string;
  contentId: string;
  chatId: number;
  messageId: number;
}

export interface ScheduledTask {
  id: string;
  contentId: string;
  chatIds: number[];
  runAt: number;
  status: "pending" | "done" | "failed";
}

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

// ---- bot_config (singleton row) --------------------------------------------

export async function ensureBotConfig(env: Env): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO bot_config (id, owner_id, settings, created_at, updated_at)
     VALUES (1, ?, '{}', ?, ?)
     ON CONFLICT(id) DO UPDATE SET owner_id = excluded.owner_id`,
  )
    .bind(Number(env.OWNER_ID), now, now)
    .run();
}

// ---- content ----------------------------------------------------------------

export async function createContent(env: Env, title: string, body: string): Promise<Content> {
  const id = newId("content");
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO content (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, title, body, now, now)
    .run();
  return { id, title, body, createdAt: now, updatedAt: now };
}

export async function updateContentBody(env: Env, id: string, body: string): Promise<void> {
  await env.DB.prepare(`UPDATE content SET body = ?, updated_at = ? WHERE id = ?`)
    .bind(body, Date.now(), id)
    .run();
}

export async function getContent(env: Env, id: string): Promise<Content | null> {
  const row = await env.DB.prepare(`SELECT * FROM content WHERE id = ?`).bind(id).first();
  if (!row) return null;
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export async function listContent(env: Env, limit = 20): Promise<Content[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM content ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all();
  return res.results.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }));
}

// ---- buttons ------------------------------------------------------------------

export async function addButton(
  env: Env,
  contentId: string,
  text: string,
  url: string,
  position = 0,
): Promise<ButtonRow> {
  const id = newId("button");
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO buttons (id, content_id, text, url, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, contentId, text, url, position, now, now)
    .run();
  return { id, contentId, text, url, position };
}

export async function listButtons(env: Env, contentId: string): Promise<ButtonRow[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM buttons WHERE content_id = ? ORDER BY position`,
  )
    .bind(contentId)
    .all();
  return res.results.map((row) => ({
    id: row.id as string,
    contentId: row.content_id as string,
    text: row.text as string,
    url: row.url as string,
    position: row.position as number,
  }));
}

export async function updateButtonUrl(env: Env, buttonId: string, url: string): Promise<void> {
  await env.DB.prepare(`UPDATE buttons SET url = ?, updated_at = ? WHERE id = ?`)
    .bind(url, Date.now(), buttonId)
    .run();
}

export async function getButton(env: Env, buttonId: string): Promise<ButtonRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM buttons WHERE id = ?`).bind(buttonId).first();
  if (!row) return null;
  return {
    id: row.id as string,
    contentId: row.content_id as string,
    text: row.text as string,
    url: row.url as string,
    position: row.position as number,
  };
}

// ---- published_messages ---------------------------------------------------------

export async function recordPublishedMessage(
  env: Env,
  contentId: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  const id = newId("pub");
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO published_messages (id, content_id, chat_id, message_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, contentId, chatId, messageId, now, now)
    .run();
}

export async function listPublishedMessages(
  env: Env,
  contentId: string,
): Promise<PublishedMessage[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM published_messages WHERE content_id = ?`,
  )
    .bind(contentId)
    .all();
  return res.results.map((row) => ({
    id: row.id as string,
    contentId: row.content_id as string,
    chatId: row.chat_id as number,
    messageId: row.message_id as number,
  }));
}

// ---- scheduled_tasks --------------------------------------------------------------

export async function scheduleTask(
  env: Env,
  contentId: string,
  chatIds: number[],
  runAt: number,
): Promise<ScheduledTask> {
  const id = newId("sched");
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO scheduled_tasks (id, content_id, chat_ids, run_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(id, contentId, JSON.stringify(chatIds), runAt, now, now)
    .run();
  return { id, contentId, chatIds, runAt, status: "pending" };
}

export async function listDueTasks(env: Env, now: number): Promise<ScheduledTask[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM scheduled_tasks WHERE status = 'pending' AND run_at <= ?`,
  )
    .bind(now)
    .all();
  return res.results.map((row) => ({
    id: row.id as string,
    contentId: row.content_id as string,
    chatIds: JSON.parse(row.chat_ids as string),
    runAt: row.run_at as number,
    status: row.status as "pending" | "done" | "failed",
  }));
}

export async function markTaskStatus(
  env: Env,
  taskId: string,
  status: "done" | "failed",
): Promise<void> {
  await env.DB.prepare(`UPDATE scheduled_tasks SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, Date.now(), taskId)
    .run();
}
