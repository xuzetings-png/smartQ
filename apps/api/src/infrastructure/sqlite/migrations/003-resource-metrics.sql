CREATE TABLE IF NOT EXISTS resource_metrics (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  field_id TEXT NOT NULL REFERENCES resource_fields(id) ON DELETE CASCADE,
  aggregation TEXT NOT NULL CHECK (aggregation IN ('sum', 'avg', 'min', 'max', 'count')),
  synonyms_json TEXT NOT NULL DEFAULT '[]',
  fixed_filters_json TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (resource_id, position)
);
