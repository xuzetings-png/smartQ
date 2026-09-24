import { useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Input,
  List,
  Space,
  Tag,
  Typography,
} from 'antd';
import type { PlanPreviewResponse, ResourceConfigurationInput } from '@smartq/contracts';
import { resourceApi } from '../resourceApi';

const { Paragraph, Text } = Typography;

type Props = {
  resourceId: string;
  disabled: boolean;
  configurationRevision: number;
  getConfiguration: () => Promise<ResourceConfigurationInput>;
};

export function PlanPreviewPanel({
  resourceId,
  disabled,
  configurationRevision,
  getConfiguration,
}: Props) {
  const [question, setQuestion] = useState('今年各城市销售额怎么样');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<
    | { contextKey: string; kind: 'error'; message: string }
    | { contextKey: string; kind: 'result'; result: PlanPreviewResponse }
    | null
  >(null);
  const contextKey = `${resourceId}:${String(configurationRevision)}:${question}`;
  const currentContextKey = useRef(contextKey);
  useLayoutEffect(() => {
    currentContextKey.current = contextKey;
  }, [contextKey]);
  const currentFeedback = feedback?.contextKey === contextKey ? feedback : null;

  const handlePreview = async () => {
    if (!question.trim()) {
      setFeedback({ contextKey, kind: 'error', message: '请输入要调试的样例问题。' });
      return;
    }
    setLoading(true);
    setFeedback(null);
    const requestContextKey = contextKey;
    try {
      const configuration = await getConfiguration();
      const preview = await resourceApi.previewPlan(resourceId, { question, configuration });
      if (requestContextKey === currentContextKey.current) {
        setFeedback({ contextKey: requestContextKey, kind: 'result', result: preview });
      }
    } catch (error) {
      let message: string;
      if (isFormValidationError(error)) {
        message = '请先修正资源配置中标红的项目，再进行调试。';
      } else {
        message = error instanceof Error ? error.message : '计划预览失败，请稍后重试。';
      }
      if (requestContextKey === currentContextKey.current) {
        setFeedback({ contextKey: requestContextKey, kind: 'error', message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className="resource-config-card plan-preview-card"
      title="样例问题调试"
      extra={<Tag color="blue">只规划，不执行 SQL</Tag>}
    >
      <Paragraph type="secondary">
        使用当前页面尚未保存的字段和指标配置。服务端会检查源表结构、调用模型并校验计划，不读取业务数据行。
      </Paragraph>
      <Input.TextArea
        value={question}
        maxLength={1000}
        autoSize={{ minRows: 2, maxRows: 4 }}
        placeholder="例如：今年各城市销售额怎么样"
        disabled={disabled || loading}
        onChange={(event) => {
          setQuestion(event.target.value);
        }}
        onPressEnter={(event) => {
          if (event.metaKey || event.ctrlKey) void handlePreview();
        }}
      />
      <div className="plan-preview-actions">
        <Text type="secondary">按 ⌘/Ctrl + Enter 可快速调试</Text>
        <Button
          type="primary"
          disabled={disabled}
          loading={loading}
          onClick={() => {
            void handlePreview();
          }}
        >
          调试样例问题
        </Button>
      </div>

      {currentFeedback?.kind === 'error' && (
        <Alert
          className="plan-preview-feedback"
          type="error"
          showIcon
          message={currentFeedback.message}
        />
      )}

      {currentFeedback?.kind === 'result' && <PlanPreviewResult result={currentFeedback.result} />}
    </Card>
  );
}

function PlanPreviewResult({ result }: { result: PlanPreviewResponse }) {
  const plan = result.plan;
  const status = getResultStatus(result);

  return (
    <div className="plan-preview-result">
      <Space className="plan-preview-result-heading" wrap>
        <Tag color={status.color}>{status.label}</Tag>
        {result.kind === 'query' && result.validation.valid && (
          <Text type="secondary">计划可通过当前校验</Text>
        )}
      </Space>

      {result.kind === 'query' && plan?.kind === 'query' && (
        <QueryPlanSummary plan={plan} result={result} />
      )}

      {result.kind === 'clarify' && plan?.kind === 'clarify' && (
        <div className="plan-preview-clarification">
          <Paragraph strong>{plan.question}</Paragraph>
          <Space wrap>
            {plan.options.map((option) => (
              <Tag key={option.id}>{option.label}</Tag>
            ))}
            {plan.allowFreeText && <Tag color="blue">支持补充说明</Tag>}
          </Space>
        </div>
      )}

      {result.kind === 'reject' && plan?.kind === 'reject' && (
        <Alert type="warning" showIcon message={plan.message} />
      )}

      {result.validation.errors.length > 0 && (
        <Alert
          className="plan-preview-feedback"
          type="error"
          showIcon
          message="计划未通过校验"
          description={
            <List
              size="small"
              dataSource={result.validation.errors}
              renderItem={(item) => (
                <List.Item>
                  <Text>
                    <Text code>{item.code}</Text> {item.message}
                  </Text>
                </List.Item>
              )}
            />
          }
        />
      )}

      {plan && (
        <Collapse
          className="plan-preview-json"
          items={[
            {
              key: 'json',
              label: '查看结构化计划 JSON',
              children: <pre>{JSON.stringify(plan, null, 2)}</pre>,
            },
          ]}
        />
      )}
    </div>
  );
}

function QueryPlanSummary({
  plan,
  result,
}: {
  plan: Extract<NonNullable<PlanPreviewResponse['plan']>, { kind: 'query' }>;
  result: PlanPreviewResponse;
}) {
  const fields = result.resourceMap.fields;
  const metrics = result.resourceMap.metrics;
  const fieldLabel = (fieldId: string) => {
    const field = fields.find((item) => item.id === fieldId);
    return field ? `${field.displayName}（${field.columnName}）` : '未知字段';
  };
  const namedMetricId = plan.measure.kind === 'named' ? plan.measure.metricId : null;
  const measure = namedMetricId ? metrics.find((item) => item.id === namedMetricId) : undefined;
  const measureLabel =
    plan.measure.kind === 'named'
      ? measure
        ? `${measure.displayName} = ${aggregationLabel(measure.aggregation)}(${measure.fieldName})`
        : '未知命名指标'
      : `${aggregationLabel(plan.measure.aggregation)}(${fieldLabel(plan.measure.fieldId)})`;
  const filters = plan.filters.map((filter) => {
    const values = filter.value !== undefined ? [filter.value] : (filter.values ?? []);
    const valueLabel = values.length > 0 ? ` ${values.map(String).join('、')}` : '';
    return `${fieldLabel(filter.fieldId)} ${operatorLabel(filter.operator)}${valueLabel}`;
  });

  return (
    <Descriptions className="plan-preview-descriptions" size="small" bordered column={2}>
      <Descriptions.Item label="查询指标">{measureLabel}</Descriptions.Item>
      <Descriptions.Item label="结果上限">{plan.limit} 行</Descriptions.Item>
      <Descriptions.Item label="分组维度" span={2}>
        {plan.dimensions.length > 0
          ? plan.dimensions.map((item) => fieldLabel(item.fieldId)).join('、')
          : '无'}
      </Descriptions.Item>
      <Descriptions.Item label="时间范围" span={2}>
        {plan.timeRange
          ? `${fieldLabel(plan.timeRange.fieldId)}：${plan.timeRange.startInclusive} 至（不含）${plan.timeRange.endExclusive}`
          : '无'}
      </Descriptions.Item>
      <Descriptions.Item label="问题筛选" span={2}>
        {filters.length > 0 ? filters.join('；') : '无'}
      </Descriptions.Item>
      {measure && measure.fixedFilters.length > 0 && (
        <Descriptions.Item label="指标固定口径" span={2}>
          {measure.fixedFilters.map((item) => `${item.fieldName} = ${item.value}`).join('；')}
        </Descriptions.Item>
      )}
      <Descriptions.Item label="图表建议">{chartLabel(plan.chartHint)}</Descriptions.Item>
      <Descriptions.Item label="排序">
        {plan.sort.length === 0
          ? '默认'
          : plan.sort
              .map(
                (item) =>
                  `${item.target.kind === 'measure' ? measureLabel : fieldLabel(plan.dimensions[item.target.index]?.fieldId ?? '')} ${item.direction === 'asc' ? '升序' : '降序'}`,
              )
              .join('；')}
      </Descriptions.Item>
    </Descriptions>
  );
}

function getResultStatus(result: PlanPreviewResponse) {
  if (result.kind === 'query') {
    return result.validation.valid
      ? { label: '查询计划通过', color: 'success' }
      : { label: '计划校验未通过', color: 'error' };
  }
  if (result.kind === 'clarify') return { label: '需要澄清', color: 'warning' };
  if (result.kind === 'reject') return { label: '问题不支持或口径冲突', color: 'error' };
  return { label: '模型输出格式无效', color: 'error' };
}

function aggregationLabel(aggregation: string) {
  const labels: Record<string, string> = {
    sum: '求和 SUM',
    avg: '平均 AVG',
    min: '最小 MIN',
    max: '最大 MAX',
    count: '计数 COUNT',
  };
  return labels[aggregation] ?? aggregation;
}

function operatorLabel(operator: string) {
  const labels: Record<string, string> = {
    eq: '=',
    ne: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    between: '介于',
    in: '属于',
    contains: '包含',
    is_null: '为空',
    is_not_null: '不为空',
  };
  return labels[operator] ?? operator;
}

function chartLabel(value: string | undefined) {
  const labels: Record<string, string> = {
    table: '表格',
    metric: '指标卡',
    bar: '柱状图',
    line: '折线图',
  };
  return value ? (labels[value] ?? value) : '自动';
}

function isFormValidationError(error: unknown) {
  return typeof error === 'object' && error !== null && 'errorFields' in error;
}
