import type { QueryPlan } from '@smartq/contracts';
import { AppError } from '../../application/AppError.js';
import type {
  PlanningField,
  PlanningMetric,
  PlanningResource,
  ValidatedQueryPlan,
} from './planValidator.js';

export type CompiledQuery = {
  sql: string;
  parameters: Array<string | number | boolean>;
  columns: Array<{
    key: string;
    label: string;
    dataType: 'string' | 'number' | 'decimal' | 'date' | 'boolean' | 'unknown';
    unit: string | null;
  }>;
  fixedFilters: Array<{ label: string; description: string }>;
};

export type SqlDialect = 'mysql' | 'sqlite';

export function compileValidatedQuery(
  plan: ValidatedQueryPlan,
  resource: PlanningResource & { tableName: string },
  dialect: SqlDialect = 'mysql',
): CompiledQuery {
  const fieldsById = new Map(resource.fields.map((field) => [field.id, field]));
  const metricsById = new Map(resource.metrics.map((metric) => [metric.id, metric]));
  const measure = resolveMeasure(plan, fieldsById, metricsById);
  const parameters: Array<string | number | boolean> = [];
  const dimensionExpressions = plan.dimensions.map((dimension, index) => {
    const field = requireField(fieldsById, dimension.fieldId);
    const identifier = quoteIdentifier(field.columnName);
    const expression = dimension.bucket
      ? compileDateBucket(identifier, dimension.bucket, dialect)
      : identifier;
    return { expression, key: `dimension_${String(index)}`, label: field.displayName, field };
  });
  const where: string[] = [];

  if (measure.metric) {
    for (const fixedFilter of measure.metric.fixedFilters) {
      const field = requireField(fieldsById, fixedFilter.fieldId);
      where.push(`${quoteIdentifier(field.columnName)} = ?`);
      parameters.push(fixedFilter.value);
    }
  }
  if (plan.timeRange) {
    const field = requireField(fieldsById, plan.timeRange.fieldId);
    const identifier = quoteIdentifier(field.columnName);
    where.push(`${identifier} >= ? AND ${identifier} < ?`);
    parameters.push(plan.timeRange.startInclusive, plan.timeRange.endExclusive);
  }
  for (const filter of plan.filters) {
    const field = requireField(fieldsById, filter.fieldId);
    where.push(compileFilter(filter, field.columnName, parameters));
  }

  const selection = [
    ...dimensionExpressions.map(
      ({ expression, key }) => `${expression} AS ${quoteIdentifier(key)}`,
    ),
    `${measure.expression} AS ${quoteIdentifier('metric_0')}`,
  ];
  const groups = dimensionExpressions.map(({ expression }) => expression);
  const order = plan.sort.map((item) => {
    const key =
      item.target.kind === 'measure' ? 'metric_0' : dimensionExpressions[item.target.index]?.key;
    if (!key) throw new AppError('查询计划中的排序目标无效', 422, 'PLAN_INVALID');
    return `${quoteIdentifier(key)} ${item.direction === 'desc' ? 'DESC' : 'ASC'}`;
  });
  const clauses = [
    `SELECT${dialect === 'mysql' ? ' /*+ MAX_EXECUTION_TIME(5000) */' : ''} ${selection.join(', ')}`,
    `FROM ${quoteIdentifier(resource.tableName)}`,
    where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    groups.length > 0 ? `GROUP BY ${groups.join(', ')}` : '',
    order.length > 0 ? `ORDER BY ${order.join(', ')}` : '',
    'LIMIT ?',
  ].filter(Boolean);
  parameters.push(Math.min(plan.limit, 200));

  return {
    sql: clauses.join(' '),
    parameters,
    columns: [
      ...dimensionExpressions.map(({ key, label, field }) => ({
        key,
        label,
        dataType: resultDataType(field),
        unit: field.unit,
      })),
      {
        key: 'metric_0',
        label: measure.label,
        dataType: measure.aggregation === 'count' ? 'number' : resultDataType(measure.field),
        unit: measure.field.unit,
      },
    ],
    fixedFilters: measure.metric
      ? measure.metric.fixedFilters.map((filter) => ({
          label: requireField(fieldsById, filter.fieldId).displayName,
          description: `等于${filter.value}`,
        }))
      : [],
  };
}

