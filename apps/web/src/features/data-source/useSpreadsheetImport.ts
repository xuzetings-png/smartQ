import { useCallback, useRef, useState } from 'react';
import { SPREADSHEET_IMPORT_MAX_BYTES, type SpreadsheetImportPreview } from '@smartq/contracts';
import { ApiError } from '../../shared/api/apiClient';
import type { CreatedResource } from './dataSourceApi';
import { spreadsheetImportApi } from './spreadsheetImportApi';

export function useSpreadsheetImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SpreadsheetImportPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestNumber = useRef(0);

  const loadPreview = useCallback(async (nextFile: File, sheetName?: string) => {
    const currentRequest = ++requestNumber.current;
    setIsPreviewing(true);
    setErrorMessage(null);
    try {
      const result = await spreadsheetImportApi.preview(nextFile, sheetName);
      if (requestNumber.current === currentRequest) setPreview(result);
    } catch (error) {
      if (requestNumber.current === currentRequest) {
        setPreview(null);
        setErrorMessage(toImportErrorMessage(error));
      }
    } finally {
      if (requestNumber.current === currentRequest) setIsPreviewing(false);
    }
  }, []);

  const selectFile = useCallback(
    async (nextFile: File) => {
      const extension = nextFile.name.toLowerCase().split('.').pop();
      if (!['xlsx', 'xls', 'csv', 'tsv'].includes(extension ?? '')) {
        requestNumber.current += 1;
        setFile(null);
        setPreview(null);
        setIsPreviewing(false);
        setErrorMessage('请选择 .xlsx、.xls、.csv 或 .tsv 文件。');
        return;
      }
      if (nextFile.size > SPREADSHEET_IMPORT_MAX_BYTES) {
        requestNumber.current += 1;
        setFile(null);
        setPreview(null);
        setIsPreviewing(false);
        setErrorMessage('文件超过 10 MiB，请压缩或拆分后重试。');
        return;
      }
      setFile(nextFile);
      setPreview(null);
      await loadPreview(nextFile);
    },
    [loadPreview],
  );

  const selectSheet = useCallback(
    async (sheetName: string) => {
      if (file) await loadPreview(file, sheetName);
    },
    [file, loadPreview],
  );

  const createResource = useCallback(
    async (displayName: string): Promise<CreatedResource | null> => {
      if (!file || !preview) return null;
      setIsCreating(true);
      setErrorMessage(null);
      try {
        return await spreadsheetImportApi.createResource(file, preview.selectedSheet, displayName);
      } catch (error) {
        setErrorMessage(toImportErrorMessage(error));
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [file, preview],
  );

  const reset = useCallback(() => {
    requestNumber.current += 1;
    setFile(null);
    setPreview(null);
    setIsPreviewing(false);
    setIsCreating(false);
    setErrorMessage(null);
  }, []);

  return {
    file,
    preview,
    isPreviewing,
    isCreating,
    errorMessage,
    selectFile,
    selectSheet,
    createResource,
    reset,
  };
}

function toImportErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : '表格处理失败，请检查文件后重试。';
}
