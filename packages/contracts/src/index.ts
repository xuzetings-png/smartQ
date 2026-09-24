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

export const tableDataPageQuerySchema = z
  .object({
    page: z.coerce.number().int().safe().min(1).default(1),
    pageSize: z.coerce.number().int().safe().min(1).max(20).default(20),
  })
  .strict();

export const tableDataPageSchema = z
  .object({
    tableName: z.string(),
    columns: z
      .array(
        z
          .object({
            name: z.string(),
            mysqlType: z.string(),
            nullable: z.boolean(),
          })
          .strict(),
      )
      .min(1),
    rows: z.array(z.record(z.string(), z.unknown())).max(20),
    page: z.number().int().safe().min(1),
    pageSize: z.number().int().safe().min(1).max(20),
    totalRows: z.number().int().safe().nonnegative(),
    totalPages: z.number().int().safe().nonnegative(),
  })
  .strict();

const modelBaseUrlSchema = z
  .string()
  .trim()
  .min(1, '请输入百炼服务地址')
  .max(1000, '服务地址过长')
  .url('请输入有效的服务地址')
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const isLocalHttp =
      url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(hostname);

    if (url.protocol !== 'https:' && !isLocalHttp) {
      context.addIssue({ code: 'custom', message: '服务地址必须使用 HTTPS' });
    }
    if (url.username || url.password || url.search || url.hash) {
      context.addIssue({
        code: 'custom',
        message: '服务地址不能包含账号、密码、查询参数或片段',
      });
    }
  })
  .transform((value) => value.replace(/\/+$/, ''));

const modelIdSchema = z.string().trim().min(1, '请输入模型名称').max(200, '模型名称过长');

export const modelConfigTestInputSchema = z
  .object({
    baseUrl: modelBaseUrlSchema,
    modelId: modelIdSchema,
    apiKey: z.string().trim().min(1).max(4096).optional(),
    useSavedKey: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine(({ apiKey, useSavedKey }, context) => {
    if (Boolean(apiKey) === useSavedKey) {
      context.addIssue({
        code: 'custom',
        path: ['apiKey'],
        message: '请输入 API Key，或选择沿用已保存的密钥',
      });
    }
  });

export const modelConfigSaveInputSchema = z
  .object({
    baseUrl: modelBaseUrlSchema,
    modelId: modelIdSchema,
    apiKey: z.string().trim().min(1).max(4096).optional(),
  })
  .strict();

export const createResourceInputSchema = z.object({
  dataSourceId: z.string().uuid(),
  tableName: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(80),
});

export const SPREADSHEET_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const SPREADSHEET_IMPORT_PREVIEW_ROWS = 20;

export const spreadsheetImportPreviewInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    sheetName: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export const spreadsheetImportCreateInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    sheetName: z.string().trim().min(1).max(255),
    displayName: z.string().trim().min(1).max(80),
  })
  .strict();

const importedCellValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const spreadsheetImportPreviewSchema = z
  .object({
    fileName: z.string(),
    sheets: z.array(z.object({ name: z.string(), index: z.number().int().nonnegative() })),
    selectedSheet: z.string(),
    rowCount: z.number().int().nonnegative(),
    columnCount: z.number().int().positive(),
    columns: z.array(
      z.object({
        name: z.string(),
        dataType: z.enum(['integer', 'number', 'boolean', 'date', 'text']),
        nullable: z.boolean(),
      }),
    ),
    rows: z.array(z.array(importedCellValueSchema)),
  })
  .strict();

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

const planFilterScalarSchema = z.union([z.string().max(200), z.number().finite(), z.boolean()]);

