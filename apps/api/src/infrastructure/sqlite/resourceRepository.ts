import { createHash, randomUUID } from 'node:crypto';
import { db } from './database.js';
import type { MysqlColumn } from '../mysql/mysqlAdapter.js';

export function createDraftResource(
  dataSourceId: string,
  displayName: string,
  tableName: string,
  columns: MysqlColumn[],
) {
  if (columns.length === 0) {
    throw new Error('找不到所选数据表');
  }

  const schemaHash = createHash('sha256')
    .update(
      JSON.stringify(
        columns.map((column) => [
          column.COLUMN_NAME,
          column.COLUMN_TYPE,
          column.IS_NULLABLE,
          column.ORDINAL_POSITION,
        ]),
      ),
    )
    .digest('hex');
  const resourceId = randomUUID();
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO resources (
        id, data_source_id, display_name, table_name, status, schema_hash, schema_json, created_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
    ).run(
      resourceId,
      dataSourceId,
      displayName,
      tableName,
      schemaHash,
      JSON.stringify(columns),
      new Date().toISOString(),
    );

    const insertField = db.prepare(
      `INSERT INTO resource_fields (
        id, resource_id, column_name, mysql_type, nullable, ordinal_position,
        display_name, semantic_role, enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    for (const column of columns) {
      insertField.run(
        randomUUID(),
        resourceId,
        column.COLUMN_NAME,
        column.COLUMN_TYPE,
        column.IS_NULLABLE === 'YES' ? 1 : 0,
        column.ORDINAL_POSITION,
        column.COLUMN_COMMENT || column.COLUMN_NAME,
        /int|decimal|float|double/i.test(column.COLUMN_TYPE) ? 'metric' : 'dimension',
      );
    }
  });

  try {
    create();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw Object.assign(new Error('该数据表已经创建为问数资源'), {
        status: 409,
        code: 'RESOURCE_EXISTS',
      });
    }
    throw error;
  }

  return { id: resourceId, status: 'draft' as const, displayName, tableName, schemaHash };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
