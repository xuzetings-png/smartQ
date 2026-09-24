import express, { Router, type RequestHandler } from 'express';
import {
  SPREADSHEET_IMPORT_MAX_BYTES,
  spreadsheetImportCreateInputSchema,
  spreadsheetImportPreviewInputSchema,
  spreadsheetImportPreviewSchema,
} from '@smartq/contracts';
import {
  createSpreadsheetImportResource,
  previewSpreadsheetImport,
} from '../application/imports/spreadsheetImportService.js';
import { AppError } from '../application/AppError.js';
import { asyncRoute } from './asyncRoute.js';

export const importRoutes = Router();
const binaryBodyParser = express.raw({
  type: 'application/octet-stream',
  limit: SPREADSHEET_IMPORT_MAX_BYTES,
});
const requireBinaryContentType: RequestHandler = (request, _response, next) => {
  if (!request.is('application/octet-stream')) {
    next(new AppError('请上传表格文件内容。', 415, 'IMPORT_FILE_TYPE_UNSUPPORTED'));
    return;
  }
  next();
};

importRoutes.post(
  '/preview',
  requireBinaryContentType,
  binaryBodyParser,
  asyncRoute(async (request, response) => {
    const input = spreadsheetImportPreviewInputSchema.safeParse(request.query);
    if (!input.success) {
      throw new AppError('文件名或工作表选择无效，请重新选择文件。', 400, 'VALIDATION_ERROR');
    }
    const result = await previewSpreadsheetImport(input.data, requireFileBuffer(request.body));
    response.json(spreadsheetImportPreviewSchema.parse(result));
  }),
);

importRoutes.post(
  '/resources',
  requireBinaryContentType,
  binaryBodyParser,
  asyncRoute(async (request, response) => {
    const input = spreadsheetImportCreateInputSchema.safeParse(request.query);
    if (!input.success) {
      throw new AppError('请检查资源名称和工作表选择。', 400, 'VALIDATION_ERROR');
    }
    const resource = await createSpreadsheetImportResource(
      input.data,
      requireFileBuffer(request.body),
    );
    response.status(201).json(resource);
  }),
);

function requireFileBuffer(value: unknown): Buffer {
  if (!Buffer.isBuffer(value)) {
    throw new AppError('上传内容为空，请重新选择文件。', 400, 'IMPORT_FILE_EMPTY');
  }
  return value;
}
