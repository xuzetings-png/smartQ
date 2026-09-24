import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const databasePath = process.env.SMARTQ_SQLITE_PATH
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
  const requiresForeignKeysOff = migrationSql.startsWith('-- requires_foreign_keys_off');
  if (requiresForeignKeysOff) db.pragma('foreign_keys = OFF');

  try {
    db.transaction(() => {
      db.exec(migrationSql);
      if (requiresForeignKeysOff) {
        const violations = db.pragma('foreign_key_check') as Array<{
          table: string;
          parent: string;
        }>;
        if (violations.length > 0) {
          const affectedTables = [...new Set(violations.map(({ table }) => table))].join(', ');
          throw new Error(
            `数据库迁移 ${migrationFile} 产生了 ${violations.length.toString()} 条外键异常，涉及：${affectedTables}`,
          );
        }
      }
      saveMigration.run(migrationFile, new Date().toISOString());
    })();
  } finally {
    if (requiresForeignKeysOff) db.pragma('foreign_keys = ON');
  }
}

const staleRuns = db
  .prepare(
    `SELECT id, conversation_id AS conversationId, turn_id AS turnId
     FROM query_runs WHERE status = 'executing'`,
  )
  .all() as Array<{ id: string; conversationId: string; turnId: string }>;
if (staleRuns.length > 0) {
  const recoveredAt = new Date().toISOString();
  db.transaction(() => {
    const updateRun = db.prepare(
      `UPDATE query_runs SET status = 'interrupted', finished_at = ?
       WHERE id = ? AND status = 'executing'`,
    );
    const insertMessage = db.prepare(
      `INSERT INTO messages (id, conversation_id, turn_id, role, content_json, created_at)
       VALUES (?, ?, ?, 'assistant', ?, ?)`,
    );
    const updateConversation = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');
    for (const run of staleRuns) {
      const result = updateRun.run(recoveredAt, run.id);
      if (result.changes === 0) continue;
      insertMessage.run(
        randomUUID(),
        run.conversationId,
        run.turnId,
        JSON.stringify({
          kind: 'error',
          code: 'TURN_INTERRUPTED',
          message: '服务重启导致本轮中断，请重新提问。',
        }),
        recoveredAt,
      );
      updateConversation.run(recoveredAt, run.conversationId);
    }
  })();
}
