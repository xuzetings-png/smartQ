import type { SpreadsheetImportPreview } from '@smartq/contracts';
import { requestJson } from '../../shared/api/apiClient';
import type { CreatedResource } from './dataSourceApi';

export const spreadsheetImportApi = {
  preview(file: File, sheetName?: string) {
    const query = new URLSearchParams({ fileName: file.name });
    if (sheetName) query.set('sheetName', sheetName);
    return requestJson<SpreadsheetImportPreview>(`/api/imports/preview?${query.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
  },

  createResource(file: File, sheetName: string, displayName: string) {
    const query = new URLSearchParams({
      fileName: file.name,
      sheetName,
      displayName,
    });
    return requestJson<CreatedResource>(`/api/imports/resources?${query.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
  },
};