function compileDateBucket(identifier: string, bucket: 'day' | 'month', dialect: SqlDialect) {
  const format = bucket === 'month' ? '%Y-%m' : '%Y-%m-%d';
  return dialect === 'mysql'
    ? `DATE_FORMAT(${identifier}, '${format}')`
    : `strftime('${format}', ${identifier})`;
}

function resolveMeasure(
  plan: QueryPlan,
  fieldsById: Map<string, PlanningField>,
  metricsById: Map<string, PlanningMetric>,
) {
  if (plan.measure.kind === 'named') {
    const metric = metricsById.get(plan.measure.metricId);
    if (!metric) throw new AppError('查询计划引用了不存在的命名指标', 422, 'PLAN_INVALID');
    const field = requireField(fieldsById, metric.fieldId);
    return {
      field,
      metric,
      aggregation: metric.aggregation,
      label: metric.displayName,
      expression: `${metric.aggregation.toUpperCase()}(${quoteIdentifier(field.columnName)})`,
    };
  }

  const field = requireField(fieldsById, plan.measure.fieldId);
  return {
    field,
    metric: null,
    aggregation: plan.measure.aggregation,
    label: `${aggregationLabel(plan.measure.aggregation)}${field.displayName}`,
    expression: `${plan.measure.aggregation.toUpperCase()}(${quoteIdentifier(field.columnName)})`,
  };
}

function compileFilter(
  filter: QueryPlan['filters'][number],
  columnName: string,
  parameters: Array<string | number | boolean>,
) {
  const column = quoteIdentifier(columnName);
  if (filter.operator === 'is_null') return `${column} IS NULL`;
  if (filter.operator === 'is_not_null') return `${column} IS NOT NULL`;
  if (filter.operator === 'in') {
    const values = filter.values ?? [];
    parameters.push(...values);
    return `${column} IN (${values.map(() => '?').join(', ')})`;
  }
  if (filter.operator === 'between') {
    if (filter.values?.length !== 2) {
      throw new AppError('查询计划中的范围筛选不完整', 422, 'PLAN_INVALID');
    }
    const [start, end] = filter.values;
    parameters.push(start, end);
    return `${column} BETWEEN ? AND ?`;
  }
  if (filter.value === undefined) {
    throw new AppError('查询计划中的筛选值缺失', 422, 'PLAN_INVALID');
  }
  if (filter.operator === 'contains') {
    const value = String(filter.value)
      .replaceAll('!', '!!')
      .replaceAll('%', '!%')
      .replaceAll('_', '!_');
    parameters.push(`%${value}%`);
    return `${column} LIKE ? ESCAPE '!'`;
  }

  const operator = {
    eq: '=',
    ne: '<>',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  }[filter.operator];
  if (!operator) throw new AppError('查询计划包含不支持的筛选操作', 422, 'PLAN_INVALID');
  parameters.push(filter.value);
  return `${column} ${operator} ?`;
}

function requireField(fieldsById: Map<string, PlanningField>, id: string): PlanningField {
  const field = fieldsById.get(id);
  if (!field) throw new AppError('查询计划引用了不存在的字段', 422, 'PLAN_INVALID');
  return field;
}

function quoteIdentifier(identifier: string) {
  return '`' + identifier.replaceAll('`', '``') + '`';
}

function resultDataType(field: PlanningField): CompiledQuery['columns'][number]['dataType'] {
  const type = field.mysqlType.toLowerCase();
  if (/^(decimal|numeric)/.test(type)) return 'decimal';
  if (/^(tinyint|smallint|mediumint|int|integer|bigint|float|double|real)/.test(type)) {
    return 'number';
  }
  if (/^(date|datetime|timestamp|time)/.test(type)) return 'date';
  if (/^(bool|boolean)/.test(type)) return 'boolean';
  if (/^(char|varchar|text|enum|set)/.test(type)) return 'string';
  return 'unknown';
}

function aggregationLabel(aggregation: string) {
  const labels: Record<string, string> = {
    sum: '合计',
    avg: '平均',
    min: '最小',
    max: '最大',
    count: '数量：',
  };
  return labels[aggregation] ?? '';
}
