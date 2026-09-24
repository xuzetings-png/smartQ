import { randomUUID } from 'node:crypto';
import type { MysqlColumn } from '../mysql/mysqlAdapter.js';
import { createDraftResource } from './resourceRepository.js';
import { db } from './database.js';
import type { ParsedSpreadsheet } from '../spreadsheets/spreadsheetParser.js';

export function createImportedSpreadsheetResource(input: {
  fileName: string;
  displayName: string;
  sheet: ParsedSpreadsheet;
}) {
  const sourceId = randomUUID();
  const storageTableName = `imported_${randomUUID().replaceAll('-', '')}`;
  const now = new Date().toISOString();
  const schema = toMysqlColumns(input.sheet);
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO data_sources (
        id, name, source_type, status, created_at, updated_at
      ) VALUES (?, ?, 'file', 'ready', ?, ?)`,
    ).run(sourceId, input.fileName, now, now);

    const definitions = input.sheet.columns.map((column) => {
      const nullable = column.nullable ? '' : ' NOT NULL';
      return `${quoteIdentifier(column.name)} ${column.mysqlType.toUpperCase()}${nullable}`;
    });
    db.exec(`CREATE TABLE ${quoteIdentifier(storageTableName)} (${definitions.join(', ')})`);

    const columnNames = input.sheet.columns.map((column) => quoteIdentifier(column.name));
    const placeholders = input.sheet.columns.map(() => '?').join(', ');
    const insertRow = db.prepare(
      `INSERT INTO ${quoteIdentifier(storageTableName)} (${columnNames.join(', ')})
       VALUES (${placeholders})`,
    );
    for (const row of input.sheet.rows) insertRow.run(...row.map(toSqliteValue));

    db.prepare(
      `INSERT INTO imported_datasets (
        data_source_id, worksheet_name, storage_table_name, source_file_name,
        row_count, column_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sourceId,
      input.sheet.selectedSheet,
      storageTableName,
      input.fileName,
      input.sheet.rowCount,
      input.sheet.columnCount,
      now,
    );

    return createDraftResource(sourceId, input.displayName, input.sheet.selectedSheet, schema);
  });

  return create();
}

export function getImportedTableColumns(
  dataSourceId: string,
  worksheetName: string,
): MysqlColumn[] {
  const dataset = db
    .prepare(
      `SELECT storage_table_name AS storageTableName
       FROM imported_datasets WHERE data_source_id = ? AND worksheet_name = ?`,
    )
    .get(dataSourceId, worksheetName) as { storageTableName: string } | undefined;
  if (!dataset || !/^imported_[a-f0-9]{32}$/.test(dataset.storageTableName)) return [];

  const columns = db
    .prepare(`PRAGMA table_info(${quoteIdentifier(dataset.storageTableName)})`)
    .all() as Array<{ cid: number; name: string; type: string; notnull: number }>;
  return columns.map((column) => ({
    COLUMN_NAME: column.name,
    COLUMN_TYPE: normalizeMysqlType(column.type),
    IS_NULLABLE: column.notnull === 1 ? 'NO' : 'YES',
    ORDINAL_POSITION: column.cid + 1,
    COLUMN_KEY: '',
    COLUMN_COMMENT: column.name,
  })) as MysqlColumn[];
}

export function importedTableNameIsValid(storageTableName: string) {
  return /^imported_[a-f0-9]{32}$/.test(storageTableName);
}

function toMysqlColumns(sheet: ParsedSpreadsheet): MysqlColumn[] {
  return sheet.columns.map((column, index) => ({
    COLUMN_NAME: column.name,
    COLUMN_TYPE: column.mysqlType,
    IS_NULLABLE: column.nullable ? 'YES' : 'NO',
    ORDINAL_POSITION: index + 1,
    COLUMN_KEY: '',
    COLUMN_COMMENT: column.name,
  })) as MysqlColumn[];
}

function normalizeMysqlType(type: string) {
  return type.trim().toLowerCase() || 'text';
}

function toSqliteValue(value: string | number | boolean | null) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
