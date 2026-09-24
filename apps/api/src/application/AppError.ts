export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