export const queryPlanFilterSchema = z
  .object({
    fieldId: z.string().uuid(),
    operator: z.enum([
      'eq',
      'ne',
      'gt',
      'gte',
      'lt',
      'lte',
      'between',
      'in',
      'contains',
      'is_null',
      'is_not_null',
    ]),
    value: planFilterScalarSchema.optional(),
    values: z.array(planFilterScalarSchema).max(20).optional(),
  })
  .strict()
  .superRefine((filter, context) => {
    const hasValue = filter.value !== undefined;
    const hasValues = filter.values !== undefined;
    if (['is_null', 'is_not_null'].includes(filter.operator)) {
      if (hasValue || hasValues) {
        context.addIssue({ code: 'custom', message: '空值操作符不能带筛选值' });
      }
      return;
    }
    if (filter.operator === 'in') {
      if (hasValue || !filter.values || filter.values.length === 0) {
        context.addIssue({ code: 'custom', message: 'in 操作符需要 1–20 个筛选值' });
      }
      return;
    }
    if (filter.operator === 'between') {
      if (hasValue || filter.values?.length !== 2) {
        context.addIssue({ code: 'custom', message: 'between 操作符需要两个边界值' });
      }
      return;
    }
    if (!hasValue || hasValues) {
      context.addIssue({ code: 'custom', message: '该筛选操作符需要一个筛选值' });
    }
  });

const queryMeasureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('named'), metricId: z.string().uuid() }).strict(),
  z
    .object({
      kind: z.literal('field'),
      fieldId: z.string().uuid(),
      aggregation: metricAggregationSchema,
    })
    .strict(),
]);

const queryDimensionSchema = z
  .object({
    fieldId: z.string().uuid(),
    bucket: z.enum(['day', 'month']).optional(),
  })
  .strict();

const queryTimeRangeSchema = z
  .object({
    fieldId: z.string().uuid(),
    startInclusive: z.string().min(10).max(32),
    endExclusive: z.string().min(10).max(32),
  })
  .strict();

export const queryPlanSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('query'),
    measure: queryMeasureSchema,
    dimensions: z.array(queryDimensionSchema).max(2),
    timeRange: queryTimeRangeSchema.nullable(),
    filters: z.array(queryPlanFilterSchema).max(8),
    sort: z
      .array(
        z
          .object({
            target: z
              .object({ kind: z.enum(['measure', 'dimension']), index: z.number().int().min(0) })
              .strict(),
            direction: z.enum(['asc', 'desc']),
          })
          .strict(),
      )
      .max(2),
    limit: z.number().int().min(1).max(200).default(50),
    chartHint: z.enum(['table', 'metric', 'bar', 'line']).optional(),
  })
  .strict();

const clarificationPlanObjectSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('clarify'),
    question: z.string().trim().min(1).max(300),
    options: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(40),
            label: z.string().trim().min(1).max(80),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    allowFreeText: z.boolean(),
  })
  .strict();

export const clarificationPlanSchema = clarificationPlanObjectSchema.superRefine(
  (plan, context) => {
    if (new Set(plan.options.map((option) => option.id)).size !== plan.options.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: '澄清选项 ID 不能重复' });
    }
  },
);

export const rejectedPlanSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('reject'),
    code: z.enum(['METRIC_RULE_CONFLICT', 'UNSUPPORTED_REQUEST']),
    message: z.string().trim().min(1).max(300),
  })
  .strict();

export const queryPlanOutputSchema = z.discriminatedUnion('kind', [
  queryPlanSchema,
  clarificationPlanObjectSchema,
  rejectedPlanSchema,
]);

export const planPreviewInputSchema = z
  .object({
    question: z.string().trim().min(1, '请输入样例问题').max(1000, '样例问题不能超过 1000 字'),
    configuration: resourceConfigurationInputSchema,
  })
  .strict();

export const planValidationErrorSchema = z
  .object({
    code: z.string().min(1),
    path: z.string(),
    message: z.string().min(1),
  })
  .strict();

