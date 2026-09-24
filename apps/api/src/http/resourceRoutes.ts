import { Router } from 'express';
import {
  createResourceInputSchema,
  planPreviewInputSchema,
  resourceConfigurationInputSchema,
} from '@smartq/contracts';
import {
  acceptResourceSchema,
  createResourceDraft,
  getResourceDetails,
  listResources,
  publishResourceById,
  refreshResourceSchema,
  saveResourceConfigurationById,
} from '../application/resources/resourceService.js';
import { previewResourcePlan } from '../application/resources/planPreviewService.js';
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
      error: {
        code: 'VALIDATION_ERROR',
        message: '资源配置格式不正确，请检查后重试',
        details: input.error.issues.map((issue) => ({
          field: issue.path.map(String).join('.'),
          message: `请检查${describeResourceConfigurationField(issue.path)}是否填写完整并符合格式要求。`,
        })),
      },
    });
    return;
  }
  response.json(saveResourceConfigurationById(resourceIdFromParam(request.params.id), input.data));
});

resourceRoutes.post('/:id/publish', (request, response) => {
  response.json(publishResourceById(resourceIdFromParam(request.params.id)));
});

resourceRoutes.post(
  '/:id/plan-preview',
  asyncRoute(async (request, response) => {
    const input = planPreviewInputSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请检查样例问题和当前资源配置' },
      });
      return;
    }
    response.json(await previewResourcePlan(resourceIdFromParam(request.params.id), input.data));
  }),
);

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

function describeResourceConfigurationField(path: Array<string | number>) {
  const [section, index, property] = path;
  const sections: Record<string, string> = {
    displayName: '资源名称',
    fields: '字段配置',
    metrics: '业务口径配置',
    recommendedQuestions: '推荐问题配置',
  };
  const properties: Record<string, string> = {
    id: '字段 ID',
    displayName: '业务名称',
    description: '说明',
    semanticRole: '字段角色',
    enabled: '是否允许问数',
    unit: '计量单位',
    defaultAggregation: '默认聚合方式',
    synonyms: '同义词',
    fieldId: '汇总字段',
    aggregation: '聚合方式',
    fixedFilters: '固定过滤条件',
  };
  let label = typeof section === 'string' ? (sections[section] ?? '资源配置') : '资源配置';
  if (typeof index === 'number') label += `第${String(index + 1)}项`;
  if (typeof property === 'string') label += `的${properties[property] ?? '内容'}`;
  return label;
}
