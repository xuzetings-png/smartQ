import { Router } from 'express';
import { dataSourceInputSchema, dataSourceUpdateSchema } from '@smartq/contracts';
import { asyncRoute } from './asyncRoute.js';
import {
  createDataSource,
  getDataSourceSchema,
  getDataSources,
  getTablePreview,
  testNewDataSource,
  testSavedDataSource,
  updateDataSource,
} from '../application/dataSources/dataSourceService.js';

export const dataSourceRoutes = Router();

dataSourceRoutes.get('/', (_request, response) => response.json({ items: getDataSources() }));

dataSourceRoutes.post(
  '/test',
  asyncRoute(async (request, response) => {
    const input = dataSourceInputSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请检查连接信息是否填写完整' },
      });
      return;
    }
    response.json(await testNewDataSource(input.data));
  }),
);

dataSourceRoutes.post(
  '/:id/test',
  asyncRoute(async (request, response) => {
    const input = dataSourceUpdateSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请检查连接信息是否填写完整' },
      });
      return;
    }
    response.json(await testSavedDataSource(String(request.params.id), input.data));
  }),
);

dataSourceRoutes.post(
  '/',
  asyncRoute(async (request, response) => {
    const input = dataSourceInputSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请检查连接信息是否填写完整' },
      });
      return;
    }
    response.status(201).json(await createDataSource(input.data));
  }),
);

dataSourceRoutes.put(
  '/:id',
  asyncRoute(async (request, response) => {
    const input = dataSourceUpdateSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请检查连接信息是否填写完整' },
      });
      return;
    }
    response.json(await updateDataSource(String(request.params.id), input.data));
  }),
);

dataSourceRoutes.get(
  '/:id/schema',
  asyncRoute(async (request, response) => {
    response.json(await getDataSourceSchema(String(request.params.id)));
  }),
);

dataSourceRoutes.get(
  '/:id/tables/:table/preview',
  asyncRoute(async (request, response) => {
    const limit = Number(request.query.limit ?? 20);
    response.json(
      await getTablePreview(
        String(request.params.id),
        String(request.params.table),
        Number.isFinite(limit) ? Math.trunc(limit) : 20,
      ),
    );
  }),
);
