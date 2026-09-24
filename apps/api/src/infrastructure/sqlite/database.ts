import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const databasePath = process.env.SMARTQ_SQLITE_PATH
  ? resolve(process.env.SMARTQ_SQLITE_PATH)
  : resolve(process.cwd(), 'data/smartq.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`);

const migrationDirectory = new URL('./migrations/', import.meta.url);
const migrationPath = fileURLToPath(migrationDirectory);
const migrationFiles = readdirSync(migrationPath)
  .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
  .sort();
const hasMigration = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
const saveMigration = db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');

for (const migrationFile of migrationFiles) {
  if (hasMigration.get(migrationFile)) continue;

  const migrationSql = readFileSync(new URL(migrationFile, migrationDirectory), 'utf8');
  db.transaction(() => {
    db.exec(migrationSql);
    saveMigration.run(migrationFile, new Date().toISOString());
  })();
}
