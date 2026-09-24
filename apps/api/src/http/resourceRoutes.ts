import { Router } from 'express';
import { createResourceInputSchema } from '@smartq/contracts';
import { createResourceDraft } from '../application/resources/resourceService.js';
import { asyncRoute } from './asyncRoute.js';

export const resourceRoutes = Router();

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
