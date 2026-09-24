import { Router } from 'express';
import { modelConfigSaveInputSchema, modelConfigTestInputSchema } from '@smartq/contracts';
import { asyncRoute } from './asyncRoute.js';
import {
  getModelConfig,
  saveModelConfiguration,
  testModelConfig,
} from '../application/models/modelConfigService.js';

export const modelRoutes = Router();

modelRoutes.get('/config', (_request, response) => {
  response.json(getModelConfig());
});

modelRoutes.post(
  '/test',
  asyncRoute(async (request, response) => {
    const input = modelConfigTestInputSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请检查服务地址、模型名称和 API Key' },
      });
      return;
    }
    response.json(await testModelConfig(input.data));
  }),
);

modelRoutes.put(
  '/config',
  asyncRoute(async (request, response) => {
    const input = modelConfigSaveInputSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请检查模型配置和 API Key' },
      });
      return;
    }
    response.json(await saveModelConfiguration(input.data));
  }),
);
