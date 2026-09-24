import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, Form, Input, Row, Select, Space, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { ResourceConfigurationInput } from '@smartq/contracts';
import type { ResourceField } from '../resourceApi';

type Props = {
  form: FormInstance<ResourceConfigurationInput>;
  sourceFields: ResourceField[];
};

export function ResourceMetricsEditor({ form, sourceFields }: Props) {
  const watchedFields = Form.useWatch('fields', form) as
    ResourceConfigurationInput['fields'] | undefined;
  const initialFields = form.getFieldValue('fields') as
    ResourceConfigurationInput['fields'] | undefined;
  const configuredFields = watchedFields ?? initialFields ?? [];
  const metricFields = sourceFields.filter((sourceField, index) => {
    const configured = configuredFields.at(index);
    return (
      configured?.enabled &&
      configured.semanticRole === 'metric' &&
      isNumericType(sourceField.mysqlType)
    );
  });
  const dimensionFields = sourceFields.filter((_, index) => {
    const configured = configuredFields.at(index);
    return configured?.enabled && configured.semanticRole === 'dimension';
  });

  return (
    <Form.List name="metrics">
      {(metrics, { add, remove }) => (
        <div className="resource-metric-list">
          {metrics.map((metric) => (
            <Card
              key={metric.key}
              size="small"
              className="resource-metric-card"
              title={<Typography.Text strong>指标规则 {metric.name + 1}</Typography.Text>}
              extra={
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    remove(metric.name);
                  }}
                >
                  删除
                </Button>
              }
            >
              <Form.Item name={[metric.name, 'id']} hidden>
                <Input />
              </Form.Item>
              <Row gutter={[12, 0]}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="指标名称"
                    name={[metric.name, 'displayName']}
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="例如：销售额" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="汇总字段"
                    name={[metric.name, 'fieldId']}
                    rules={[{ required: true, message: '请选择数值字段' }]}
                  >
                    <Select
                      placeholder="选择已启用的数值指标字段"
                      options={metricFields.map((field) => ({
                        value: field.id,
                        label: `${field.displayName}（${field.columnName}）`,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="聚合方式"
                    name={[metric.name, 'aggregation']}
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[
                        { value: 'sum', label: '求和 SUM' },
                        { value: 'avg', label: '平均 AVG' },
                        { value: 'min', label: '最小 MIN' },
                        { value: 'max', label: '最大 MAX' },
                        { value: 'count', label: '计数 COUNT' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="同义词" name={[metric.name, 'synonyms']}>
                    <Select
                      mode="tags"
                      tokenSeparators={[',', '，']}
                      placeholder="例如：销售金额"
                    />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="业务口径说明" name={[metric.name, 'description']}>
                    <Input placeholder="例如：只统计已支付订单的金额" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Typography.Text strong>固定过滤条件</Typography.Text>
                  <Typography.Paragraph type="secondary" className="metric-filter-hint">
                    固定条件属于指标定义，问数时不会被用户问题覆盖。
                  </Typography.Paragraph>
                  <Form.List name={[metric.name, 'fixedFilters']}>
                    {(filters, filterActions) => (
                      <Space direction="vertical" className="full-width" size="small">
                        {filters.map((filter) => (
                          <Row
                            key={filter.key}
                            gutter={8}
                            align="middle"
                            className="metric-filter-row"
                          >
                            <Form.Item name={[filter.name, 'operator']} hidden>
                              <Input />
                            </Form.Item>
                            <Col xs={24} sm={9}>
                              <Form.Item
                                name={[filter.name, 'fieldId']}
                                rules={[{ required: true, message: '请选择过滤字段' }]}
                              >
                                <Select
                                  placeholder="维度字段"
                                  options={dimensionFields.map((field) => ({
                                    value: field.id,
                                    label: `${field.displayName}（${field.columnName}）`,
                                  }))}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                              <FilterValueInput
                                form={form}
                                metricIndex={metric.name}
                                filterIndex={filter.name}
                                sourceFields={sourceFields}
                              />
                            </Col>
                            <Col xs={24} sm={3}>
                              <Button
                                danger
                                type="text"
                                aria-label="删除固定过滤条件"
                                icon={<DeleteOutlined />}
                                onClick={() => {
                                  filterActions.remove(filter.name);
                                }}
                              />
                            </Col>
                          </Row>
                        ))}
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          onClick={() => {
                            filterActions.add({ operator: 'eq', value: '' });
                          }}
                        >
                          添加固定条件
                        </Button>
                      </Space>
                    )}
                  </Form.List>
                </Col>
              </Row>
            </Card>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            disabled={metricFields.length === 0}
            onClick={() => {
              add({ description: '', aggregation: 'sum', synonyms: [], fixedFilters: [] });
            }}
          >
            添加命名指标
          </Button>
          {metricFields.length === 0 && (
            <Typography.Text type="secondary">请先在上方启用至少一个数值指标字段。</Typography.Text>
          )}
        </div>
      )}
    </Form.List>
  );
}

function FilterValueInput({
  form,
  metricIndex,
  filterIndex,
  sourceFields,
}: {
  form: FormInstance<ResourceConfigurationInput>;
  metricIndex: number;
  filterIndex: number;
  sourceFields: ResourceField[];
}) {
  const filterFieldId = Form.useWatch<string>(
    ['metrics', metricIndex, 'fixedFilters', filterIndex, 'fieldId'],
    form,
  );
  const sourceField = sourceFields.find((field) => field.id === filterFieldId);
  const enumValues = sourceField ? parseMysqlEnum(sourceField.mysqlType) : [];
  return (
    <Form.Item
      name={[filterIndex, 'value']}
      rules={[{ required: true, message: '请填写固定过滤值' }]}
    >
      {enumValues.length > 0 ? (
        <Select
          placeholder="选择固定值"
          options={enumValues.map((value) => ({ value, label: value }))}
        />
      ) : (
        <Input placeholder="等于" />
      )}
    </Form.Item>
  );
}

function isNumericType(mysqlType: string) {
  return /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real)(\b|\()/i.test(
    mysqlType,
  );
}

function parseMysqlEnum(mysqlType: string) {
  const valueSection = /^enum\((.*)\)$/i.exec(mysqlType)?.[1];
  if (!valueSection) return [];
  return Array.from(valueSection.matchAll(/'((?:\\.|''|[^'])*)'/g), (match) =>
    match[1].replaceAll("''", "'").replaceAll("\\'", "'").replaceAll('\\\\', '\\'),
  );
}
