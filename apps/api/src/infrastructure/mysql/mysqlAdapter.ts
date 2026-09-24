import type { RowDataPacket } from 'mysql2';
import mysql, { type Connection, type ConnectionOptions } from 'mysql2/promise';
import type { DataSourceInput } from '@smartq/contracts';

export type MysqlCredentials = Pick<
  DataSourceInput,
  'host' | 'port' | 'database' | 'username' | 'password'
>;

export type MysqlColumn = RowDataPacket & {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: 'YES' | 'NO';
  ORDINAL_POSITION: number;
  COLUMN_COMMENT: string;
};

function toConnectionOptions(credentials: MysqlCredentials): ConnectionOptions {
  return {
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    user: credentials.username,
    password: credentials.password,
    connectTimeout: 5_000,
    multipleStatements: false,
    charset: 'utf8mb4',
  };
}

async function withConnection<T>(
  credentials: MysqlCredentials,
  callback: (connection: Connection) => Promise<T>,
): Promise<T> {
  const connection = await mysql.createConnection(toConnectionOptions(credentials));
  try {
    return await callback(connection);
  } finally {
    await connection.end();
  }
}

export function testMysqlConnection(credentials: MysqlCredentials) {
  return withConnection(credentials, async (connection) => {
    const [rows] = await connection.query<Array<RowDataPacket & { version: string }>>(
      'SELECT VERSION() AS version',
    );
    return {
      ok: true as const,
      serverVersion: rows[0]?.version ?? 'unknown',
      database: credentials.database,
    };
  });
}

export function listMysqlTables(credentials: MysqlCredentials) {
  return withConnection(credentials, async (connection) => {
    const [rows] = await connection.execute<
      Array<
        RowDataPacket & {
          TABLE_NAME: string;
          TABLE_COMMENT: string;
          COLUMN_COUNT: number;
        }
      >
    >(
      `SELECT t.TABLE_NAME, t.TABLE_COMMENT, COUNT(c.COLUMN_NAME) AS COLUMN_COUNT
       FROM information_schema.TABLES AS t
       LEFT JOIN information_schema.COLUMNS AS c
         ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
       WHERE t.TABLE_SCHEMA = ? AND t.TABLE_TYPE = 'BASE TABLE'
       GROUP BY t.TABLE_NAME, t.TABLE_COMMENT
       ORDER BY t.TABLE_NAME`,
      [credentials.database],
    );

    return {
      database: credentials.database,
      fetchedAt: new Date().toISOString(),
      tables: rows.map((row) => ({
        name: row.TABLE_NAME,
        comment: row.TABLE_COMMENT,
        columnCount: row.COLUMN_COUNT,
      })),
    };
  });
}

export function getMysqlTableColumns(credentials: MysqlCredentials, tableName: string) {
  return withConnection(credentials, async (connection) =>
    getColumns(connection, credentials.database, tableName),
  );
}

export function previewMysqlTable(
  credentials: MysqlCredentials,
  tableName: string,
  requestedLimit: number,
) {
  const limit = Math.max(1, Math.min(20, Math.trunc(requestedLimit) || 20));
  return withConnection(credentials, async (connection) => {
    const columns = await getColumns(connection, credentials.database, tableName);
    if (columns.length === 0) {
      throw new Error('找不到所选数据表');
    }

    const quotedTable = quoteIdentifier(tableName);
    const quotedColumns = columns.map((column) => quoteIdentifier(column.COLUMN_NAME)).join(', ');
    const [rows] = await connection.execute(`SELECT ${quotedColumns} FROM ${quotedTable} LIMIT ?`, [
      limit,
    ]);

    return {
      tableName,
      columns: columns.map((column) => ({
        name: column.COLUMN_NAME,
        mysqlType: column.COLUMN_TYPE,
        nullable: column.IS_NULLABLE === 'YES',
      })),
      rows,
      limit,
    };
  });
}

async function getColumns(connection: Connection, database: string, table: string) {
  const [rows] = await connection.execute<MysqlColumn[]>(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, ORDINAL_POSITION, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [database, table],
  );
  return rows;
}

function quoteIdentifier(identifier: string) {
  return '`' + identifier.replaceAll('`', '``') + '`';
}
