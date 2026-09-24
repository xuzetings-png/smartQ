CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id),
  resource_config_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS query_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL,
  parent_run_id TEXT REFERENCES query_runs(id),
  request_id TEXT NOT NULL,
  request_json TEXT NOT NULL,
  question TEXT NOT NULL,
  clarification_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN (
    'awaiting_clarification', 'executing', 'succeeded', 'empty', 'rejected',
    'failed', 'cancelled', 'interrupted', 'continued'
  )),
  plan_json TEXT,
  clarification_json TEXT,
  sql_text TEXT,
  result_json TEXT,
  row_count INTEGER,
  truncated INTEGER CHECK (truncated IS NULL OR truncated IN (0, 1)),
  duration_ms INTEGER,
  error_code TEXT,
  error_stage TEXT CHECK (error_stage IS NULL OR error_stage IN ('understanding', 'executing')),
  created_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE (conversation_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_resource_updated_at
  ON conversations(resource_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_query_runs_conversation_created
  ON query_runs(conversation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_query_runs_one_active_per_conversation
  ON query_runs(conversation_id)
  WHERE status IN ('executing', 'awaiting_clarification');
