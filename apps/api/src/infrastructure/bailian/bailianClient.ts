import { AppError } from '../../application/AppError.js';

const REQUEST_TIMEOUT_MS = 15_000;

export type BailianCompletionInput = {
  baseUrl: string;
  modelId: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
};

export async function requestBailianChatCompletion(input: BailianCompletionInput) {
  const startedAt = Date.now();
  let response: Response;

  try {
    response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
        max_tokens: input.maxTokens ?? 2048,
        temperature: 0,
        stream: false,
        ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason ?? error;
    if (isTimeoutError(error)) {
      throw new AppError('模型服务响应超时，请稍后重试', 504, 'MODEL_TIMEOUT');
    }
    throw new AppError('无法连接模型服务，请检查地址和网络', 503, 'MODEL_UNAVAILABLE');
  }

  if (!response.ok) throw mapProviderStatus(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidProviderResponse();
  }
  const content = completionContent(payload);
  if (content === null) throw invalidProviderResponse();

  return { content, responseTimeMs: Date.now() - startedAt };
}

export async function testBailianConnection(input: {
  baseUrl: string;
  modelId: string;
  apiKey: string;
}): Promise<{ responseTimeMs: number }> {
  const result = await requestBailianChatCompletion({
    ...input,
    systemPrompt: '你正在执行连通性测试，请只回复 OK。',
    userPrompt: '连通性测试',
    maxTokens: 8,
  });
  if (!result.content.trim()) throw invalidProviderResponse();
  return { responseTimeMs: result.responseTimeMs };
}

function completionContent(value: unknown) {
  const choices = readProperty(value, 'choices');
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const choice: unknown = choices[0];
  const message = readProperty(choice, 'message');
  const content = readProperty(message, 'content');
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;

  const textParts = content.flatMap((part) => {
    const text = readProperty(part, 'text');
    return typeof text === 'string' ? [text] : [];
  });
  return textParts.length > 0 ? textParts.join('') : null;
}

function readProperty(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

function invalidProviderResponse() {
  return new AppError(
    '模型服务返回内容无法识别，请检查服务地址和模型名称',
    502,
    'MODEL_INVALID_RESPONSE',
  );
}

function mapProviderStatus(status: number) {
  if (status === 401 || status === 403) {
    return new AppError('模型服务鉴权失败，请检查 API Key', 400, 'MODEL_AUTH_FAILED');
  }
  if (status === 404) {
    return new AppError('模型服务地址或模型名称无效，请检查配置', 400, 'MODEL_NOT_FOUND');
  }
  if (status === 429) {
    return new AppError('模型服务暂时限流，请稍后重试', 503, 'MODEL_RATE_LIMITED');
  }
  if (status >= 500) {
    return new AppError('模型服务暂时不可用，请稍后重试', 503, 'MODEL_UNAVAILABLE');
  }
  return new AppError('模型服务拒绝了请求，请检查地址和模型配置', 400, 'MODEL_REQUEST_REJECTED');
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
