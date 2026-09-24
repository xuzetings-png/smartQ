import type { ResourceConfigurationInput } from '@smartq/contracts';
import { compareResourceSchema } from '../../domain/resources/schemaChanges.js';
import { validateResourceConfiguration } from '../../domain/resources/resourceConfigurationRules.js';
import { getMysqlTableColumns, type MysqlColumn } from '../../infrastructure/mysql/mysqlAdapter.js';
import { getImportedTableColumns } from '../../infrastructure/sqlite/importedDataRepository.js';
import { findResourceDataSourceById } from '../../infrastructure/sqlite/dataSourceRepository.js';
import {
  acceptObservedSchema,
  createDraftResource,
  createSchemaHash,
  getResourceDetails as getStoredResourceDetails,
  getResourceSchemaContext,
  listResources as listStoredResources,
  publishResource,
  saveResourceConfiguration,
  saveSchemaReview,
} from '../../infrastructure/sqlite/resourceRepository.js';
import { AppError } from '../AppError.js';
import { requireDataSource } from '../dataSources/dataSourceService.js';

export function listResources() {
  return listStoredResources();
}

export function getResourceDetails(resourceId: string) {
  const resource = getStoredResourceDetails(resourceId);
  if (!resource) throw new AppError('未找到问数资源', 404, 'RESOURCE_NOT_FOUND');
  if (resource.schemaReview) {
    return {
      ...resource,
      schemaReview: {
        ...resource.schemaReview,
        changes: compareResourceSchema(
          resource.fields,
          resource.schemaReview.observedSchema as MysqlColumn[],
        ),
      },
    };
  }
  return resource;
}

export function saveResourceConfigurationById(
  resourceId: string,
  configuration: ResourceConfigurationInput,
) {
  const resource = getStoredResourceDetails(resourceId);
  if (!resource) throw new AppError('未找到问数资源', 404, 'RESOURCE_NOT_FOUND');
  if (resource.status === 'needs_review') {
    throw new AppError('请先接受待复核的数据表结构', 409, 'RESOURCE_SCHEMA_REVIEW_REQUIRED');
  }

  const issues = validateResourceConfiguration(
    configuration,
    resource.fields,
    resource.metrics.map((metric) => metric.id),
    false,
  );
  if (issues.length > 0) {
    throw new AppError(
      '资源配置有误，请检查字段和指标规则',
      422,
      'RESOURCE_CONFIGURATION_INVALID',
      issues,
    );
  }

  saveResourceConfiguration(resourceId, configuration);
  return getResourceDetails(resourceId);
}

export function publishResourceById(resourceId: string) {
  const resource = getStoredResourceDetails(resourceId);
  if (!resource) throw new AppError('未找到问数资源', 404, 'RESOURCE_NOT_FOUND');
  if (resource.status === 'needs_review') {
    throw new AppError('请先复核数据表结构后再发布', 409, 'RESOURCE_SCHEMA_REVIEW_REQUIRED');
  }

  const configuration: ResourceConfigurationInput = {
    displayName: resource.displayName,
    fields: resource.fields.map((field) => ({
      id: field.id,
      displayName: field.displayName,
      description: field.description,
      semanticRole: field.semanticRole as 'metric' | 'dimension' | 'hidden',
      enabled: field.enabled,
      unit: field.unit,
      defaultAggregation:
        field.defaultAggregation as ResourceConfigurationInput['fields'][number]['defaultAggregation'],
      synonyms: field.synonyms,
    })),
    metrics: resource.metrics.map((metric) => ({
      id: metric.id,
      displayName: metric.displayName,
      description: metric.description,
      fieldId: metric.fieldId,
      aggregation:
        metric.aggregation as ResourceConfigurationInput['metrics'][number]['aggregation'],
      synonyms: metric.synonyms,
      fixedFilters: metric.fixedFilters,
    })),
    recommendedQuestions: resource.recommendedQuestions,
  };
  const issues = validateResourceConfiguration(
    configuration,
    resource.fields,
    resource.metrics.map((metric) => metric.id),
    true,
  );
  if (issues.length > 0) {
    throw new AppError('资源尚未满足发布条件', 422, 'RESOURCE_CONFIGURATION_INVALID', issues);
  }

  publishResource(resourceId);
  return getResourceDetails(resourceId);
}

export async function refreshResourceSchema(resourceId: string) {
  const resource = getResourceSchemaContext(resourceId);
  if (!resource) throw new AppError('未找到问数资源', 404, 'RESOURCE_NOT_FOUND');

  const source = findResourceDataSourceById(resource.dataSourceId);
  if (!source) {
    throw new AppError('找不到数据源配置，请检查后重试', 503, 'DATA_SOURCE_UNAVAILABLE');
  }
  let columns: MysqlColumn[];
  try {
    columns =
      source.kind === 'mysql'
        ? await getMysqlTableColumns(source, resource.tableName)
        : getImportedTableColumns(source.id, resource.tableName);
  } catch {
    throw new AppError('无法读取数据表结构，请检查数据源连接', 503, 'RESOURCE_SCHEMA_UNAVAILABLE');
  }
  if (columns.length === 0) {
    throw new AppError('数据表不存在或没有字段', 503, 'RESOURCE_SCHEMA_UNAVAILABLE');
  }

  const schemaHash = createSchemaHash(columns);
  if (schemaHash === resource.schemaHash) {
    if (resource.status === 'needs_review') {
      // A repeated refresh keeps the pending snapshot until the administrator accepts it.
      return {
        changed: true,
        status: 'needs_review' as const,
        changes: getPendingSchemaChanges(resourceId),
      };
    }
    return { changed: false, status: resource.status };
  }

  saveSchemaReview(resourceId, schemaHash, columns);
  const details = getResourceDetails(resourceId);
  return {
    changed: true,
    status: details.status,
    changes: getPendingSchemaChanges(resourceId),
  };
}

export function acceptResourceSchema(resourceId: string) {
  const resource = getResourceSchemaContext(resourceId);
  if (!resource) throw new AppError('未找到问数资源', 404, 'RESOURCE_NOT_FOUND');
  if (resource.status !== 'needs_review' || !acceptObservedSchema(resourceId)) {
    throw new AppError('当前没有待接受的数据表结构', 409, 'RESOURCE_SCHEMA_REVIEW_NOT_FOUND');
  }
  return getResourceDetails(resourceId);
}

export async function createResourceDraft(
  dataSourceId: string,
  tableName: string,
  displayName: string,
) {
  const source = requireDataSource(dataSourceId);
  let columns: MysqlColumn[];
  try {
    columns = await getMysqlTableColumns(source, tableName);
  } catch {
    throw new AppError('无法读取所选数据表结构', 503, 'DATA_SOURCE_UNAVAILABLE');
  }

  if (columns.length === 0) {
    throw new AppError('数据表不存在或没有字段', 404, 'TABLE_NOT_FOUND');
  }

  try {
    return createDraftResource(source.id, displayName, tableName, columns);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'RESOURCE_EXISTS'
    ) {
      throw new AppError('该数据表已经创建为问数资源', 409, 'RESOURCE_EXISTS');
    }
    throw error;
  }
}

function getPendingSchemaChanges(resourceId: string) {
  const details = getResourceDetails(resourceId);
  if (details.schemaReview && 'changes' in details.schemaReview) {
    return details.schemaReview.changes;
  }
  return { added: [], removed: [], changed: [] };
}
