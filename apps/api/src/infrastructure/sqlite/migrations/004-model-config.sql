CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  provider TEXT NOT NULL CHECK (provider = 'bailian-openai-compatible'),
  base_url TEXT NOT NULL,
  model_id TEXT NOT NULL,
  api_key_ciphertext TEXT,
  api_key_iv TEXT,
  api_key_tag TEXT,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  last_test_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (api_key_ciphertext IS NULL AND api_key_iv IS NULL AND api_key_tag IS NULL)
    OR
    (api_key_ciphertext IS NOT NULL AND api_key_iv IS NOT NULL AND api_key_tag IS NOT NULL)
  )
);
