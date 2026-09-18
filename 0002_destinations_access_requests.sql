-- Connected channels/groups the owner can publish to, referenced by label
-- instead of raw chat IDs in the admin API.
CREATE TABLE IF NOT EXISTS destinations (
  id BIGSERIAL PRIMARY KEY,
  telegram_chat_id BIGINT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL, -- channel | group
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Approval-based access to restricted bot features (separate from Telegram's
-- native chat_join_request, which is about joining a group/channel — this is
-- about a user being allowed to use the bot's business features at all).
CREATE TABLE IF NOT EXISTS access_requests (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
