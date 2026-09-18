import { Bot, webhookCallback } from "grammy";
import * as support from "./modules/support.ts";
import * as publishing from "./modules/publishing.ts";
import * as destinations from "./modules/destinations.ts";
import * as access from "./modules/accessRequests.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const OWNER_ID = Number(Deno.env.get("OWNER_TELEGRAM_ID"));
const ADMIN_API_KEY = Deno.env.get("ADMIN_API_KEY");
const ADMIN_NOTIFY_CHAT_ID = Deno.env.get("ADMIN_NOTIFY_CHAT_ID");
const AUTO_APPROVE_JOIN_REQUESTS = Deno.env.get("AUTO_APPROVE_JOIN_REQUESTS") === "true";
const BOT_USERNAME = Deno.env.get("BOT_USERNAME"); // no "@", e.g. "Sy_kickbot"

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set");

const bot = new Bot(BOT_TOKEN);

function isOwner(ctx: { from?: { id: number } }) {
  return ctx.from?.id === OWNER_ID;
}

bot.command("start", (ctx) =>
  ctx.reply("Welcome! Send a message any time and an agent will get back to you here.")
);

bot.command("help", (ctx) => ctx.reply("Just type your question and we'll respond as soon as possible."));

bot.command("admin", (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("Not allowed.");
  return ctx.reply("Hello owner. Use the /admin/* HTTP API to publish, schedule, and manage buttons.");
});

bot.command("requestaccess", async (ctx) => {
  if (!ctx.from) return;
  const status = await access.requestAccess(ctx.from);
  if (status === "approved") return ctx.reply("You're already approved — go ahead and use the bot's features.");
  if (status === "declined") return ctx.reply("Your previous access request was declined.");

  await ctx.reply("Your access request has been sent to the owner. You'll be notified once it's reviewed.");
  if (ADMIN_NOTIFY_CHAT_ID) {
    await bot.api.sendMessage(
      ADMIN_NOTIFY_CHAT_ID,
      `New access request from ${ctx.from.username ? "@" + ctx.from.username : ctx.from.id} (id: ${ctx.from.id}).\nApprove: POST /admin/access-requests/${ctx.from.id}/approve\nDecline: POST /admin/access-requests/${ctx.from.id}/decline`
    );
  }
});

bot.on("chat_join_request", (ctx) =>
  support.logJoinRequest(bot, ctx.chatJoinRequest, AUTO_APPROVE_JOIN_REQUESTS)
);

