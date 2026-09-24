import { z } from 'zod';

export const dataSourceInputSchema = z.object({
  name: z.string().trim().min(1).max(80).default('本地演示 MySQL'),
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  database: z.string().trim().min(1).max(64),
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(512),
});

export const dataSourceUpdateSchema = dataSourceInputSchema.extend({
  password: z.string().min(1).max(512).optional(),
});

export const createResourceInputSchema = z.object({
  dataSourceId: z.string().uuid(),
  tableName: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(80),
});

export const metricAggregationSchema = z.enum(['sum', 'avg', 'min', 'max', 'count']);

const resourceFieldConfigurationSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  semanticRole: z.enum(['metric', 'dimension', 'hidden']),
  enabled: z.boolean(),
  unit: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((value) => (value === '' ? null : (value ?? null))),
  defaultAggregation: metricAggregationSchema.nullish().transform((value) => value ?? null),
  synonyms: z.array(z.string().trim().min(1).max(80)).max(20),
});

const metricFixedFilterSchema = z.object({
  fieldId: z.string().uuid(),
  operator: z.literal('eq'),
  value: z.string().trim().min(1).max(160),
});

const resourceMetricConfigurationSchema = z.object({
  id: z.string().uuid().optional(),
  displayName: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  fieldId: z.string().uuid(),
  aggregation: metricAggregationSchema,
  synonyms: z.array(z.string().trim().min(1).max(80)).max(20),
  fixedFilters: z.array(metricFixedFilterSchema).max(10),
});

export const resourceConfigurationInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  fields: z.array(resourceFieldConfigurationSchema).min(1).max(200),
  metrics: z.array(resourceMetricConfigurationSchema).max(50),
  recommendedQuestions: z.array(z.string().trim().min(1).max(160)).max(4),
});

export type DataSourceInput = z.infer<typeof dataSourceInputSchema>;
export type DataSourceUpdate = z.infer<typeof dataSourceUpdateSchema>;
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;
export type ResourceConfigurationInput = z.infer<typeof resourceConfigurationInputSchema>;
export type ResourceMetricConfiguration = z.infer<typeof resourceMetricConfigurationSchema>;
export type MetricFixedFilter = z.infer<typeof metricFixedFilterSchema>;
export type MetricAggregation = z.infer<typeof metricAggregationSchema>;

export type DataSourceSummary = {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  passwordConfigured: boolean;
  passwordMasked: string;
  status: 'ready';
  lastTestedAt: string;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
};
