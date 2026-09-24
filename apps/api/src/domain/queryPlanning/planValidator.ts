import type { PlanValidationError, QueryPlan, ResourceConfigurationInput } from '@smartq/contracts';
import {
  isAggregationCompatible,
  isNumericMysqlType,
} from '../resources/resourceConfigurationRules.js';

export type PlanningField = {
  id: string;
  columnName: string;
  mysqlType: string;
  displayName: string;
  description: string;
  semanticRole: string;
  enabled: boolean;
  unit: string | null;
  synonyms: string[];
};

export type PlanningMetric = ResourceConfigurationInput['metrics'][number] & { id: string };

export type PlanningResource = {
  fields: PlanningField[];
  metrics: PlanningMetric[];
};

declare const validatedPlanBrand: unique symbol;
export type ValidatedQueryPlan = QueryPlan & { readonly [validatedPlanBrand]: true };

export function validateQueryPlan(
  plan: QueryPlan,
  resource: PlanningResource,
  question: string,
): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  const fieldsById = new Map(resource.fields.map((field) => [field.id, field]));
  const metricsById = new Map(resource.metrics.map((metric) => [metric.id, metric]));

  validateMeasure(plan, resource, question, fieldsById, metricsById, errors);
  validateDimensions(plan, fieldsById, errors);
  validateTimeRange(plan, fieldsById, errors);
  validateFilters(plan, resource, fieldsById, metricsById, errors);
  validateSort(plan, errors);
  return errors;
}

export function validateAndBrandQueryPlan(
  plan: QueryPlan,
  resource: PlanningResource,
  question: string,
): { plan: ValidatedQueryPlan | null; errors: PlanValidationError[] } {
  const errors = validateQueryPlan(plan, resource, question);
  return { plan: errors.length === 0 ? (plan as ValidatedQueryPlan) : null, errors };
}

function validateMeasure(
  plan: QueryPlan,
  resource: PlanningResource,
  question: string,
  fieldsById: Map<string, PlanningField>,
  metricsById: Map<string, PlanningMetric>,
  errors: PlanValidationError[],
) {
  const normalizedQuestion = question.toLocaleLowerCase();
  const mentionedMetrics = resource.metrics.filter((metric) => {
    const terms = [metric.displayName, ...metric.synonyms].filter(Boolean);
    return terms.some((term) => normalizedQuestion.includes(term.toLocaleLowerCase()));
  });
  if (mentionedMetrics.length > 1) {
    errors.push(
      issue('METRIC_AMBIGUOUS', 'measure', '问题提到了多个命名指标，请改写为一次查询一个指标。'),
    );
  }

  if (plan.measure.kind === 'named') {
    const metric = metricsById.get(plan.measure.metricId);
    if (!metric) {
      errors.push(issue('METRIC_NOT_ALLOWED', 'measure.metricId', '命名指标不属于当前资源。'));
      return;
    }
    const field = fieldsById.get(metric.fieldId);
    if (!field?.enabled || field.semanticRole !== 'metric') {
      errors.push(issue('FIELD_NOT_ALLOWED', 'measure.metricId', '命名指标使用的字段当前不可问。'));
    }
    if (field && !isAggregationCompatible(field.mysqlType, metric.aggregation)) {
      errors.push(
        issue(
          'AGGREGATION_NOT_ALLOWED',
          'measure.metricId',
          '命名指标的聚合方式与字段类型不兼容。',
        ),
      );
    }
    if (mentionedMetrics.length === 1 && mentionedMetrics[0]?.id !== metric.id) {
      errors.push(
        issue(
          'METRIC_MISMATCH',
          'measure.metricId',
          '计划使用的命名指标与问题中提到的指标不一致。',
        ),
      );
    }
    return;
  }

  const field = fieldsById.get(plan.measure.fieldId);
  if (!field?.enabled || field.semanticRole !== 'metric') {
    errors.push(
      issue('FIELD_NOT_ALLOWED', 'measure.fieldId', '字段聚合只能使用已启用的指标字段。'),
    );
  } else if (!isAggregationCompatible(field.mysqlType, plan.measure.aggregation)) {
    errors.push(
      issue('AGGREGATION_NOT_ALLOWED', 'measure.aggregation', '聚合方式与指标字段类型不兼容。'),
    );
  }

  if (mentionedMetrics.length === 1) {
    errors.push(
      issue(
        'NAMED_METRIC_REQUIRED',
        'measure',
        `问题提到了命名指标“${mentionedMetrics[0]?.displayName ?? ''}”，必须使用该指标的固定口径；如需其他口径，请改问底层字段。`,
      ),
    );
  }
}

