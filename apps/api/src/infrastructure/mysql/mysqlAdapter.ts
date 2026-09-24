import type { RowDataPacket } from 'mysql2';
import mysql, { type Connection, type ConnectionOptions } from 'mysql2/promise';
import type { DataSourceInput, TableDataPage } from '@smartq/contracts';

export type MysqlCredentials = Pick<
  DataSourceInput,
  'host' | 'port' | 'database' | 'username' | 'password'
>;

export type MysqlColumn = RowDataPacket & {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: 'YES' | 'NO';
  ORDINAL_POSITION: number;
  COLUMN_KEY: string;
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

export function readMysqlTablePage(
  credentials: MysqlCredentials,
  tableName: string,
  requestedPage: number,
  requestedPageSize: number,
): Promise<TableDataPage> {
  const pageSize = Math.max(1, Math.min(20, Math.trunc(requestedPageSize) || 20));
  const requestedPageNumber = Math.max(1, Math.trunc(requestedPage) || 1);

  return withConnection(credentials, async (connection) => {
    const columns = await getColumns(connection, credentials.database, tableName);
    if (columns.length === 0) throw new Error('找不到所选数据表');

    const quotedTable = quoteIdentifier(tableName);
    const quotedColumns = columns.map((column) => quoteIdentifier(column.COLUMN_NAME)).join(', ');
    const primaryKeyColumns = columns
      .filter((column) => column.COLUMN_KEY === 'PRI')
      .map((column) => quoteIdentifier(column.COLUMN_NAME));
    const orderBy = primaryKeyColumns.length ? ` ORDER BY ${primaryKeyColumns.join(', ')}` : '';

    await connection.query('START TRANSACTION READ ONLY');
    try {
      const [countRows] = await connection.execute<
        Array<RowDataPacket & { totalRows: number | string }>
      >(`SELECT /*+ MAX_EXECUTION_TIME(5000) */ COUNT(*) AS totalRows FROM ${quotedTable}`);
      const totalRows = Number(countRows[0]?.totalRows ?? 0);
      if (!Number.isSafeInteger(totalRows)) throw new Error('数据表记录数超出可显示范围');

      const totalPages = Math.ceil(totalRows / pageSize);
      const page = totalPages === 0 ? 1 : Math.min(requestedPageNumber, totalPages);
      const offset = (page - 1) * pageSize;
      const [rows] = await connection.execute(
        `SELECT /*+ MAX_EXECUTION_TIME(5000) */ ${quotedColumns} FROM ${quotedTable}${orderBy} LIMIT ? OFFSET ?`,
        [pageSize, offset],
      );
      await connection.commit();

      return {
        tableName,
        columns: columns.map((column) => ({
          name: column.COLUMN_NAME,
          mysqlType: column.COLUMN_TYPE,
          nullable: column.IS_NULLABLE === 'YES',
        })),
        rows: rows as Array<Record<string, unknown>>,
        page,
        pageSize,
        totalRows,
        totalPages,
      };
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    }
  });
}

export async function executeReadOnlyMysqlQuery(input: {
  credentials: MysqlCredentials;
  sql: string;
  parameters: Array<string | number | boolean>;
  signal: AbortSignal;
}) {
  const connection = await mysql.createConnection({
    ...toConnectionOptions(input.credentials),
    multipleStatements: false,
  });
  const abortConnection = () => {
    connection.destroy();
  };
  input.signal.addEventListener('abort', abortConnection, { once: true });

  try {
    assertSignalIsActive(input.signal);
    await connection.query('START TRANSACTION READ ONLY');
    const [rows] = await connection.execute<RowDataPacket[]>(input.sql, input.parameters);
    assertSignalIsActive(input.signal);
    await connection.commit();
    return rows.map((row) => ({ ...row })) as Array<Record<string, unknown>>;
  } finally {
    input.signal.removeEventListener('abort', abortConnection);
    if (!input.signal.aborted) await connection.end().catch(() => undefined);
  }
}

function assertSignalIsActive(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new Error('QUERY_ABORTED');
}

async function getColumns(connection: Connection, database: string, table: string) {
  const [rows] = await connection.execute<MysqlColumn[]>(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, ORDINAL_POSITION, COLUMN_KEY, COLUMN_COMMENT
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
