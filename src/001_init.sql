-- Minimal persistent D1 schema. Intentionally small: no users, message
-- history, or analytics tables (spec sections 6, 8, 19).

-- Singleton row (id always 1) holding config that must survive deployments.
-- The bot token itself stays a Worker secret, never stored here.
CREATE TABLE IF NOT EXISTS bot_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner_id INTEGER NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Content the owner intentionally creates (announcements, posts, etc.)
CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Buttons belong to content. Editing a button's URL here, then re-applying
-- it to published_messages, updates every already-published post (section 15).
CREATE TABLE IF NOT EXISTS buttons (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buttons_content ON buttons(content_id);

-- Only identifiers needed to locate a previously published Telegram
-- message later (for edits/deletes) — not the message content itself.
CREATE TABLE IF NOT EXISTS published_messages (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_published_content ON published_messages(content_id);

-- Optional: scheduled publishing, checked by the Cron Trigger.
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  chat_ids TEXT NOT NULL,        -- JSON array of destination chat ids
  run_at INTEGER NOT NULL,       -- epoch ms
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_tasks(status, run_at);
