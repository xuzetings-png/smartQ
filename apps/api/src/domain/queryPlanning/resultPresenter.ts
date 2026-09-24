import type { QueryResult } from '@smartq/contracts';
import type { CompiledQuery } from './sqlCompiler.js';
import type {
  PlanningField,
  PlanningMetric,
  PlanningResource,
  ValidatedQueryPlan,
} from './planValidator.js';

export function presentQueryResult(input: {
  resourceName: string;
  plan: ValidatedQueryPlan;
  resource: PlanningResource;
  compiled: CompiledQuery;
  rows: Array<Record<string, unknown>>;
  durationMs: number;
}): QueryResult {
  const fieldsById = new Map(input.resource.fields.map((field) => [field.id, field]));
  const metric = resolveMetric(input.plan, input.resource.metrics, fieldsById);
  const rows = input.rows.map((row) =>
    Object.fromEntries(
      input.compiled.columns.map((column) => [column.key, normalizeValue(row[column.key])]),
    ),
  );
  const hasNoAggregateValue =
    input.plan.dimensions.length === 0 && rows.length === 1 && rows[0]?.metric_0 === null;
  const visibleRows = hasNoAggregateValue ? [] : rows;
  const dimensions = input.plan.dimensions.map(
    (dimension) => fieldsById.get(dimension.fieldId)?.displayName ?? '未知维度',
  );
  const filters = [
    ...input.compiled.fixedFilters,
    ...input.plan.filters.map((filter) => ({
      label: fieldsById.get(filter.fieldId)?.displayName ?? '筛选字段',
      description: describeFilter(filter),
    })),
  ];
  const timeRangeLabel = input.plan.timeRange
    ? `${input.plan.timeRange.startInclusive} 至 ${input.plan.timeRange.endExclusive}（不含）`
    : null;
  const available = availableCharts(input.plan, fieldsById);
  const recommended = available.includes(input.plan.chartHint ?? 'table')
    ? (input.plan.chartHint ?? defaultChart(available))
    : defaultChart(available);
  const rowCount = visibleRows.length;
  const dimensionText = dimensions.length > 0 ? `按${dimensions.join('、')}汇总` : '汇总';
  const qualifiers = [
    timeRangeLabel ? `时间范围为${timeRangeLabel}` : null,
    filters.length > 0 ? `应用了${String(filters.length)}项筛选条件` : null,
  ].filter((value): value is string => value !== null);
  const answer =
    rowCount === 0
      ? '没有查到符合条件的数据，请调整筛选条件后重试。'
      : `${dimensionText}${input.resourceName}中的${metric.label}${qualifiers.length ? `，${qualifiers.join('，')}` : ''}，共返回${String(rowCount)}组结果。`;

  return {
    answer,
    interpretation: {
      resourceName: input.resourceName,
      metric: { label: metric.label, aggregation: metric.aggregation },
      dimensions,
      filters,
      timeRangeLabel,
    },
    sqlText: input.compiled.sql,
    columns: input.compiled.columns,
    rows: visibleRows,
    rowCount,
    truncated: input.rows.length >= input.plan.limit,
    chart: {
      recommended,
      xKey: input.plan.dimensions.length === 1 ? 'dimension_0' : null,
      yKey: 'metric_0',
      available,
    },
    durationMs: input.durationMs,
  };
}

function resolveMetric(
  plan: ValidatedQueryPlan,
  metrics: PlanningMetric[],
  fieldsById: Map<string, PlanningField>,
) {
  if (plan.measure.kind === 'named') {
    const metricId = plan.measure.metricId;
    const metric = metrics.find((candidate) => candidate.id === metricId);
    if (metric) return { label: metric.displayName, aggregation: metric.aggregation };
  }
  const measure = plan.measure;
  if (measure.kind === 'field') {
    const field = fieldsById.get(measure.fieldId);
    return {
      label: `${aggregationName(measure.aggregation)}${field?.displayName ?? '指标'}`,
      aggregation: measure.aggregation,
    };
  }
  return { label: '指标', aggregation: 'count' as const };
}

function availableCharts(
  plan: ValidatedQueryPlan,
  fieldsById: Map<string, PlanningField>,
): QueryResult['chart']['available'] {
  if (plan.dimensions.length === 0) return ['table', 'metric'];
  if (plan.dimensions.length !== 1) return ['table'];
  const dimension = plan.dimensions[0];
  const field = fieldsById.get(dimension.fieldId);
  if (!field) return ['table'];
  return /^(date|datetime|timestamp)\b/i.test(field.mysqlType)
    ? ['table', 'line']
    : ['table', 'bar'];
}

function defaultChart(
  available: QueryResult['chart']['available'],
): QueryResult['chart']['recommended'] {
  return available.includes('bar')
    ? 'bar'
    : available.includes('line')
      ? 'line'
      : (available[0] ?? 'table');
}

function aggregationName(aggregation: string) {
  return (
    (
      { sum: '合计', avg: '平均', min: '最小', max: '最大', count: '数量：' } as Record<
        string,
        string
      >
    )[aggregation] ?? ''
  );
}

function describeFilter(filter: ValidatedQueryPlan['filters'][number]) {
  const values = filter.value !== undefined ? [filter.value] : (filter.values ?? []);
  const formatted = values.map((value) => String(value)).join(' 至 ');
  const operator = {
    eq: '等于',
    ne: '不等于',
    gt: '大于',
    gte: '大于等于',
    lt: '小于',
    lte: '小于等于',
    between: '介于',
    in: '属于',
    contains: '包含',
    is_null: '为空',
    is_not_null: '不为空',
  }[filter.operator];
  return formatted ? `${operator}${formatted}` : operator;
}

function normalizeValue(value: unknown): QueryResult['rows'][number][string] {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (typeof value === 'bigint') return value.toString();
  return Object.prototype.toString.call(value);
}