function validateDimensions(
  plan: QueryPlan,
  fieldsById: Map<string, PlanningField>,
  errors: PlanValidationError[],
) {
  const seen = new Set<string>();
  plan.dimensions.forEach((dimension, index) => {
    const path = `dimensions.${String(index)}`;
    const field = fieldsById.get(dimension.fieldId);
    if (!field?.enabled || field.semanticRole !== 'dimension') {
      errors.push(issue('FIELD_NOT_ALLOWED', `${path}.fieldId`, '分组只能使用已启用的维度字段。'));
      return;
    }
    if (seen.has(dimension.fieldId)) {
      errors.push(issue('DUPLICATE_DIMENSION', `${path}.fieldId`, '同一维度不能重复分组。'));
    }
    seen.add(dimension.fieldId);
    if (dimension.bucket && !isDateMysqlType(field.mysqlType)) {
      errors.push(
        issue('DATE_BUCKET_NOT_ALLOWED', `${path}.bucket`, '日期分组只能用于日期或时间字段。'),
      );
    }
  });
}

function validateTimeRange(
  plan: QueryPlan,
  fieldsById: Map<string, PlanningField>,
  errors: PlanValidationError[],
) {
  if (!plan.timeRange) return;
  const field = fieldsById.get(plan.timeRange.fieldId);
  if (!field?.enabled || !isDateMysqlType(field.mysqlType)) {
    errors.push(
      issue(
        'TIME_FIELD_NOT_ALLOWED',
        'timeRange.fieldId',
        '时间范围只能使用已启用的日期或时间字段。',
      ),
    );
    return;
  }
  const start = parseDate(plan.timeRange.startInclusive);
  const end = parseDate(plan.timeRange.endExclusive);
  if (!start || !end || start >= end) {
    errors.push(
      issue('TIME_RANGE_INVALID', 'timeRange', '时间范围格式无效，且起始时间必须早于结束时间。'),
    );
  }
  if (
    !isDateValueForType(plan.timeRange.startInclusive, field.mysqlType) ||
    !isDateValueForType(plan.timeRange.endExclusive, field.mysqlType)
  ) {
    errors.push(issue('TIME_RANGE_TYPE_MISMATCH', 'timeRange', '时间范围格式与字段类型不匹配。'));
  }
}

function validateFilters(
  plan: QueryPlan,
  resource: PlanningResource,
  fieldsById: Map<string, PlanningField>,
  metricsById: Map<string, PlanningMetric>,
  errors: PlanValidationError[],
) {
  plan.filters.forEach((filter, index) => {
    const path = `filters.${String(index)}`;
    const field = fieldsById.get(filter.fieldId);
    if (!field?.enabled || field.semanticRole === 'hidden') {
      errors.push(
        issue('FIELD_NOT_ALLOWED', `${path}.fieldId`, '筛选条件使用了当前不可问的字段。'),
      );
      return;
    }
    if (!isFilterOperatorAllowed(field.mysqlType, filter.operator)) {
      errors.push(
        issue('FILTER_OPERATOR_NOT_ALLOWED', `${path}.operator`, '筛选操作符与字段类型不兼容。'),
      );
      return;
    }
    const values = filter.value === undefined ? (filter.values ?? []) : [filter.value];
    if (!values.every((value) => isFilterValueForType(value, field.mysqlType))) {
      errors.push(issue('FILTER_TYPE_MISMATCH', `${path}.value`, '筛选值与字段类型不匹配。'));
    }
    if (
      filter.operator === 'between' &&
      values.length === 2 &&
      compareValues(values[0], values[1]) > 0
    ) {
      errors.push(
        issue('FILTER_RANGE_INVALID', `${path}.values`, '筛选范围的起始值不能大于结束值。'),
      );
    }

    if (field.mysqlType.toLowerCase().startsWith('enum(')) {
      const enumValues = parseMysqlEnumValues(field.mysqlType);
      if (values.some((value) => typeof value !== 'string' || !enumValues.includes(value))) {
        errors.push(
          issue('FILTER_VALUE_NOT_ALLOWED', `${path}.value`, '筛选值不在该字段允许的枚举范围内。'),
        );
      }
    }
  });

  if (plan.measure.kind !== 'named') return;
  const metric = metricsById.get(plan.measure.metricId);
  if (!metric) return;
  metric.fixedFilters.forEach((fixedFilter, fixedIndex) => {
    const fixedField = fieldsById.get(fixedFilter.fieldId);
    if (!fixedField || !isFilterValueForType(fixedFilter.value, fixedField.mysqlType)) {
      errors.push(
        issue(
          'METRIC_RULE_INVALID',
          `measure.metricId.fixedFilters.${String(fixedIndex)}`,
          '命名指标的固定筛选字段或固定值不符合当前资源结构。',
        ),
      );
    }
    const userFilters = plan.filters.filter((filter) => filter.fieldId === fixedFilter.fieldId);
    userFilters.forEach((userFilter) => {
      const matches =
        userFilter.operator === 'eq' &&
        userFilter.value !== undefined &&
        String(userFilter.value) === fixedFilter.value;
      if (matches) return;
      errors.push(
        issue(
          'METRIC_RULE_CONFLICT',
          `filters.${String(plan.filters.indexOf(userFilter))}`,
          `该筛选会覆盖命名指标“${metric.displayName}”的固定口径，固定条件不允许被问题覆盖。`,
        ),
      );
    });
  });
}

