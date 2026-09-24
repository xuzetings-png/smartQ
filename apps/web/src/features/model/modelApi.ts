import type {
  ModelConfigSaveInput,
  ModelConfigSummary,
  ModelConfigTestInput,
} from '@smartq/contracts';
import { requestJson } from '../../shared/api/apiClient';

export const modelApi = {
  getConfig() {
    return requestJson<ModelConfigSummary>('/api/models/config');
  },

  test(input: ModelConfigTestInput) {
    return requestJson<{ success: true; modelId: string; responseTimeMs: number }>(
      '/api/models/test',
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  save(input: ModelConfigSaveInput) {
    return requestJson<ModelConfigSummary>('/api/models/config', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
};
