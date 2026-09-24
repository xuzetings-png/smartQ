import { randomUUID } from 'node:crypto';
import type { DataSourceInput, DataSourceSummary } from '@smartq/contracts';
import { decryptSecret, encryptSecret } from './credentialCipher.js';
import { db } from './database.js';
import type { MysqlCredentials } from '../mysql/mysqlAdapter.js';

type StoredDataSource = {
  id: string;
  name: string;
  source_type: 'mysql' | 'file';
  host: string | null;
  port: number | null;
  database_name: string | null;
  username: string | null;
  password_ciphertext: string | null;
  password_iv: string | null;
  password_tag: string | null;
  status: 'ready';
  last_tested_at: string | null;
};

export type ResourceDataSource =
  | (MysqlCredentials & { kind: 'mysql'; id: string; name: string })
  | {
      kind: 'file';
      id: string;
      name: string;
      worksheetName: string;
      storageTableName: string;
    };

export function listDataSources(): DataSourceSummary[] {
  const sources = db
    .prepare("SELECT * FROM data_sources WHERE source_type = 'mysql'")
    .all() as StoredDataSource[];
  return sources.map(toPublicDataSource);
}

export function findDataSourceById(
  id: string,
): (MysqlCredentials & { id: string; name: string }) | null {
  const source = db
    .prepare("SELECT * FROM data_sources WHERE id = ? AND source_type = 'mysql'")
    .get(id) as StoredDataSource | undefined;
  if (!source || !hasMysqlCredentials(source)) return null;

  return {
    id: source.id,
    name: source.name,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: decryptSecret(source.password_ciphertext, source.password_iv, source.password_tag),
  };
}

export function findResourceDataSourceById(id: string): ResourceDataSource | null {
  const source = db
    .prepare(
      `SELECT ds.*, dataset.worksheet_name AS worksheetName,
              dataset.storage_table_name AS storageTableName
       FROM data_sources AS ds
       LEFT JOIN imported_datasets AS dataset ON dataset.data_source_id = ds.id
       WHERE ds.id = ?`,
    )
    .get(id) as
    | (StoredDataSource & { worksheetName: string | null; storageTableName: string | null })
    | undefined;
  if (!source) return null;
  if (source.source_type === 'file') {
    if (!source.worksheetName || !source.storageTableName) return null;
    return {
      kind: 'file',
      id: source.id,
      name: source.name,
      worksheetName: source.worksheetName,
      storageTableName: source.storageTableName,
    };
  }

  const credentials = findDataSourceById(id);
  return credentials ? { kind: 'mysql', ...credentials } : null;
}

export function saveDataSource(input: DataSourceInput): DataSourceSummary {
  const checkedAt = new Date().toISOString();
  const secret = encryptSecret(input.password);
  const current = db
    .prepare("SELECT id FROM data_sources WHERE source_type = 'mysql' LIMIT 1")
    .get() as { id: string } | undefined;
  const id = current?.id ?? randomUUID();

  db.prepare(
    `INSERT INTO data_sources (
      id, name, source_type, host, port, database_name, username, password_ciphertext,
      password_iv, password_tag, status, last_tested_at, created_at, updated_at
    ) VALUES (?, ?, 'mysql', ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      host = excluded.host,
      port = excluded.port,
      database_name = excluded.database_name,
      username = excluded.username,
      password_ciphertext = excluded.password_ciphertext,
      password_iv = excluded.password_iv,
      password_tag = excluded.password_tag,
      status = excluded.status,
      last_tested_at = excluded.last_tested_at,
      updated_at = excluded.updated_at`,
  ).run(
    id,
    input.name,
    input.host,
    input.port,
    input.database,
    input.username,
    secret.ciphertext,
    secret.iv,
    secret.tag,
    checkedAt,
    checkedAt,
    checkedAt,
  );

  return {
    id,
    name: input.name,
    host: input.host,
    port: input.port,
    database: input.database,
    username: input.username,
    passwordConfigured: true,
    passwordMasked: '••••••••',
    status: 'ready',
    lastTestedAt: checkedAt,
  };
}

function toPublicDataSource(source: StoredDataSource): DataSourceSummary {
  if (!hasMysqlCredentials(source) || !source.last_tested_at) {
    throw new Error('MySQL 数据源缺少连接信息');
  }
  return {
    id: source.id,
    name: source.name,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    passwordConfigured: true,
    passwordMasked: '••••••••',
    status: source.status,
    lastTestedAt: source.last_tested_at,
  };
}

function hasMysqlCredentials(source: StoredDataSource): source is StoredDataSource & {
  host: string;
  port: number;
  database_name: string;
  username: string;
  password_ciphertext: string;
  password_iv: string;
  password_tag: string;
} {
  return Boolean(
    source.host &&
    source.port !== null &&
    source.database_name &&
    source.username &&
    source.password_ciphertext &&
    source.password_iv &&
    source.password_tag,
  );
}
