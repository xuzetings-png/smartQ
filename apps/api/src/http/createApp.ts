import express from 'express';
import { dataSourceRoutes } from './dataSourceRoutes.js';
import { errorHandler } from './errorHandler.js';
import { resourceRoutes } from './resourceRoutes.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      appVersion: '0.1.0',
      sqlite: 'ready',
      nodeMajor: Number(process.versions.node.split('.')[0]),
    });
  });
  app.use('/api/data-sources', dataSourceRoutes);
  app.use('/api/resources', resourceRoutes);
  app.use(errorHandler);
  return app;
}
