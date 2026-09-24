import type { ResourceConfigurationInput } from '@smartq/contracts';

export type ResourceFieldSnapshot = {
  id: string;
  columnName: string;
  mysqlType: string;
  nullable: boolean;
  ordinalPosition: number;
  displayName: string;
  semanticRole: string;
  enabled: boolean;
  defaultAggregation: string | null;
  synonyms: string[];
};

type ConfigurationIssue = { field?: string; message: string };

export function validateResourceConfiguration(
  configuration: ResourceConfigurationInput,
  currentFields: ResourceFieldSnapshot[],
  existingMetricIds: string[],
  requireQueryableField: boolean,
) {
  const issues: ConfigurationIssue[] = [];
  const currentById = new Map(currentFields.map((field) => [field.id, field]));
  const submittedIds = configuration.fields.map((field) => field.id);
  const submittedIdSet = new Set(submittedIds);

  if (
    submittedIds.length !== currentFields.length ||
    submittedIdSet.size !== currentFields.length ||
    currentFields.some((field) => !submittedIdSet.has(field.id))
  ) {
    issues.push({ field: 'fields', message: '字段配置与当前数据表结构不一致，请刷新页面后重试' });
  }

  for (const field of configuration.fields) {
    const current = currentById.get(field.id);
    if (!current) {
      issues.push({ field: `fields.${field.id}`, message: '字段不属于当前资源' });
      continue;
    }
    if (
      field.defaultAggregation &&
      !isAggregationCompatible(current.mysqlType, field.defaultAggregation)
    ) {
      issues.push({
        field: `fields.${field.id}.defaultAggregation`,
        message: '默认聚合方式与字段类型不兼容',
      });
    }
    if (field.enabled && field.semanticRole === 'hidden') {
      issues.push({
        field: `fields.${field.id}.semanticRole`,
        message: '允许问数的字段必须设置为指标或维度',
      });
    }
    ensureUniqueStrings(field.synonyms, `fields.${field.id}.synonyms`, issues);
  }

  if (
    requireQueryableField &&
    !configuration.fields.some((field) => field.enabled && field.semanticRole !== 'hidden')
  ) {
    issues.push({ field: 'fields', message: '至少需要一个允许问数的指标或维度字段才能发布' });
  }

  const metricAliases = new Set<string>();
  const submittedMetricIds = new Set<string>();
  configuration.metrics.forEach((metric, metricIndex) => {
    const metricPath = `metrics.${String(metricIndex)}`;
    if (metric.id) {
      if (!existingMetricIds.includes(metric.id)) {
        issues.push({ field: `${metricPath}.id`, message: '指标不属于当前资源' });
      }
      if (submittedMetricIds.has(metric.id)) {
        issues.push({ field: `${metricPath}.id`, message: '同一指标不能重复提交' });
      }
      submittedMetricIds.add(metric.id);
    }

    const measure = currentById.get(metric.fieldId);
    if (!measure) {
      issues.push({ field: `${metricPath}.fieldId`, message: '指标字段不属于当前资源' });
    } else {
      const configuredMeasure = configuration.fields.find((field) => field.id === metric.fieldId);
      if (!configuredMeasure?.enabled || configuredMeasure.semanticRole !== 'metric') {
        issues.push({ field: `${metricPath}.fieldId`, message: '指标字段必须是已启用的数值指标' });
      }
      if (!isNumericMysqlType(measure.mysqlType)) {
        issues.push({ field: `${metricPath}.fieldId`, message: '命名指标只能使用数值字段' });
      }
      if (!isAggregationCompatible(measure.mysqlType, metric.aggregation)) {
        issues.push({
          field: `${metricPath}.aggregation`,
          message: '聚合方式与指标字段类型不兼容',
        });
      }
    }

    const aliases = [metric.displayName, ...metric.synonyms];
    const metricAliasesForThisMetric = new Set<string>();
    for (const alias of aliases) {
      const normalized = normalizeAlias(alias);
      if (metricAliases.has(normalized) && !metricAliasesForThisMetric.has(normalized)) {
        issues.push({ field: `${metricPath}.synonyms`, message: `指标名称或同义词重复：${alias}` });
      }
      metricAliasesForThisMetric.add(normalized);
    }
    for (const alias of metricAliasesForThisMetric) metricAliases.add(alias);
    ensureUniqueStrings(metric.synonyms, `${metricPath}.synonyms`, issues);

    const filterFields = new Set<string>();
    metric.fixedFilters.forEach((filter, filterIndex) => {
      const filterPath = `${metricPath}.fixedFilters.${String(filterIndex)}`;
      const sourceField = currentById.get(filter.fieldId);
      const configuredSource = configuration.fields.find((field) => field.id === filter.fieldId);
      if (!sourceField) {
        issues.push({ field: `${filterPath}.fieldId`, message: '固定过滤字段不属于当前资源' });
      } else if (!configuredSource?.enabled || configuredSource.semanticRole !== 'dimension') {
        issues.push({
          field: `${filterPath}.fieldId`,
          message: '固定过滤只能使用已启用的维度字段',
        });
      }
      if (filterFields.has(filter.fieldId)) {
        issues.push({ field: filterPath, message: '同一指标不能重复配置相同过滤字段' });
      }
      filterFields.add(filter.fieldId);

      if (sourceField && /^enum\(/i.test(sourceField.mysqlType)) {
        const values = parseMysqlEnumValues(sourceField.mysqlType);
        if (!values.includes(filter.value)) {
          issues.push({
            field: `${filterPath}.value`,
            message: `字段 ${sourceField.columnName} 的固定过滤值不在数据库枚举值范围内`,
          });
        }
      }
    });
  });

  ensureUniqueStrings(configuration.recommendedQuestions, 'recommendedQuestions', issues);
  return issues;
}

function ensureUniqueStrings(values: string[], path: string, issues: ConfigurationIssue[]) {
  const normalized = values.map(normalizeAlias);
  if (new Set(normalized).size !== normalized.length) {
    issues.push({ field: path, message: '内容不能重复' });
  }
}

function normalizeAlias(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function isNumericMysqlType(mysqlType: string) {
  return /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real)(\b|\()/i.test(
    mysqlType,
  );
}

export function isAggregationCompatible(mysqlType: string, aggregation: string) {
  return aggregation === 'count' || isNumericMysqlType(mysqlType);
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
