import { Router } from 'express';
import { createResourceInputSchema, resourceConfigurationInputSchema } from '@smartq/contracts';
import {
  acceptResourceSchema,
  createResourceDraft,
  getResourceDetails,
  listResources,
  publishResourceById,
  refreshResourceSchema,
  saveResourceConfigurationById,
} from '../application/resources/resourceService.js';
import { asyncRoute } from './asyncRoute.js';

export const resourceRoutes = Router();

resourceRoutes.get('/', (_request, response) => {
  response.json({ items: listResources() });
});

resourceRoutes.get('/:id', (request, response) => {
  response.json(getResourceDetails(resourceIdFromParam(request.params.id)));
});

resourceRoutes.put('/:id', (request, response) => {
  const input = resourceConfigurationInputSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: '资源配置格式不正确，请检查后重试' },
    });
    return;
  }
  response.json(saveResourceConfigurationById(resourceIdFromParam(request.params.id), input.data));
});

resourceRoutes.post('/:id/publish', (request, response) => {
  response.json(publishResourceById(resourceIdFromParam(request.params.id)));
});

resourceRoutes.post(
  '/:id/schema/refresh',
  asyncRoute(async (request, response) => {
    response.json(await refreshResourceSchema(resourceIdFromParam(request.params.id)));
  }),
);

resourceRoutes.post('/:id/schema/accept', (request, response) => {
  response.json(acceptResourceSchema(resourceIdFromParam(request.params.id)));
});

resourceRoutes.post(
  '/',
  asyncRoute(async (request, response) => {
    const input = createResourceInputSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请填写资源名称并选择数据表' },
      });
      return;
    }

    const resource = await createResourceDraft(
      input.data.dataSourceId,
      input.data.tableName,
      input.data.displayName,
    );
    response.status(201).json(resource);
  }),
);

function resourceIdFromParam(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? '') : value;
}