// Group @mention assistance — e.g. "@Sy_kickbot price of Product A?".
// Looks up published content by keyword match on title and replies with
// its buttons, matching the "business assistant within a community" role.
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return; // commands are handled above

  const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
  if (isGroup) {
    if (!BOT_USERNAME || !text.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`)) return;
    const query = text.replace(new RegExp(`@${BOT_USERNAME}`, "i"), "").trim();
    return support.answerGroupMention(bot, ctx.chat.id, query);
  }

  // Private chat: treat as a support message.
  return support.handleIncomingUserMessage(bot, ctx.message, ADMIN_NOTIFY_CHAT_ID);
});

const handleTelegramUpdate = webhookCallback(bot, "std/http", { secretToken: WEBHOOK_SECRET });

function requireAdminKey(req: Request): Response | null {
  if (req.headers.get("x-api-key") !== ADMIN_API_KEY) {
    return Response.json({ ok: false, error: "invalid api key" }, { status: 401 });
  }
  return null;
}

async function handleAdmin(req: Request, url: URL): Promise<Response> {
  const unauthorized = requireAdminKey(req);
  if (unauthorized) return unauthorized;

  const parts = url.pathname.split("/").filter(Boolean); // ["admin", ...]

  if (url.pathname === "/admin/tickets" && req.method === "GET") {
    return Response.json(await support.listOpenTickets());
  }

  if (parts[1] === "tickets" && parts[3] === "messages" && req.method === "GET") {
    return Response.json(await support.getTicketMessages(Number(parts[2])));
  }

  if (parts[1] === "tickets" && parts[3] === "reply" && req.method === "POST") {
    const { text } = await req.json();
    if (!text) return Response.json({ ok: false, error: "text is required" }, { status: 400 });
    await support.agentReply(bot, Number(parts[2]), text);
    return Response.json({ ok: true });
  }

  if (parts[1] === "tickets" && parts[3] === "close" && req.method === "POST") {
    await support.closeTicket(Number(parts[2]));
    return Response.json({ ok: true });
  }

  if (url.pathname === "/admin/content" && req.method === "POST") {
    const { title, body, buttons } = await req.json();
    if (!title || !body) return Response.json({ ok: false, error: "title and body are required" }, { status: 400 });
    const contentId = await publishing.createContent(title, body, buttons ?? []);
    return Response.json({ ok: true, contentId });
  }

  if (parts[1] === "content" && parts[3] === "publish" && req.method === "POST") {
    const { chatId, chatIds, destinationIds } = await req.json();
    if (destinationIds?.length) {
      const resolved = await destinations.resolveDestinationChatIds(destinationIds);
      await publishing.publishToChats(bot, Number(parts[2]), resolved);
    } else if (chatIds?.length) {
      await publishing.publishToChats(bot, Number(parts[2]), chatIds);
    } else if (chatId) {
      await publishing.publishToChat(bot, Number(parts[2]), chatId);
    } else {
      return Response.json({ ok: false, error: "chatId, chatIds, or destinationIds is required" }, { status: 400 });
    }
    return Response.json({ ok: true });
  }

  // --- Destinations ---
  if (url.pathname === "/admin/destinations" && req.method === "GET") {
    return Response.json(await destinations.listDestinations());
  }
  if (url.pathname === "/admin/destinations" && req.method === "POST") {
    const { chatId, label, type } = await req.json();
    if (!chatId || !label || !type) {
      return Response.json({ ok: false, error: "chatId, label, and type are required" }, { status: 400 });
    }
    const id = await destinations.addDestination(chatId, label, type);
    return Response.json({ ok: true, id });
  }
  if (parts[1] === "destinations" && req.method === "DELETE") {
    await destinations.removeDestination(Number(parts[2]));
    return Response.json({ ok: true });
  }

  // --- Access requests ---
  if (url.pathname === "/admin/access-requests" && req.method === "GET") {
    return Response.json(await access.listPendingAccessRequests());
  }
  if (parts[1] === "access-requests" && parts[3] === "approve" && req.method === "POST") {
    await access.approveAccess(bot, Number(parts[2]));
    return Response.json({ ok: true });
  }
  if (parts[1] === "access-requests" && parts[3] === "decline" && req.method === "POST") {
    await access.declineAccess(bot, Number(parts[2]));
    return Response.json({ ok: true });
  }

  if (parts[1] === "content" && parts[3] === "schedule" && req.method === "POST") {
    const { chatId, publishAt } = await req.json();
    if (!chatId || !publishAt) {
      return Response.json({ ok: false, error: "chatId and publishAt (ISO datetime) are required" }, { status: 400 });
    }
    const scheduledPostId = await publishing.scheduleContent(Number(parts[2]), chatId, publishAt);
    return Response.json({ ok: true, scheduledPostId });
  }

  if (parts[1] === "buttons" && req.method === "PATCH") {
    const { url: newUrl } = await req.json();
    if (!newUrl) return Response.json({ ok: false, error: "url is required" }, { status: 400 });
    const result = await publishing.updateButtonUrl(bot, Number(parts[2]), newUrl);
    return Response.json({ ok: true, ...result });
  }

  return Response.json({ ok: false, error: "not found" }, { status: 404 });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return Response.json({ ok: true });
  }

  if (url.pathname === "/telegram/webhook" && req.method === "POST") {
    try {
      return await handleTelegramUpdate(req);
    } catch (err) {
      console.error("[webhook] error", err);
      return new Response("error", { status: 500 });
    }
  }

  if (url.pathname.startsWith("/admin/")) {
    return handleAdmin(req, url);
  }

  return new Response("Not found", { status: 404 });
});

// --- Cron: Deno Deploy runs this on its own, no external scheduler needed ---
// Every minute: publish anything due. Daily at 03:00 Asia/Manila (19:00 UTC): close stale tickets.
Deno.cron("publish due scheduled posts", "* * * * *", () => publishing.runDueScheduledPosts(bot));
Deno.cron("auto-close stale tickets", "0 19 * * *", () => support.autoCloseStaleTickets());
