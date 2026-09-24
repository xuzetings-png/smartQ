import type { PlanPreviewResponse, ResourceConfigurationInput } from '@smartq/contracts';
import { requestJson } from '../../shared/api/apiClient';

export type ResourceStatus = 'draft' | 'active' | 'needs_review';

export type ResourceSummary = {
  id: string;
  displayName: string;
  tableName: string;
  dataSourceName: string;
  status: ResourceStatus;
  fieldCount: number;
  createdAt: string;
};

export type ResourceField = ResourceConfigurationInput['fields'][number] & {
  columnName: string;
  mysqlType: string;
  nullable: boolean;
  ordinalPosition: number;
};

export type ResourceMetric = ResourceConfigurationInput['metrics'][number] & { id: string };

export type SchemaColumnChange = {
  columnName: string;
  mysqlType: string;
  previousMysqlType?: string;
  nullable?: boolean;
  ordinalPosition?: number;
  previousOrdinalPosition?: number;
};

export type SchemaChanges = {
  added: SchemaColumnChange[];
  removed: SchemaColumnChange[];
  changed: SchemaColumnChange[];
};

export type ResourceDetail = {
  id: string;
  displayName: string;
  tableName: string;
  status: ResourceStatus;
  schemaHash: string;
  dataSourceName: string;
  createdAt: string;
  fields: ResourceField[];
  metrics: ResourceMetric[];
  recommendedQuestions: string[];
  schemaReview: {
    observedSchemaHash: string;
    detectedAt: string;
    changes: SchemaChanges;
  } | null;
};

export type SchemaRefreshResult =
  | { changed: false; status: ResourceStatus }
  | { changed: true; status: 'needs_review'; changes: SchemaChanges };

export const resourceApi = {
  async list() {
    return requestJson<{ items: ResourceSummary[] }>('/api/resources');
  },

  get(id: string) {
    return requestJson<ResourceDetail>(`/api/resources/${id}`);
  },

  save(id: string, configuration: ResourceConfigurationInput) {
    return requestJson<ResourceDetail>(`/api/resources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(configuration),
    });
  },

  publish(id: string) {
    return requestJson<ResourceDetail>(`/api/resources/${id}/publish`, { method: 'POST' });
  },

  refreshSchema(id: string) {
    return requestJson<SchemaRefreshResult>(`/api/resources/${id}/schema/refresh`, {
      method: 'POST',
    });
  },

  acceptSchema(id: string) {
    return requestJson<ResourceDetail>(`/api/resources/${id}/schema/accept`, { method: 'POST' });
  },

  previewPlan(id: string, input: { question: string; configuration: ResourceConfigurationInput }) {
    return requestJson<PlanPreviewResponse>(`/api/resources/${id}/plan-preview`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
