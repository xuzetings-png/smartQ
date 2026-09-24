import type { TableDataPage as SharedTableDataPage } from '@smartq/contracts';
import { requestJson } from '../../shared/api/apiClient';

export type DataSource = {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  passwordConfigured: boolean;
  passwordMasked: string;
  status: 'ready';
  lastTestedAt: string;
};

export type DataSourceConnection = {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
};

export type DataTable = {
  name: string;
  comment: string;
  columnCount: number;
};

export type TablePreview = {
  tableName: string;
  columns: Array<{ name: string; mysqlType: string; nullable: boolean }>;
  rows: Array<Record<string, unknown>>;
  limit: number;
};

export type TableDataPage = SharedTableDataPage;

export type CreatedResource = {
  id: string;
  displayName: string;
  tableName: string;
  status: 'draft';
};

export const dataSourceApi = {
  async getSaved(): Promise<DataSource | null> {
    const response = await requestJson<{ items: DataSource[] }>('/api/data-sources');
    return response.items[0] ?? null;
  },

  testNew(connection: DataSourceConnection) {
    return requestJson<{ serverVersion: string }>('/api/data-sources/test', {
      method: 'POST',
      body: JSON.stringify(connection),
    });
  },

  testSaved(id: string, connection: DataSourceConnection) {
    return requestJson<{ serverVersion: string }>(`/api/data-sources/${id}/test`, {
      method: 'POST',
      body: JSON.stringify(connection),
    });
  },

  save(connection: DataSourceConnection, existingId?: string) {
    return requestJson<DataSource>(
      existingId ? `/api/data-sources/${existingId}` : '/api/data-sources',
      {
        method: existingId ? 'PUT' : 'POST',
        body: JSON.stringify(connection),
      },
    );
  },

  getSchema(id: string) {
    return requestJson<{ database: string; fetchedAt: string; tables: DataTable[] }>(
      `/api/data-sources/${id}/schema`,
    );
  },

  previewTable(id: string, tableName: string) {
    return requestJson<TablePreview>(
      `/api/data-sources/${id}/tables/${encodeURIComponent(tableName)}/preview?limit=20`,
    );
  },

  getTableDataPage(id: string, tableName: string, page: number, pageSize = 20) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return requestJson<TableDataPage>(
      `/api/data-sources/${id}/tables/${encodeURIComponent(tableName)}/rows?${query.toString()}`,
    );
  },

  createResource(id: string, tableName: string, displayName: string) {
    return requestJson<CreatedResource>('/api/resources', {
      method: 'POST',
      body: JSON.stringify({ dataSourceId: id, tableName, displayName }),
    });
  },
};
