import {
  SPREADSHEET_IMPORT_MAX_BYTES,
  SPREADSHEET_IMPORT_PREVIEW_ROWS,
  type SpreadsheetImportCreateInput,
  type SpreadsheetImportPreviewInput,
} from '@smartq/contracts';
import { AppError } from '../AppError.js';
import { createImportedSpreadsheetResource } from '../../infrastructure/sqlite/importedDataRepository.js';
import {
  parseSpreadsheet,
  SpreadsheetParseError,
} from '../../infrastructure/spreadsheets/spreadsheetParser.js';

export async function previewSpreadsheetImport(
  input: SpreadsheetImportPreviewInput,
  content: Buffer,
) {
  const fileName = normalizeFileName(input.fileName);
  const parsed = await parseUploadedFile(fileName, content, input.sheetName);
  return {
    fileName,
    sheets: parsed.sheets,
    selectedSheet: parsed.selectedSheet,
    rowCount: parsed.rowCount,
    columnCount: parsed.columnCount,
    columns: parsed.columns.map(({ name, dataType, nullable }) => ({
      name,
      dataType,
      nullable,
    })),
    rows: parsed.rows.slice(0, SPREADSHEET_IMPORT_PREVIEW_ROWS),
  };
}

export async function createSpreadsheetImportResource(
  input: SpreadsheetImportCreateInput,
  content: Buffer,
) {
  const fileName = normalizeFileName(input.fileName);
  const sheet = await parseUploadedFile(fileName, content, input.sheetName);
  try {
    return createImportedSpreadsheetResource({
      fileName,
      displayName: input.displayName,
      sheet,
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'RESOURCE_EXISTS') {
      throw new AppError('该工作表已创建为问数资源', 409, 'RESOURCE_EXISTS');
    }
    throw error;
  }
}

async function parseUploadedFile(fileName: string, content: Buffer, sheetName?: string) {
  if (content.length > SPREADSHEET_IMPORT_MAX_BYTES) {
    throw fileTooLarge();
  }
  try {
    return await parseSpreadsheet(fileName, content, sheetName);
  } catch (error) {
    if (error instanceof SpreadsheetParseError) {
      const status = error.code === 'IMPORT_FILE_TYPE_UNSUPPORTED' ? 415 : 422;
      throw new AppError(error.message, status, error.code);
    }
    throw new AppError('文件解析失败，请检查文件后重试。', 422, 'IMPORT_FILE_INVALID');
  }
}

function normalizeFileName(fileName: string) {
  const baseName = fileName.replaceAll('\\', '/').split('/').pop() ?? '';
  const safeName = Array.from(baseName)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && (code < 127 || code > 159);
    })
    .join('')
    .trim();
  if (!safeName || safeName.length > 255) {
    throw new AppError('文件名无效，请重新选择文件。', 400, 'IMPORT_FILE_NAME_INVALID');
  }
  return safeName;
}

function fileTooLarge() {
  return new AppError('文件超过 10 MiB，请压缩或拆分后重试。', 413, 'IMPORT_FILE_TOO_LARGE');
}
