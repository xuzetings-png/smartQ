import type { ErrorRequestHandler } from 'express';
import { AppError } from '../application/AppError.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    response.status(413).json({
      error: { code: 'IMPORT_FILE_TOO_LARGE', message: '文件超过 10 MiB，请压缩或拆分后重试。' },
    });
    return;
  }

  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' },
  });
};
