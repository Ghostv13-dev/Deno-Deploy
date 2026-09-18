// Owner-only admin commands. Every handler re-checks OWNER_ID itself
// (spec section 5: no admins table, no username-based auth, always compare
// sender_id === OWNER_ID) rather than trusting router-level wiring alone.

import type { Env } from "../env";
import { isOwner } from "../telegram";
import * as d1 from "../storage/d1";
import {
  createContentFromCommand,
  editContentBody,
  formatContentList,
  formatContentSummary,
} from "../admin/content";
import { addButtonToContent, changeButtonUrl, formatButtonList } from "../admin/buttons";
import { propagateContentEdit, publishContent, unpublishContent } from "../admin/publish";
import { clearConversationState, setConversationState } from "../storage/kv";

function senderId(context: any): number | undefined {
  return context.payload?.from?.id;
}

async function requireOwner(context: any, env: Env): Promise<boolean> {
  if (isOwner(env, senderId(context))) return true;
  await context.send("This action is restricted to the bot owner.");
  return false;
}

// /new <title> | <body>
export async function handleNew(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const args = (context.text ?? "").split("|");
  const title = args[0]?.trim();
  const body = args.slice(1).join("|").trim();
  if (!title || !body) {
    await context.send("Usage: /new <title> | <body>");
    return;
  }
  const content = await createContentFromCommand(env, title, body);
  await context.send(`Created content ${content.id}\n\n${formatContentSummary(content)}`);
}

// /list
export async function handleList(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const items = await d1.listContent(env);
  await context.send(formatContentList(items));
}

// /publish <contentId> <chatId1,chatId2,...>
export async function handlePublish(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const [contentId, chatIdsRaw] = (context.text ?? "").trim().split(/\s+/);
  if (!contentId || !chatIdsRaw) {
    await context.send("Usage: /publish <contentId> <chatId1,chatId2,...>");
    return;
  }
  const chatIds = chatIdsRaw.split(",").map((s: string) => Number(s.trim())).filter(Boolean);
  const result = await publishContent(context.bot, env, contentId, chatIds);
  await context.send(`Published to ${result.published} chat(s). ${result.failed} failed.`);
}

// /edit <contentId> | <new body>
export async function handleEdit(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const raw = context.text ?? "";
  const sep = raw.indexOf("|");
  if (sep === -1) {
    await context.send("Usage: /edit <contentId> | <new body>");
    return;
  }
  const contentId = raw.slice(0, sep).trim();
  const newBody = raw.slice(sep + 1).trim();
  await editContentBody(env, contentId, newBody);
  const result = await propagateContentEdit(context.bot, env, contentId);
  await context.send(`Updated ${result.updated} published message(s).`);
}

// /unpublish <contentId>
export async function handleUnpublish(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const contentId = (context.text ?? "").trim();
  if (!contentId) {
    await context.send("Usage: /unpublish <contentId>");
    return;
  }
  const result = await unpublishContent(context.bot, env, contentId);
  await context.send(`Deleted ${result.deleted} published message(s).`);
}

// /addbutton <contentId> <text> | <url>
export async function handleAddButton(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const raw = (context.text ?? "").trim();
  const firstSpace = raw.indexOf(" ");
  const sep = raw.indexOf("|");
  if (firstSpace === -1 || sep === -1) {
    await context.send("Usage: /addbutton <contentId> <text> | <url>");
    return;
  }
  const contentId = raw.slice(0, firstSpace).trim();
  const text = raw.slice(firstSpace + 1, sep).trim();
  const url = raw.slice(sep + 1).trim();
  const button = await addButtonToContent(env, contentId, text, url);
  await context.send(`Added button ${button.id} ("${text}" → ${url}).`);
}

// /buttons <contentId>
export async function handleButtons(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const contentId = (context.text ?? "").trim();
  if (!contentId) {
    await context.send("Usage: /buttons <contentId>");
    return;
  }
  const buttons = await d1.listButtons(env, contentId);
  await context.send(formatButtonList(buttons));
}

// /setbuttonurl <buttonId>  -> starts a short conversation asking for the
// new URL (matches the "waiting_for_url" example in the spec, section 7).
export async function handleSetButtonUrl(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const buttonId = (context.text ?? "").trim();
  if (!buttonId) {
    await context.send("Usage: /setbuttonurl <buttonId>");
    return;
  }
  const button = await d1.getButton(env, buttonId);
  if (!button) {
    await context.send(`Button ${buttonId} not found.`);
    return;
  }
  await setConversationState(env, senderId(context)!, {
    state: "waiting_for_url",
    data: { buttonId },
  });
  await context.send(`Send the new URL for "${button.text}" (or /cancel).`);
}

// /schedule <contentId> <chatId1,chatId2,...> <ISO-datetime>
export async function handleSchedule(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const [contentId, chatIdsRaw, whenRaw] = (context.text ?? "").trim().split(/\s+/);
  if (!contentId || !chatIdsRaw || !whenRaw) {
    await context.send("Usage: /schedule <contentId> <chatId1,chatId2,...> <2026-09-20T10:00>");
    return;
  }
  const runAt = new Date(whenRaw).getTime();
  if (Number.isNaN(runAt)) {
    await context.send("Couldn't parse that date/time.");
    return;
  }
  const chatIds = chatIdsRaw.split(",").map((s: string) => Number(s.trim())).filter(Boolean);
  const task = await d1.scheduleTask(env, contentId, chatIds, runAt);
  await context.send(`Scheduled ${task.id} for ${new Date(runAt).toLocaleString()}.`);
}

// /reply <ticketId> <message>  -- reply to an anonymous support request
// (spec section 18). Looks up the temporary ticket->user mapping in KV.
export async function handleReply(context: any, env: Env) {
  if (!(await requireOwner(context, env))) return;
  const raw = (context.text ?? "").trim();
  const spaceIdx = raw.indexOf(" ");
  if (spaceIdx === -1) {
    await context.send("Usage: /reply <ticketId> <message>");
    return;
  }
  const ticketId = raw.slice(0, spaceIdx).trim();
  const message = raw.slice(spaceIdx + 1).trim();

  const rawTicket = await env.STATE.get(`support:${ticketId}`);
  if (!rawTicket) {
    await context.send(`Ticket #${ticketId} not found or expired.`);
    return;
  }
  const { userId } = JSON.parse(rawTicket) as { userId: number };
  try {
    await context.bot.api.sendMessage({ chat_id: userId, text: message });
    await context.send(`Sent to ticket #${ticketId}.`);
  } catch (err) {
    await context.send(`Failed to send: ${(err as Error).message}`);
  }
}

// /cancel — clears any in-progress conversation state.
export async function handleCancel(context: any, env: Env) {
  const uid = senderId(context);
  if (uid) await clearConversationState(env, uid);
  await context.send("Cancelled.");
}
