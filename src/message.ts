// Handles plain (non-command) text messages: continuing an in-progress
// owner conversation (e.g. "waiting_for_url"), or a normal user's message,
// which follows the no-permanent-record path from spec section 6.

import type { Env } from "../env";
import { isOwner } from "../telegram";
import { changeButtonUrl } from "../admin/buttons";
import { clearConversationState, getConversationState } from "../storage/kv";

function senderId(context: any): number | undefined {
  return context.payload?.from?.id;
}

async function continueOwnerConversation(context: any, env: Env, userId: number): Promise<boolean> {
  const state = await getConversationState(env, userId);
  if (!state) return false;

  if (state.state === "waiting_for_url") {
    const newUrl = (context.text ?? "").trim();
    const buttonId = state.data?.buttonId as string;
    if (!newUrl || !buttonId) {
      await clearConversationState(env, userId);
      return true;
    }
    const result = await changeButtonUrl(context.bot, env, buttonId, newUrl);
    await clearConversationState(env, userId);
    if (!result) {
      await context.send("That button no longer exists.");
    } else {
      await context.send(
        `Updated the button. ${result.updated} published message(s) now point to the new URL.`,
      );
    }
    return true;
  }

  return false;
}

// Random short id, good enough for a temporary, non-guessable ticket
// reference (not a security boundary — the owner is the only reader).
function newTicketId(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function handleNormalUserMessage(context: any, env: Env): Promise<void> {
  const text = (context.text ?? "").trim();
  if (!text) return;

  // Lightweight anonymous support workflow (spec section 18): the owner
  // sees a ticket number and the message, never the sender's Telegram ID
  // or username, unless they explicitly look it up.
  const ticketId = newTicketId();
  await env.STATE.put(
    `support:${ticketId}`,
    JSON.stringify({ userId: senderId(context) }),
    { expirationTtl: 24 * 60 * 60 },
  );

  await context.bot.api.sendMessage({
    chat_id: Number(env.OWNER_ID),
    text: `Anonymous request #${ticketId}\n\n${text}\n\n(Reply with /reply ${ticketId} <message>)`,
  });

  await context.send("Thanks — your message has been passed along. You'll get a reply here.");
}

export async function handleMessage(context: any, env: Env): Promise<void> {
  const userId = senderId(context);
  if (!userId) return;

  const text = (context.text ?? "").trim();
  // Commands are handled by their own bot.command() registrations; don't
  // let an unrecognized/duplicate pass-through also treat it as plain text.
  if (text.startsWith("/")) return;

  if (isOwner(env, userId)) {
    // Owner sent plain text — only meaningful if it's continuing a flow
    // like /setbuttonurl. Otherwise, stay quiet rather than being noisy.
    await continueOwnerConversation(context, env, userId);
    return;
  }

  await handleNormalUserMessage(context, env);
}
