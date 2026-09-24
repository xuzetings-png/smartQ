import {
  conversationDetailSchema,
  conversationSseEventSchema,
  conversationSummarySchema,
  type ConversationCreateInput,
  type ConversationDetail,
  type ConversationSseEvent,
  type ConversationSummary,
  type ConversationTurnInput,
} from '@smartq/contracts';
import { ApiError, type ApiErrorPayload, requestJson } from '../../shared/api/apiClient';
import { readSseFrames } from './sseParser';

export const conversationApi = {
  async list(resourceId?: string) {
    const query = resourceId ? `?resourceId=${encodeURIComponent(resourceId)}` : '';
    const response = await requestJson<{ items: unknown[] }>(`/api/conversations${query}`);
    return response.items.map((item) => conversationSummarySchema.parse(item));
  },

  async get(conversationId: string): Promise<ConversationDetail> {
    return conversationDetailSchema.parse(
      await requestJson<unknown>(`/api/conversations/${conversationId}`),
    );
  },

  async create(input: ConversationCreateInput): Promise<ConversationSummary> {
    return conversationSummarySchema.parse(
      await requestJson<unknown>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async submitTurn(
    conversationId: string,
    input: ConversationTurnInput,
    signal: AbortSignal,
    onEvent: (event: ConversationSseEvent) => void,
  ) {
    const response = await fetch(`/api/conversations/${conversationId}/turns`, {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok) throw await readApiError(response);
    if (!response.body) throw new ApiError('问数连接没有返回数据流', response.status);

    let completed = false;
    for await (const frame of readSseFrames(response.body)) {
      let rawEvent: unknown;
      try {
        rawEvent = JSON.parse(frame.data);
      } catch {
        throw new ApiError('问数服务返回了无法识别的进度消息', 502, 'SSE_EVENT_INVALID');
      }
      const parsed = conversationSseEventSchema.safeParse(rawEvent);
      if (!parsed.success || parsed.data.type !== frame.event) {
        throw new ApiError('问数服务返回了不符合约定的进度消息', 502, 'SSE_EVENT_INVALID');
      }
      onEvent(parsed.data);
      if (parsed.data.type === 'turn.completed') completed = true;
    }
    return { completed };
  },

  cancelTurn(conversationId: string, turnId: string) {
    return requestJson<{ status: 'cancelled' | 'already_finished'; turnId: string }>(
      `/api/conversations/${conversationId}/turns/${turnId}`,
      { method: 'DELETE' },
    );
  },
};

async function readApiError(response: Response) {
  const payload: unknown = await response.json().catch(() => ({}));
  const errorPayload = payload as ApiErrorPayload;
  return new ApiError(
    errorPayload.error?.message ?? `请求失败（${String(response.status)}）`,
    response.status,
    errorPayload.error?.code,
    errorPayload.error?.details,
  );
}
