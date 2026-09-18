import { createBot } from "./telegram";
import { registerRoutes } from "./router";
import { handleWebhookRequest } from "./webhook";
import * as d1 from "./storage/d1";
import { publishContent } from "./admin/publish";
import type { Env } from "./env";

const WEBHOOK_PATH = "/telegram/webhook";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === WEBHOOK_PATH && request.method === "POST") {
      const bot = createBot(env);
      registerRoutes(bot, env);
      return handleWebhookRequest(request, env, bot);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      // Deliberately generic — never reveal OWNER_ID or other config here
      // (spec section 5: "Do not expose the owner ID through public endpoints").
      return new Response("Telegram personal bot is running.", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },

  // Cron Trigger: checks scheduled_tasks every minute and publishes any
  // that are due — no new incoming Telegram update required (spec section 16).
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDuePublications(env));
  },
};

async function runDuePublications(env: Env): Promise<void> {
  const bot = createBot(env);
  const due = await d1.listDueTasks(env, Date.now());

  for (const task of due) {
    try {
      await publishContent(bot, env, task.contentId, task.chatIds);
      await d1.markTaskStatus(env, task.id, "done");
    } catch (err) {
      console.error(`Scheduled task ${task.id} failed:`, err);
      await d1.markTaskStatus(env, task.id, "failed");
    }
  }
}
