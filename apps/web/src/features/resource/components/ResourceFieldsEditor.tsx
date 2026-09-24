import { Button, Card, Col, Form, Input, Row, Select, Space, Switch, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { ResourceConfigurationInput } from '@smartq/contracts';
import type { ResourceField } from '../resourceApi';

const aggregationOptions = [
  { value: 'sum', label: '求和 SUM' },
  { value: 'avg', label: '平均 AVG' },
  { value: 'min', label: '最小 MIN' },
  { value: 'max', label: '最大 MAX' },
  { value: 'count', label: '计数 COUNT' },
];

type Props = {
  form: FormInstance<ResourceConfigurationInput>;
  sourceFields: ResourceField[];
  disabled: boolean;
};

export function ResourceFieldsEditor({ form, sourceFields, disabled }: Props) {
  return (
    <Form.List name="fields">
      {(fields) => (
        <>
          <div className="resource-field-toolbar">
            <Typography.Text type="secondary">
              批量开启仅适用于指标和维度，“不参与问数”的字段会保持关闭。
            </Typography.Text>
            <Space size="small">
              <Button
                disabled={disabled || fields.length === 0}
                onClick={() => {
                  setAllFieldsEnabled(form, fields, true);
                }}
              >
                全部开启
              </Button>
              <Button
                disabled={disabled || fields.length === 0}
                onClick={() => {
                  setAllFieldsEnabled(form, fields, false);
                }}
              >
                全部关闭
              </Button>
            </Space>
          </div>
          <div className="resource-field-grid">
            {fields.map((field) => {
              const sourceField = sourceFields[field.name];
              const numericField = isNumericType(sourceField.mysqlType);
              return (
                <Card
                  key={field.key}
                  size="small"
                  className="resource-field-card"
                  title={
                    <div className="resource-field-heading">
                      <Typography.Text strong>{sourceField.columnName}</Typography.Text>
                      <Typography.Text type="secondary">{sourceField.mysqlType}</Typography.Text>
                    </div>
                  }
                >
                  <Form.Item name={[field.name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <Row gutter={[12, 0]}>
                    <Col span={12}>
                      <Form.Item
                        label="业务名称"
                        name={[field.name, 'displayName']}
                        rules={[{ required: true }]}
                      >
                        <Input placeholder="例如：订单金额" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        label="字段角色"
                        name={[field.name, 'semanticRole']}
                        rules={[{ required: true }]}
                      >
                        <Select
                          options={[
                            { value: 'metric', label: '指标' },
                            { value: 'dimension', label: '维度' },
                            { value: 'hidden', label: '不参与问数' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="计量单位" name={[field.name, 'unit']}>
                        <Input placeholder="例如：元，可留空" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="默认聚合" name={[field.name, 'defaultAggregation']}>
                        <Select
                          allowClear
                          placeholder="选择聚合方式"
                          options={aggregationOptions.filter(
                            (option) => numericField || option.value === 'count',
                          )}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item label="字段说明" name={[field.name, 'description']}>
                        <Input placeholder="说明字段的业务含义" />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item label="同义词" name={[field.name, 'synonyms']}>
                        <Select
                          mode="tags"
                          tokenSeparators={[',', '，']}
                          placeholder="输入后按回车添加"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <div className="resource-field-enabled">
                        <Typography.Text>允许问数</Typography.Text>
                        <Form.Item name={[field.name, 'enabled']} valuePropName="checked" noStyle>
                          <Switch />
                        </Form.Item>
                      </div>
                    </Col>
                  </Row>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </Form.List>
  );
}

function setAllFieldsEnabled(
  form: FormInstance<ResourceConfigurationInput>,
  fields: Array<{ name: number }>,
  enabled: boolean,
) {
  fields.forEach(({ name }) => {
    const isAskable =
      form.getFieldValue(['fields', name, 'semanticRole']) === 'metric' ||
      form.getFieldValue(['fields', name, 'semanticRole']) === 'dimension';
    form.setFieldValue(['fields', name, 'enabled'], enabled && isAskable);
  });
}

function isNumericType(mysqlType: string) {
  return /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real)(\b|\()/i.test(
    mysqlType,
  );
}
