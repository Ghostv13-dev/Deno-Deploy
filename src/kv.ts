// Cloudflare KV access layer for temporary state only. Never a permanent
// message history (spec section 7): every write carries a TTL, and callers
// should explicitly delete state once a conversation finishes.

import type { Env } from "../env";

const DEFAULT_TTL_SECONDS = 30 * 60; // 30 minutes of inactivity

export interface ConversationState {
  state: string; // e.g. "waiting_for_title", "waiting_for_body", "waiting_for_url"
  data?: Record<string, unknown>;
}

function conversationKey(userId: number): string {
  return `conversation:${userId}`;
}

export async function setConversationState(
  env: Env,
  userId: number,
  value: ConversationState,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  await env.STATE.put(conversationKey(userId), JSON.stringify(value), {
    expirationTtl: ttlSeconds,
  });
}

export async function getConversationState(
  env: Env,
  userId: number,
): Promise<ConversationState | null> {
  const raw = await env.STATE.get(conversationKey(userId));
  return raw ? (JSON.parse(raw) as ConversationState) : null;
}

export async function clearConversationState(env: Env, userId: number): Promise<void> {
  await env.STATE.delete(conversationKey(userId));
}
