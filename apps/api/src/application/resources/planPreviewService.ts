import { randomUUID } from 'node:crypto';
import {
  queryPlanOutputSchema,
  type PlanPreviewInput,
  type PlanPreviewResponse,
} from '@smartq/contracts';
import {
  validateQueryPlan,
  type PlanningField,
  type PlanningMetric,
} from '../../domain/queryPlanning/planValidator.js';
import { validateResourceConfiguration } from '../../domain/resources/resourceConfigurationRules.js';
import { generateWithDefaultModel } from '../models/modelConfigService.js';
import { AppError } from '../AppError.js';
import { getResourceDetails as getStoredResourceDetails } from '../../infrastructure/sqlite/resourceRepository.js';
import { buildPlanPreviewPrompts, parsePlanOutput } from './planPreviewPrompt.js';
import { refreshResourceSchema } from './resourceService.js';

export async function previewResourcePlan(resourceId: string, input: PlanPreviewInput) {
  const beforeRefresh = getStoredResourceDetails(resourceId);
  if (!beforeRefresh) throw new AppError('未找到问数资源', 404, 'RESOURCE_NOT_FOUND');
  if (beforeRefresh.status === 'needs_review') {
    throw new AppError(
      '数据表结构待复核，请先完成复核后再调试',
      409,
      'RESOURCE_SCHEMA_REVIEW_REQUIRED',
    );
  }

  await refreshResourceSchema(resourceId);
  const current = getStoredResourceDetails(resourceId);
  if (!current) throw new AppError('未找到问数资源', 404, 'RESOURCE_NOT_FOUND');
  if (current.status === 'needs_review') {
    throw new AppError(
      '检测到数据表结构变化，资源已暂停，请先完成复核',
      409,
      'RESOURCE_SCHEMA_REVIEW_REQUIRED',
    );
  }

  const configurationIssues = validateResourceConfiguration(
    input.configuration,
    current.fields,
    current.metrics.map((metric) => metric.id),
    false,
  );
  if (configurationIssues.length > 0) {
    return makeResponse(
      'invalid',
      null,
      {
        valid: false,
        errors: configurationIssues.map((item) => ({
          code: 'RESOURCE_CONFIGURATION_INVALID',
          path: item.field ?? '',
          message: item.message,
        })),
      },
      makeResourceMap(
        current.fields,
        current.metrics.map((metric) => ({
          id: metric.id,
          displayName: metric.displayName,
          fieldId: metric.fieldId,
          aggregation: metric.aggregation,
          fixedFilters: metric.fixedFilters,
        })),
        current.fields,
      ),
    );
  }

  const configuredFields = new Map(input.configuration.fields.map((field) => [field.id, field]));
  const fields: PlanningField[] = current.fields.map((field) => ({
    ...field,
    ...configuredFields.get(field.id),
    id: field.id,
    columnName: field.columnName,
    mysqlType: field.mysqlType,
  }));
  const metrics: PlanningMetric[] = input.configuration.metrics.map((metric) => ({
    ...metric,
    id: metric.id ?? randomUUID(),
  }));
  const planningResource = { fields, metrics };
  const resourceMap = makeResourceMap(fields, metrics, fields);
  const prompts = buildPlanPreviewPrompts(input.question, planningResource);
  const content = await generateWithDefaultModel(prompts.systemPrompt, prompts.userPrompt);
  const parsed = parsePlanOutput(content);
  if (parsed === null) {
    return makeResponse(
      'invalid',
      null,
      {
        valid: false,
        errors: [
          {
            code: 'PLAN_JSON_INVALID',
            path: '',
            message: '模型没有返回有效 JSON，请重新调试或检查模型的 JSON 输出能力。',
          },
        ],
      },
      resourceMap,
    );
  }

  const output = queryPlanOutputSchema.safeParse(parsed);
  if (!output.success) {
    const issue = output.error.issues[0];
    const path = issue.path.join('.');
    const detail =
      issue.code === 'invalid_type'
        ? `需要${validationTypeLabel(issue.expected)}，实际为${validationTypeLabel(issue.received)}`
        : issue.message;
    return makeResponse(
      'invalid',
      null,
      {
        valid: false,
        errors: [
          {
            code: 'PLAN_FORMAT_INVALID',
            path,
            message: `模型返回计划的${describePlanPath(path)}不符合约定${detail ? `（${detail}）` : ''}，请再次调试。`,
          },
        ],
      },
      resourceMap,
    );
  }

  const plan = output.data;
  if (
    plan.kind === 'clarify' &&
    new Set(plan.options.map((option) => option.id)).size !== plan.options.length
  ) {
    return makeResponse(
      'invalid',
      null,
      {
        valid: false,
        errors: [
          {
            code: 'PLAN_FORMAT_INVALID',
            path: 'options',
            message: '澄清选项 ID 重复，模型返回的计划不符合约定。',
          },
        ],
      },
      resourceMap,
    );
  }
  const errors =
    plan.kind === 'query' ? validateQueryPlan(plan, planningResource, input.question) : [];
  return makeResponse(plan.kind, plan, { valid: errors.length === 0, errors }, resourceMap);
}

function makeResourceMap(
  fields: Array<{
    id: string;
    displayName: string;
    columnName: string;
  }>,
  metrics: Array<{
    id: string;
    displayName: string;
    fieldId: string;
    aggregation: string;
    fixedFilters: Array<{ fieldId: string; value: string }>;
  }>,
  allFields: Array<{ id: string; displayName: string; columnName: string }>,
) {
  const fieldsById = new Map(allFields.map((field) => [field.id, field]));
  return {
    fields: fields.map(({ id, displayName, columnName }) => ({ id, displayName, columnName })),
    metrics: metrics.map((metric) => ({
      id: metric.id,
      displayName: metric.displayName,
      fieldName: fieldsById.get(metric.fieldId)?.displayName ?? '未知字段',
      aggregation:
        metric.aggregation as PlanPreviewResponse['resourceMap']['metrics'][number]['aggregation'],
      fixedFilters: metric.fixedFilters.map((filter) => ({
        fieldName: fieldsById.get(filter.fieldId)?.displayName ?? '未知字段',
        value: filter.value,
      })),
    })),
  } satisfies PlanPreviewResponse['resourceMap'];
}

function makeResponse(
  kind: PlanPreviewResponse['kind'],
  plan: PlanPreviewResponse['plan'],
  validation: PlanPreviewResponse['validation'],
  resourceMap: PlanPreviewResponse['resourceMap'],
): PlanPreviewResponse {
  return { kind, plan, validation, resourceMap };
}

function describePlanPath(path: string) {
  if (!path) return '整体结构';

  const [section, index, property] = path.split('.');
  const labels: Record<string, string> = {
    version: '版本号',
    kind: '计划类型',
    measure: '查询指标',
    dimensions: '分组维度',
    timeRange: '时间范围',
    filters: '筛选条件',
    sort: '排序设置',
    limit: '结果行数',
    options: '澄清选项',
  };
  const propertyLabels: Record<string, string> = {
    fieldId: '字段 ID',
    metricId: '指标 ID',
    aggregation: '聚合方式',
    bucket: '日期分组方式',
  };
  let label = labels[section] ?? `“${path}”`;
  if (/^\d+$/.test(index)) label += `第${String(Number(index) + 1)}项`;
  if (property) label += `的${propertyLabels[property] ?? property}`;
  return label;
}

function validationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    string: '文本',
    number: '数字',
    boolean: '布尔值',
    object: '对象',
    array: '数组',
    null: '空值',
    undefined: '缺失值',
  };
  return labels[type] ?? type;
}
