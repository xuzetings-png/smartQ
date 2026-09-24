-- requires_foreign_keys_off

CREATE TABLE data_sources_next (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'mysql' CHECK (source_type IN ('mysql', 'file')),
  host TEXT,
  port INTEGER,
  database_name TEXT,
  username TEXT,
  password_ciphertext TEXT,
  password_iv TEXT,
  password_tag TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready')),
  last_tested_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    source_type = 'file'
    OR (
      host IS NOT NULL AND port IS NOT NULL AND database_name IS NOT NULL
      AND username IS NOT NULL AND password_ciphertext IS NOT NULL
      AND password_iv IS NOT NULL AND password_tag IS NOT NULL
      AND last_tested_at IS NOT NULL
    )
  )
);

INSERT INTO data_sources_next (
  id, name, source_type, host, port, database_name, username,
  password_ciphertext, password_iv, password_tag, status,
  last_tested_at, created_at, updated_at
)
SELECT id, name, 'mysql', host, port, database_name, username,
       password_ciphertext, password_iv, password_tag, status,
       last_tested_at, created_at, updated_at
FROM data_sources;

DROP TABLE data_sources;
ALTER TABLE data_sources_next RENAME TO data_sources;

CREATE TABLE imported_datasets (
  data_source_id TEXT PRIMARY KEY REFERENCES data_sources(id) ON DELETE CASCADE,
  worksheet_name TEXT NOT NULL,
  storage_table_name TEXT NOT NULL UNIQUE,
  source_file_name TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  column_count INTEGER NOT NULL CHECK (column_count > 0),
  created_at TEXT NOT NULL
);
