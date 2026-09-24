export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field?: string; message: string }>;
  };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function requestJson<TResponse>(
  path: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload;
    const message = errorPayload.error?.message ?? `请求失败（${String(response.status)}）`;
    const details = errorPayload.error?.details;
    throw new ApiError(
      details?.length
        ? `${message}：${details.map((detail) => detail.message).join('；')}`
        : message,
      response.status,
      errorPayload.error?.code,
      details,
    );
  }

  return payload as TResponse;
}
