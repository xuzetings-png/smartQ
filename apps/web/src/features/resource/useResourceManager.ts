import { useCallback, useEffect, useRef, useState } from 'react';
import { resourceApi } from './resourceApi';
import type { ResourceDetail, ResourceSummary } from './resourceApi';
import type { ResourceConfigurationInput } from '@smartq/contracts';

export type ResourceOperation = 'load' | 'save' | 'publish' | 'refresh' | 'accept' | null;

export function useResourceManager(initialResourceId?: string) {
  const [items, setItems] = useState<ResourceSummary[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResourceDetail | null>(null);
  const [busyOperation, setBusyOperation] = useState<ResourceOperation>('load');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const detailVersion = useRef(0);

  const loadDetail = useCallback(async (id: string) => {
    const currentVersion = detailVersion.current + 1;
    detailVersion.current = currentVersion;
    const isCurrent = () => detailVersion.current === currentVersion;
    setBusyOperation('load');
    setErrorMessage(null);
    setDetail(null);
    try {
      const resource = await resourceApi.get(id);
      if (!isCurrent()) return;
      setDetail(resource);
      setSelectedResourceId(resource.id);
      setItems((current) =>
        current.map((item) => (item.id === resource.id ? toSummary(resource, item) : item)),
      );
    } catch (error) {
      if (isCurrent()) setErrorMessage(getErrorMessage(error, '读取资源详情失败'));
    } finally {
      if (isCurrent()) setBusyOperation(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    setBusyOperation('load');
    setErrorMessage(null);
    try {
      const result = await resourceApi.list();
      setItems(result.items);
      const preferredResource = initialResourceId
        ? result.items.find((item) => item.id === initialResourceId)
        : undefined;
      const nextId = preferredResource?.id ?? result.items.at(0)?.id ?? null;
      setSelectedResourceId(nextId);
      if (nextId) {
        const resource = await resourceApi.get(nextId);
        setDetail(resource);
        setItems((current) =>
          current.map((item) => (item.id === resource.id ? toSummary(resource, item) : item)),
        );
      } else {
        setDetail(null);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '读取问数资源失败'));
    } finally {
      setBusyOperation(null);
    }
  }, [initialResourceId]);

  useEffect(() => {
    const currentVersion = loadVersion.current + 1;
    loadVersion.current = currentVersion;
    const isCurrent = () => loadVersion.current === currentVersion;
    void resourceApi
      .list()
      .then(async (result) => {
        if (!isCurrent()) return;
        setItems(result.items);
        const preferredResource = initialResourceId
          ? result.items.find((item) => item.id === initialResourceId)
          : undefined;
        const nextId = preferredResource?.id ?? result.items.at(0)?.id ?? null;
        setSelectedResourceId(nextId);
        if (!nextId) {
          setDetail(null);
          return;
        }
        const resource = await resourceApi.get(nextId);
        if (!isCurrent()) return;
        setDetail(resource);
        setItems((current) =>
          current.map((item) => (item.id === resource.id ? toSummary(resource, item) : item)),
        );
      })
      .catch((error: unknown) => {
        if (isCurrent()) setErrorMessage(getErrorMessage(error, '读取问数资源失败'));
      })
      .finally(() => {
        if (isCurrent()) setBusyOperation(null);
      });

    return () => {
      if (isCurrent()) loadVersion.current += 1;
    };
  }, [initialResourceId]);

  const selectResource = useCallback(
    (id: string) => {
      setSelectedResourceId(id);
      void loadDetail(id);
    },
    [loadDetail],
  );

  const save = useCallback(
    async (configuration: ResourceConfigurationInput) => {
      if (!selectedResourceId) return null;
      return runOperation(
        'save',
        setBusyOperation,
        setErrorMessage,
        async () => {
          const resource = await resourceApi.save(selectedResourceId, configuration);
          setDetail(resource);
          setItems((current) =>
            current.map((item) => (item.id === resource.id ? toSummary(resource, item) : item)),
          );
          return resource;
        },
        '保存资源配置失败',
      );
    },
    [selectedResourceId],
  );

  const publish = useCallback(async () => {
    if (!selectedResourceId) return null;
    return runOperation(
      'publish',
      setBusyOperation,
      setErrorMessage,
      async () => {
        const resource = await resourceApi.publish(selectedResourceId);
        setDetail(resource);
        setItems((current) =>
          current.map((item) => (item.id === resource.id ? toSummary(resource, item) : item)),
        );
        return resource;
      },
      '发布问数资源失败',
    );
  }, [selectedResourceId]);

  const refreshSchema = useCallback(async () => {
    if (!selectedResourceId) return null;
    return runOperation(
      'refresh',
      setBusyOperation,
      setErrorMessage,
      async () => {
        const result = await resourceApi.refreshSchema(selectedResourceId);
        const resource = await resourceApi.get(selectedResourceId);
        setDetail(resource);
        setItems((current) =>
          current.map((item) => (item.id === resource.id ? toSummary(resource, item) : item)),
        );
        return result;
      },
      '刷新数据表结构失败',
    );
  }, [selectedResourceId]);

  const acceptSchema = useCallback(async () => {
    if (!selectedResourceId) return null;
    return runOperation(
      'accept',
      setBusyOperation,
      setErrorMessage,
      async () => {
        const resource = await resourceApi.acceptSchema(selectedResourceId);
        setDetail(resource);
        setItems((current) =>
          current.map((item) => (item.id === resource.id ? toSummary(resource, item) : item)),
        );
        return resource;
      },
      '接受数据表结构失败',
    );
  }, [selectedResourceId]);

  const dismissError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    items,
    selectedResourceId,
    detail,
    busyOperation,
    errorMessage,
    selectResource,
    reload: loadList,
    save,
    publish,
    refreshSchema,
    acceptSchema,
    dismissError,
  };
}

function toSummary(resource: ResourceDetail, previous: ResourceSummary): ResourceSummary {
  return {
    ...previous,
    displayName: resource.displayName,
    tableName: resource.tableName,
    status: resource.status,
    fieldCount: resource.fields.length,
  };
}

async function runOperation<TResult>(
  operationType: Exclude<ResourceOperation, null>,
  setBusyOperation: (operation: ResourceOperation) => void,
  setErrorMessage: (message: string | null) => void,
  operation: () => Promise<TResult>,
  fallbackMessage: string,
) {
  setBusyOperation(operationType);
  setErrorMessage(null);
  try {
    return await operation();
  } catch (error) {
    setErrorMessage(getErrorMessage(error, fallbackMessage));
    throw error;
  } finally {
    setBusyOperation(null);
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
