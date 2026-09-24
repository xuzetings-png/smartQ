CREATE TABLE IF NOT EXISTS resource_recommended_questions (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 4),
  question TEXT NOT NULL,
  UNIQUE (resource_id, position),
  UNIQUE (resource_id, question)
);

CREATE TABLE IF NOT EXISTS resource_schema_reviews (
  resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  observed_schema_hash TEXT NOT NULL,
  observed_schema_json TEXT NOT NULL,
  detected_at TEXT NOT NULL
);
