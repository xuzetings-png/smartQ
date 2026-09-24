import { randomUUID } from 'node:crypto';
import type { DataSourceInput, DataSourceSummary } from '@smartq/contracts';
import { decryptSecret, encryptSecret } from './credentialCipher.js';
import { db } from './database.js';
import type { MysqlCredentials } from '../mysql/mysqlAdapter.js';

type StoredDataSource = {
  id: string;
  name: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password_ciphertext: string;
  password_iv: string;
  password_tag: string;
  status: 'ready';
  last_tested_at: string;
};

export function listDataSources(): DataSourceSummary[] {
  const sources = db.prepare('SELECT * FROM data_sources').all() as StoredDataSource[];
  return sources.map(toPublicDataSource);
}

export function findDataSourceById(
  id: string,
): (MysqlCredentials & { id: string; name: string }) | null {
  const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(id) as
    StoredDataSource | undefined;
  if (!source) return null;

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

export function saveDataSource(input: DataSourceInput): DataSourceSummary {
  const checkedAt = new Date().toISOString();
  const secret = encryptSecret(input.password);
  const current = db.prepare('SELECT id FROM data_sources LIMIT 1').get() as
    { id: string } | undefined;
  const id = current?.id ?? randomUUID();

  db.prepare(
    `INSERT INTO data_sources (
      id, name, host, port, database_name, username, password_ciphertext,
      password_iv, password_tag, status, last_tested_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)
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
