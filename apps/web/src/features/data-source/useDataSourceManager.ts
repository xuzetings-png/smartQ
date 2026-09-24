import { useCallback, useEffect, useState } from 'react';
import { dataSourceApi } from './dataSourceApi';
import type { DataSource, DataSourceConnection, DataTable, TablePreview } from './dataSourceApi';

export type DataSourceOperation = 'test' | 'save' | 'schema' | 'preview' | null;

type DataSourceManagerState = {
  dataSource: DataSource | null;
  tables: DataTable[];
  preview: TablePreview | null;
  selectedTable: string | null;
  busyOperation: DataSourceOperation;
  tested: boolean;
  errorMessage: string | null;
};

const initialState: DataSourceManagerState = {
  dataSource: null,
  tables: [],
  preview: null,
  selectedTable: null,
  busyOperation: null,
  tested: false,
  errorMessage: null,
};

export function useDataSourceManager() {
  const [state, setState] = useState(initialState);

  const loadTables = useCallback(async (source: DataSource) => {
    setState((current) => ({ ...current, busyOperation: 'schema', errorMessage: null }));
    try {
      const schema = await dataSourceApi.getSchema(source.id);
      setState((current) => ({
        ...current,
        tables: schema.tables,
        preview: null,
        selectedTable: null,
        busyOperation: null,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        busyOperation: null,
        errorMessage: getErrorMessage(error, '读取数据表失败'),
      }));
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    void dataSourceApi
      .getSaved()
      .then(async (source) => {
        if (!isCurrent || !source) return;
        setState((current) => ({ ...current, dataSource: source }));
        await loadTables(source);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState((current) => ({
            ...current,
            errorMessage: getErrorMessage(error, '读取数据源失败'),
          }));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [loadTables]);

  const testConnection = useCallback(
    async (connection: DataSourceConnection) => {
      setState((current) => ({
        ...current,
        busyOperation: 'test',
        tested: false,
        errorMessage: null,
      }));
      try {
        const result = state.dataSource
          ? await dataSourceApi.testSaved(state.dataSource.id, connection)
          : await dataSourceApi.testNew(connection);
        setState((current) => ({ ...current, busyOperation: null, tested: true }));
        return `连接成功 · MySQL ${result.serverVersion}`;
      } catch (error) {
        setState((current) => ({ ...current, busyOperation: null, tested: false }));
        throw error;
      }
    },
    [state.dataSource],
  );

  const saveConnection = useCallback(
    async (connection: DataSourceConnection) => {
      setState((current) => ({ ...current, busyOperation: 'save', errorMessage: null }));
      try {
        const source = await dataSourceApi.save(connection, state.dataSource?.id);
        setState((current) => ({
          ...current,
          dataSource: source,
          busyOperation: null,
          tested: false,
        }));
        await loadTables(source);
        return source;
      } catch (error) {
        setState((current) => ({ ...current, busyOperation: null }));
        throw error;
      }
    },
    [loadTables, state.dataSource],
  );

  const selectTable = useCallback(
    async (tableName: string) => {
      if (!state.dataSource) return;
      setState((current) => ({
        ...current,
        selectedTable: tableName,
        busyOperation: 'preview',
        errorMessage: null,
      }));
      try {
        const preview = await dataSourceApi.previewTable(state.dataSource.id, tableName);
        setState((current) => ({ ...current, preview, busyOperation: null }));
      } catch (error) {
        setState((current) => ({ ...current, busyOperation: null }));
        throw error;
      }
    },
    [state.dataSource],
  );

  const createResource = useCallback(
    async (displayName: string) => {
      if (!state.dataSource || !state.selectedTable) return null;
      return dataSourceApi.createResource(state.dataSource.id, state.selectedTable, displayName);
    },
    [state.dataSource, state.selectedTable],
  );

  const refreshTables = useCallback(() => {
    if (state.dataSource) void loadTables(state.dataSource);
  }, [loadTables, state.dataSource]);

  const dismissError = useCallback(() => {
    setState((current) => ({ ...current, errorMessage: null }));
  }, []);

  return {
    ...state,
    testConnection,
    saveConnection,
    selectTable,
    createResource,
    refreshTables,
    dismissError,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
