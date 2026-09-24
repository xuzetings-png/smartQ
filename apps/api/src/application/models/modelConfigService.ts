import type { ModelConfigSaveInput, ModelConfigTestInput } from '@smartq/contracts';
import { AppError } from '../AppError.js';
import {
  requestBailianChatCompletion,
  testBailianConnection,
} from '../../infrastructure/bailian/bailianClient.js';
import { assertEncryptionKeyConfigured } from '../../infrastructure/sqlite/credentialCipher.js';
import {
  getModelConfigSummary,
  getSavedModelCredentials,
  saveModelConfig,
} from '../../infrastructure/sqlite/modelConfigRepository.js';

export function getModelConfig() {
  return getModelConfigSummary();
}

export async function generateWithDefaultModel(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
) {
  const saved = getSavedCredentialsSafely();
  if (!saved?.apiKey || !saved.enabled) {
    throw new AppError('请先在模型配置页完成配置并启用默认模型', 409, 'MODEL_NOT_CONFIGURED');
  }

  const result = await requestBailianChatCompletion({
    baseUrl: saved.baseUrl,
    modelId: saved.modelId,
    apiKey: saved.apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 3000,
    jsonMode: true,
    signal,
  });
  return result.content;
}

export async function testModelConfig(input: ModelConfigTestInput) {
  const apiKey = input.apiKey ?? requireSavedApiKey();
  const result = await testBailianConnection({
    baseUrl: input.baseUrl,
    modelId: input.modelId,
    apiKey,
  });

  return { success: true as const, modelId: input.modelId, ...result };
}

export async function saveModelConfiguration(input: ModelConfigSaveInput) {
  assertModelEncryptionAvailable();
  const saved = input.apiKey ? null : getSavedCredentialsSafely();
  const apiKey = input.apiKey ?? saved?.apiKey;
  if (!apiKey) {
    throw new AppError('请先填写 API Key', 400, 'MODEL_API_KEY_REQUIRED');
  }

  await testBailianConnection({
    baseUrl: input.baseUrl,
    modelId: input.modelId,
    apiKey,
  });

  try {
    return saveModelConfig({
      baseUrl: input.baseUrl,
      modelId: input.modelId,
      apiKey: input.apiKey,
      lastTestAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('SMARTQ_ENCRYPTION_KEY')) {
      throw new AppError(
        '模型密钥加密未配置，请检查本地 SMARTQ_ENCRYPTION_KEY',
        500,
        'ENCRYPTION_NOT_CONFIGURED',
      );
    }
    throw error;
  }
}

function requireSavedApiKey() {
  const saved = getSavedCredentialsSafely();
  if (!saved?.apiKey) {
    throw new AppError('请填写 API Key', 400, 'MODEL_API_KEY_REQUIRED');
  }
  return saved.apiKey;
}

function getSavedCredentialsSafely() {
  try {
    return getSavedModelCredentials();
  } catch {
    throw new AppError(
      '已保存的模型密钥无法解密，请检查本地 SMARTQ_ENCRYPTION_KEY 配置',
      500,
      'MODEL_SECRET_UNAVAILABLE',
    );
  }
}

function assertModelEncryptionAvailable() {
  try {
    assertEncryptionKeyConfigured();
  } catch {
    throw new AppError(
      '模型密钥加密未配置，请检查本地 SMARTQ_ENCRYPTION_KEY',
      500,
      'ENCRYPTION_NOT_CONFIGURED',
    );
  }
}
