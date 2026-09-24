CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  password_ciphertext TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  password_tag TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready')),
  last_tested_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  data_source_id TEXT NOT NULL REFERENCES data_sources(id),
  display_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  schema_hash TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (data_source_id, table_name)
);

CREATE TABLE IF NOT EXISTS resource_fields (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  column_name TEXT NOT NULL,
  mysql_type TEXT NOT NULL,
  nullable INTEGER NOT NULL,
  ordinal_position INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  semantic_role TEXT NOT NULL DEFAULT 'hidden',
  enabled INTEGER NOT NULL DEFAULT 0,
  unit TEXT,
  default_aggregation TEXT,
  synonyms_json TEXT NOT NULL DEFAULT '[]'
);