function validateSort(plan: QueryPlan, errors: PlanValidationError[]) {
  plan.sort.forEach((sort, index) => {
    const exists =
      sort.target.kind === 'measure'
        ? sort.target.index === 0
        : sort.target.index < plan.dimensions.length;
    if (!exists) {
      errors.push(
        issue(
          'SORT_TARGET_INVALID',
          `sort.${String(index)}.target`,
          '排序目标不在当前查询计划中。',
        ),
      );
    }
  });
}

function isFilterOperatorAllowed(mysqlType: string, operator: string) {
  if (
    operator === 'is_null' ||
    operator === 'is_not_null' ||
    operator === 'eq' ||
    operator === 'ne' ||
    operator === 'in'
  ) {
    return true;
  }
  if (isNumericMysqlType(mysqlType) || isDateMysqlType(mysqlType)) {
    return ['gt', 'gte', 'lt', 'lte', 'between'].includes(operator);
  }
  return operator === 'contains';
}

function isFilterValueForType(value: string | number | boolean, mysqlType: string) {
  if (isNumericMysqlType(mysqlType)) {
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value === 'string' && /^-?(?:\d+)(?:\.\d+)?$/.test(value);
  }
  if (isDateMysqlType(mysqlType)) {
    return typeof value === 'string' && isDateValueForType(value, mysqlType);
  }
  return typeof value === 'string' && value.length <= 200;
}

function isDateValueForType(value: string, mysqlType: string) {
  if (!parseDate(value)) return false;
  const normalizedType = mysqlType.toLowerCase();
  if (/^date\b/.test(normalizedType)) return /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (/^(datetime|timestamp|time)\b/.test(normalizedType)) {
    return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(
      value,
    );
  }
  return /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(
    value,
  );
}

function isDateMysqlType(mysqlType: string) {
  return /^(date|datetime|timestamp)\b/i.test(mysqlType);
}

function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return date.toISOString().slice(0, 10) === value ? date.getTime() : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}[T ][\d:.+-]+Z?$/.test(value)) return null;
  const timestamp = Date.parse(value.replace(' ', 'T'));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareValues(
  left: string | number | boolean | undefined,
  right: string | number | boolean | undefined,
) {
  if (left === undefined || right === undefined) return 0;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right));
}

function parseMysqlEnumValues(mysqlType: string) {
  const valueSection = /^enum\((.*)\)$/i.exec(mysqlType)?.[1];
  if (!valueSection) return [];
  const values: string[] = [];
  const tokenPattern = /'((?:\\.|''|[^'])*)'/g;
  for (const match of valueSection.matchAll(tokenPattern)) {
    values.push(match[1].replaceAll("''", "'").replaceAll("\\'", "'").replaceAll('\\\\', '\\'));
  }
  return values;
}

function issue(code: string, path: string, message: string): PlanValidationError {
  return { code, path, message };
}
