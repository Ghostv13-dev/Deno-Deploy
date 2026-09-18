# Telegram Bot — grammY on Deno Deploy (Postgres via postgres.js)

Single-file serverless bot. No build step, no Dockerfile, no server to keep
running — Deno Deploy runs `main.ts` on request, and Deno's built-in
`Deno.cron()` replaces node-cron for the recurring jobs (scheduled posts,
stale-ticket cleanup).

```
Telegram → POST /telegram/webhook → grammY → handler → Postgres + Telegram Bot API
Admin/API → /admin/*  (x-api-key)  → Postgres + Telegram Bot API directly
Deno.cron → every minute / daily   → scheduled posts, stale-ticket cleanup
```

## Phone-only workflow (Termux)

You never need the Deno CLI installed locally for this — GitHub + the Deno
Deploy dashboard do the building. Termux is only for `git`.

```bash
pkg install git
git clone <your-new-empty-repo-url> telegram-bot
cd telegram-bot
# copy in main.ts, db.ts, deno.json, modules/, migrations/, .gitignore, README.md
git add .
git commit -m "grammY + Deno Deploy setup"
git push
```

## 1. Run the schema migration once

You need `psql` (or any Postgres client) to run this — most people do this
once from a browser-based SQL tool (e.g. your Postgres/Prisma provider's
dashboard usually has a "Query" or "SQL editor" tab) so you don't need a
local Postgres client on the phone at all. Paste the contents of
`migrations/0001_init.sql` there and run it once.

## 2. Connect GitHub to Deno Deploy

1. Go to [dash.deno.com](https://dash.deno.com) and sign in.
2. New Project → connect your GitHub repo.
3. Entry point: `main.ts`.
4. Set environment variables in the project's Settings → Environment Variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `OWNER_TELEGRAM_ID`
   - `ADMIN_API_KEY`
   - `DATABASE_URL` (your Postgres connection string)
   - optional: `ADMIN_NOTIFY_CHAT_ID`, `AUTO_APPROVE_JOIN_REQUESTS`
5. Save. Every `git push` to your default branch auto-deploys from here on —
   nothing else to trigger from your phone.

Since your bot token, webhook secret, and DB password were pasted in
plaintext earlier in this chat, regenerate all three (BotFather `/token`,
a fresh random webhook secret, and a rotated DB password from your Postgres
provider) before using them here.

## 3. Point Telegram at the webhook

Deno Deploy gives you `https://<your-project>.deno.dev`. Register it:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-project>.deno.dev/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Verify: `curl https://<your-project>.deno.dev/health` → `{"ok":true}`.

## 4. Admin API

All routes require header `x-api-key: <ADMIN_API_KEY>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/tickets` | list open support tickets |
| GET | `/admin/tickets/:id/messages` | full thread for a ticket |
| POST | `/admin/tickets/:id/reply` `{text}` | agent reply → sent to user |
| POST | `/admin/tickets/:id/close` | close a ticket |
| POST | `/admin/content` `{title, body, buttons:[{text,url}]}` | create content |
| POST | `/admin/content/:id/publish` `{chatId}`, `{chatIds:[...]}`, or `{destinationIds:[...]}` | publish now to one or several destinations |
| POST | `/admin/content/:id/schedule` `{chatId, publishAt}` | queue a future publish (ISO datetime, UTC) |
| PATCH | `/admin/buttons/:id` `{url}` | change a button's URL — auto-updates every message it was ever posted to |
| GET | `/admin/destinations` | list connected channels/groups |
| POST | `/admin/destinations` `{chatId, label, type}` | connect a channel/group (`type`: `channel` \| `group`) |
| DELETE | `/admin/destinations/:id` | disconnect a destination |
| GET | `/admin/access-requests` | list pending feature-access requests |
| POST | `/admin/access-requests/:userId/approve` | approve a user's request |
| POST | `/admin/access-requests/:userId/decline` | decline a user's request |

### Group @mention assistance
In a group where the bot is present, mentioning it (`@YourBotUsername price of Product A`)
looks up published content by keyword match on its title and replies with
the matching text + buttons — or a generic acknowledgement if nothing matches.
Requires `BOT_USERNAME` to be set (no `@`).

### Feature access requests
A user in a private chat can send `/requestaccess` to ask the owner for
approved access. The owner is notified (via `ADMIN_NOTIFY_CHAT_ID` if set)
and approves/declines through the admin API above — separate from Telegram's
own group-join-request flow, which is handled automatically if
`AUTO_APPROVE_JOIN_REQUESTS=true`.

Agents only ever see `ticket_id`. The mapping to `telegram_user_id` stays in
Postgres and is never exposed by these endpoints.

## 5. What changed vs. a traditional Node setup

- **No process to keep running.** `Deno.serve()` handles the webhook and
  admin routes per-request; there's no `pm2`/`systemd`/Docker to manage.
- **No node-cron, no jobs table.** `Deno.cron()` is built into the runtime —
  Deno Deploy schedules it for you.
- **postgres.js instead of Prisma** — plain TCP, no native engine, works
  as-is on Deno Deploy's runtime.

## 6. Left as extension points

- Rate limiting on `/telegram/webhook` and `/admin/*`
- `admins` table enforcement (currently a single shared `ADMIN_API_KEY`)
- Webhook update idempotency (Telegram retries on slow responses — add a
  dedupe check using `update_id` if that becomes an issue in practice)