export const planPreviewResponseSchema = z
  .object({
    kind: z.enum(['query', 'clarify', 'reject', 'invalid']),
    plan: queryPlanOutputSchema.nullable(),
    validation: z
      .object({ valid: z.boolean(), errors: z.array(planValidationErrorSchema) })
      .strict(),
    resourceMap: z
      .object({
        fields: z.array(
          z
            .object({ id: z.string().uuid(), displayName: z.string(), columnName: z.string() })
            .strict(),
        ),
        metrics: z.array(
          z
            .object({
              id: z.string().uuid(),
              displayName: z.string(),
              fieldName: z.string(),
              aggregation: metricAggregationSchema,
              fixedFilters: z.array(
                z.object({ fieldName: z.string(), value: z.string() }).strict(),
              ),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const conversationCreateInputSchema = z
  .object({ resourceId: z.string().uuid(), title: z.string().trim().max(80).nullable().optional() })
  .strict();

export const conversationTurnInputSchema = z
  .object({
    requestId: z.string().uuid(),
    input: z.union([
      z.object({ kind: z.literal('question'), text: z.string().trim().min(1).max(1000) }).strict(),
      z
        .object({
          kind: z.literal('clarification'),
          clarificationId: z.string().uuid(),
          optionId: z.string().trim().min(1).max(40).optional(),
          answerText: z.string().trim().min(1).max(500).optional(),
        })
        .strict()
        .superRefine((input, context) => {
          if (Boolean(input.optionId) === Boolean(input.answerText)) {
            context.addIssue({
              code: 'custom',
              message: '澄清回答必须且只能包含选项或自由文本',
            });
          }
        }),
    ]),
  })
  .strict();

const queryResultColumnSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    dataType: z.enum(['string', 'number', 'decimal', 'date', 'boolean', 'unknown']),
    unit: z.string().nullable(),
  })
  .strict();

const queryResultValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const queryResultSchema = z
  .object({
    answer: z.string(),
    processSteps: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
    interpretation: z
      .object({
        resourceName: z.string(),
        metric: z.object({ label: z.string(), aggregation: metricAggregationSchema }).strict(),
        dimensions: z.array(z.string()),
        filters: z.array(z.object({ label: z.string(), description: z.string() }).strict()),
        timeRangeLabel: z.string().nullable(),
      })
      .strict(),
    sqlText: z.string(),
    columns: z.array(queryResultColumnSchema),
    rows: z.array(z.record(z.string(), queryResultValueSchema)),
    rowCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    chart: z
      .object({
        recommended: z.enum(['table', 'metric', 'bar', 'line']),
        xKey: z.string().nullable(),
        yKey: z.string(),
        available: z.array(z.enum(['table', 'metric', 'bar', 'line'])),
      })
      .strict(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

const eventIdentitySchema = z.object({
  conversationId: z.string().uuid(),
  turnId: z.string().uuid(),
  requestId: z.string().uuid(),
});

export const conversationSseEventSchema = z.discriminatedUnion('type', [
  eventIdentitySchema
    .extend({ type: z.literal('turn.started'), isContinuation: z.boolean() })
    .strict(),
  eventIdentitySchema
    .extend({ type: z.literal('stage'), stage: z.enum(['understanding', 'executing']) })
    .strict(),
  eventIdentitySchema
    .extend({
      type: z.literal('progress'),
      step: z.number().int().min(1).max(12),
      phase: z.enum([
        'resource_context',
        'planning',
        'validation',
        'compilation',
        'query',
        'presentation',
      ]),
      status: z.enum(['started', 'completed']),
      message: z.string().trim().min(1).max(300),
    })
    .strict(),
  eventIdentitySchema
    .extend({
      type: z.literal('clarification.required'),
      clarificationId: z.string().uuid(),
      question: z.string(),
      options: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
      allowFreeText: z.boolean(),
      processSteps: z.array(z.string()).max(12).optional(),
    })
    .strict(),
  eventIdentitySchema
    .extend({ type: z.literal('result') })
    .merge(queryResultSchema)
    .strict(),
  eventIdentitySchema
    .extend({
      type: z.literal('error'),
      code: z.string(),
      stage: z.enum(['understanding', 'executing']),
      message: z.string(),
      retryable: z.boolean(),
      processSteps: z.array(z.string()).max(12).optional(),
    })
    .strict(),
  eventIdentitySchema
    .extend({
      type: z.literal('turn.completed'),
      status: z.enum([
        'awaiting_clarification',
        'succeeded',
        'empty',
        'failed',
        'cancelled',
        'interrupted',
      ]),
    })
    .strict(),
]);

const conversationMessageContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('question'), text: z.string() }).strict(),
  z
    .object({
      kind: z.literal('clarification_answer'),
      clarificationId: z.string().uuid(),
      answerText: z.string(),
      optionLabel: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('clarification'),
      clarificationId: z.string().uuid(),
      question: z.string(),
      options: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
      allowFreeText: z.boolean(),
      processSteps: z.array(z.string()).max(12).optional(),
    })
    .strict(),
  z.object({ kind: z.literal('answer'), result: queryResultSchema }).strict(),
  z
    .object({
      kind: z.literal('error'),
      code: z.string(),
      message: z.string(),
      processSteps: z.array(z.string()).max(12).optional(),
    })
    .strict(),
]);

export const conversationMessageSchema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(['user', 'assistant']),
    turnId: z.string().uuid(),
    content: conversationMessageContentSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const conversationSummarySchema = z
  .object({
    id: z.string().uuid(),
    resourceId: z.string().uuid(),
    resourceName: z.string(),
    title: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const conversationDetailSchema = conversationSummarySchema
  .extend({
    messages: z.array(conversationMessageSchema),
    pendingClarification: conversationMessageContentSchema.nullable(),
  })
  .strict();

export type DataSourceInput = z.infer<typeof dataSourceInputSchema>;
export type DataSourceUpdate = z.infer<typeof dataSourceUpdateSchema>;
export type TableDataPageQuery = z.infer<typeof tableDataPageQuerySchema>;
export type TableDataPage = z.infer<typeof tableDataPageSchema>;
export type ModelConfigTestInput = z.infer<typeof modelConfigTestInputSchema>;
export type ModelConfigSaveInput = z.infer<typeof modelConfigSaveInputSchema>;
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;
export type SpreadsheetImportPreviewInput = z.infer<typeof spreadsheetImportPreviewInputSchema>;
export type SpreadsheetImportCreateInput = z.infer<typeof spreadsheetImportCreateInputSchema>;
export type SpreadsheetImportPreview = z.infer<typeof spreadsheetImportPreviewSchema>;
export type ResourceConfigurationInput = z.infer<typeof resourceConfigurationInputSchema>;
export type ResourceMetricConfiguration = z.infer<typeof resourceMetricConfigurationSchema>;
export type MetricFixedFilter = z.infer<typeof metricFixedFilterSchema>;
export type MetricAggregation = z.infer<typeof metricAggregationSchema>;
export type QueryPlan = z.infer<typeof queryPlanSchema>;
export type ClarificationPlan = z.infer<typeof clarificationPlanSchema>;
export type RejectedPlan = z.infer<typeof rejectedPlanSchema>;
export type QueryPlanOutput = z.infer<typeof queryPlanOutputSchema>;
export type PlanPreviewInput = z.infer<typeof planPreviewInputSchema>;
export type PlanPreviewResponse = z.infer<typeof planPreviewResponseSchema>;
export type PlanValidationError = z.infer<typeof planValidationErrorSchema>;
export type ConversationCreateInput = z.infer<typeof conversationCreateInputSchema>;
export type ConversationTurnInput = z.infer<typeof conversationTurnInputSchema>;
export type ConversationSseEvent = z.infer<typeof conversationSseEventSchema>;
export type QueryResult = z.infer<typeof queryResultSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

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

export type ModelConfigSummary =
  | {
      configured: false;
      enabled: false;
      apiKeyConfigured: false;
    }
  | {
      configured: true;
      provider: 'bailian-openai-compatible';
      baseUrl: string;
      modelId: string;
      enabled: boolean;
      apiKeyConfigured: boolean;
      apiKeyMasked: string | null;
      lastTestAt: string | null;
    };

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
};
