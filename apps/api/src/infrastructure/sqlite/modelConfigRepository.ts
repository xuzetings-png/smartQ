import type { ModelConfigSummary } from '@smartq/contracts';
import { decryptSecret, encryptSecret } from './credentialCipher.js';
import { db } from './database.js';

type StoredModelConfig = {
  id: 'default';
  provider: 'bailian-openai-compatible';
  base_url: string;
  model_id: string;
  api_key_ciphertext: string | null;
  api_key_iv: string | null;
  api_key_tag: string | null;
  enabled: 0 | 1;
  last_test_at: string | null;
};

export type SavedModelCredentials = {
  baseUrl: string;
  modelId: string;
  apiKey: string;
  enabled: boolean;
};

export function getModelConfigSummary(): ModelConfigSummary {
  const config = getStoredModelConfig();
  if (!config) {
    return { configured: false, enabled: false, apiKeyConfigured: false };
  }

  const apiKeyConfigured = Boolean(config.api_key_ciphertext);
  return {
    configured: true,
    provider: config.provider,
    baseUrl: config.base_url,
    modelId: config.model_id,
    enabled: config.enabled === 1,
    apiKeyConfigured,
    apiKeyMasked: apiKeyConfigured ? '••••••••' : null,
    lastTestAt: config.last_test_at,
  };
}

export function getSavedModelCredentials(): SavedModelCredentials | null {
  const config = getStoredModelConfig();
  if (!config?.api_key_ciphertext || !config.api_key_iv || !config.api_key_tag) {
    return null;
  }

  return {
    baseUrl: config.base_url,
    modelId: config.model_id,
    apiKey: decryptSecret(config.api_key_ciphertext, config.api_key_iv, config.api_key_tag),
    enabled: config.enabled === 1,
  };
}

export function saveModelConfig(input: {
  baseUrl: string;
  modelId: string;
  apiKey?: string;
  lastTestAt: string;
}): ModelConfigSummary {
  const current = getStoredModelConfig();
  const encryptedKey = input.apiKey
    ? encryptSecret(input.apiKey)
    : current?.api_key_ciphertext && current.api_key_iv && current.api_key_tag
      ? {
          ciphertext: current.api_key_ciphertext,
          iv: current.api_key_iv,
          tag: current.api_key_tag,
        }
      : null;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO model_configs (
      id, provider, base_url, model_id, api_key_ciphertext, api_key_iv, api_key_tag,
      enabled, last_test_at, created_at, updated_at
    ) VALUES ('default', 'bailian-openai-compatible', ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      base_url = excluded.base_url,
      model_id = excluded.model_id,
      api_key_ciphertext = excluded.api_key_ciphertext,
      api_key_iv = excluded.api_key_iv,
      api_key_tag = excluded.api_key_tag,
      enabled = 1,
      last_test_at = excluded.last_test_at,
      updated_at = excluded.updated_at`,
  ).run(
    input.baseUrl,
    input.modelId,
    encryptedKey?.ciphertext ?? null,
    encryptedKey?.iv ?? null,
    encryptedKey?.tag ?? null,
    input.lastTestAt,
    now,
    now,
  );

  return getModelConfigSummary();
}

function getStoredModelConfig() {
  return db.prepare("SELECT * FROM model_configs WHERE id = 'default'").get() as
    StoredModelConfig | undefined;
}
