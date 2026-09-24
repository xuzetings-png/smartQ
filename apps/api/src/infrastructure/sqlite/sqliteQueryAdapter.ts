import Database from 'better-sqlite3';
import { databasePath } from './database.js';

export function executeReadOnlySqliteQuery(input: {
  sql: string;
  parameters: Array<string | number | boolean>;
  signal: AbortSignal;
}) {
  assertSignalIsActive(input.signal);
  const connection = new Database(databasePath, { readonly: true, fileMustExist: true });
  connection.pragma('query_only = ON');
  try {
    assertSignalIsActive(input.signal);
    const rows = connection
      .prepare(input.sql)
      .all(
        ...input.parameters.map((value) => (typeof value === 'boolean' ? Number(value) : value)),
      );
    assertSignalIsActive(input.signal);
    return rows.map((row: unknown) => row as Record<string, unknown>);
  } finally {
    connection.close();
  }
}

function assertSignalIsActive(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new Error('QUERY_ABORTED');
}
