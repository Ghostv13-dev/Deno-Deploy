import type { Bot } from "gramio";
import type { Env } from "./env";
import { handleMessage } from "./handlers/message";
import {
  handleJoinApprove,
  handleJoinDecline,
  joinApproveData,
  joinDeclineData,
} from "./handlers/callback";
import { handleJoinRequest } from "./handlers/join-request";
import {
  handleAddButton,
  handleButtons,
  handleCancel,
  handleEdit,
  handleList,
  handleNew,
  handlePublish,
  handleReply,
  handleSchedule,
  handleSetButtonUrl,
  handleUnpublish,
} from "./handlers/owner";

export function registerRoutes(bot: Bot, env: Env): void {
  // Commands (owner-only ones re-check OWNER_ID internally, see owner.ts)
  bot
    .command("start", (context) =>
      context.send(
        "Hi! This bot is privately operated. Send a message and it'll be passed along, or /support if you need help.",
      ),
    )
    .command("new", (context) => handleNew(context, env))
    .command("list", (context) => handleList(context, env))
    .command("publish", (context) => handlePublish(context, env))
    .command("edit", (context) => handleEdit(context, env))
    .command("unpublish", (context) => handleUnpublish(context, env))
    .command("addbutton", (context) => handleAddButton(context, env))
    .command("buttons", (context) => handleButtons(context, env))
    .command("setbuttonurl", (context) => handleSetButtonUrl(context, env))
    .command("schedule", (context) => handleSchedule(context, env))
    .command("reply", (context) => handleReply(context, env))
    .command("support", (context) =>
      context.send("Go ahead — send your message as a normal text message and it'll be passed along."),
    )
    .command("cancel", (context) => handleCancel(context, env));

  // Update Router: classify by update type (spec section 17)
  bot.on("message", (context) => handleMessage(context, env));
  bot.on("chat_join_request", (context) => handleJoinRequest(context, env));

  bot.callbackQuery(joinApproveData, (context) => handleJoinApprove(context, env));
  bot.callbackQuery(joinDeclineData, (context) => handleJoinDecline(context, env));
}
