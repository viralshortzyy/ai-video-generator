-- ── FrameForge schema (SQLite) ──────────────────────────────────────────
-- Executed idempotently on boot (CREATE TABLE IF NOT EXISTS).
-- For production Postgres, translate types 1:1; the repository layer
-- isolates all SQL so the migration is mechanical.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS generations (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id          TEXT REFERENCES projects(id) ON DELETE SET NULL,
  original_prompt     TEXT NOT NULL,
  structured_prompt   TEXT NOT NULL,          -- JSON: StructuredPrompt
  provider_id         TEXT NOT NULL,
  model_id            TEXT NOT NULL,
  duration_sec        INTEGER NOT NULL,
  aspect_ratio        TEXT NOT NULL,
  quality             TEXT NOT NULL,
  negative_prompt     TEXT,
  reference_image_url TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',
  stage               TEXT,
  progress_percent    INTEGER NOT NULL DEFAULT 0,
  provider_job_id     TEXT,
  video_url           TEXT,
  thumbnail_url       TEXT,
  error               TEXT,
  credits_used        INTEGER NOT NULL DEFAULT 0,
  saved               INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  completed_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_project ON generations(project_id);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);

-- Future multi-scene support: scenes belong to a generation.
CREATE TABLE IF NOT EXISTS scenes (
  id            TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  prompt        TEXT NOT NULL,
  duration_sec  INTEGER NOT NULL,
  camera        TEXT,
  style         TEXT,
  transition    TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  video_url     TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenes_generation ON scenes(generation_id, position);

CREATE TABLE IF NOT EXISTS video_models (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  description     TEXT,
  capabilities    TEXT NOT NULL,              -- JSON
  enabled         INTEGER NOT NULL DEFAULT 1,
  is_mock         INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                  -- 'reference-image' | 'video' | 'thumbnail' | ...
  url         TEXT NOT NULL,
  mime        TEXT,
  size_bytes  INTEGER,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id);

CREATE TABLE IF NOT EXISTS credits_ledger (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta         INTEGER NOT NULL,             -- positive = grant, negative = spend
  reason        TEXT NOT NULL,
  generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON credits_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan                TEXT NOT NULL DEFAULT 'free',
  status              TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id  TEXT,
  current_period_end  TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_events (
  id            TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,                -- 'created' | 'stage' | 'completed' | 'failed' | ...
  detail        TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_generation ON generation_events(generation_id, created_at);
