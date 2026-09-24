import { useEffect } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Form,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { ReloadOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import type { ResourceConfigurationInput } from '@smartq/contracts';
import type { ResourceDetail } from './resourceApi';
import { ResourceFieldsEditor } from './components/ResourceFieldsEditor';
import { ResourceListCard } from './components/ResourceListCard';
import { ResourceMetricsEditor } from './components/ResourceMetricsEditor';
import { RecommendedQuestionsEditor } from './components/RecommendedQuestionsEditor';
import { SchemaReviewPanel } from './components/SchemaReviewPanel';
import { useResourceManager } from './useResourceManager';

const { Paragraph, Title, Text } = Typography;

type Props = {
  initialResourceId?: string;
  onGoToDataSources: () => void;
};

export function ResourcePage({ initialResourceId, onGoToDataSources }: Props) {
  const [form] = Form.useForm<ResourceConfigurationInput>();
  const [messageApi, messageContext] = message.useMessage();
  const manager = useResourceManager(initialResourceId);
  const busy = manager.busyOperation !== null;
  const needsReview = manager.detail?.status === 'needs_review';

  useEffect(() => {
    if (manager.detail) form.setFieldsValue(toConfiguration(manager.detail));
  }, [form, manager.detail]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await manager.save(values);
      messageApi.success('资源配置已保存为草稿');
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    }
  };

  const handlePublish = async () => {
    try {
      const values = await form.validateFields();
      const hasQueryableField = values.fields.some(
        (field) => field.enabled && field.semanticRole !== 'hidden',
      );
      if (!hasQueryableField) {
        messageApi.warning(
          '至少开启一个指标或维度字段后才能发布；也可以点击“全部开启”使用默认范围。',
        );
        return;
      }
      await manager.save(values);
      await manager.publish();
      messageApi.success('问数资源已发布');
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    }
  };

  const handleRefreshSchema = async () => {
    try {
      const result = await manager.refreshSchema();
      if (!result) return;
      messageApi[result.changed ? 'warning' : 'success'](
        result.changed ? '发现结构变化，资源已暂停并等待复核' : '数据表结构没有变化',
      );
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    }
  };

  const handleAcceptSchema = async () => {
    try {
      await manager.acceptSchema();
      messageApi.success('新结构已接受，请检查新增或变更字段后保存并重新发布');
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    }
  };

  return (
    <>
      {messageContext}
      <div className="page-heading">
        <div>
          <Title level={2}>问数资源</Title>
          <Paragraph>
            字段按数据类型自动分类，敏感字段默认关闭。可直接发布，业务口径和推荐问题可按需补充。
          </Paragraph>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={manager.busyOperation === 'load'}
          onClick={() => void manager.reload()}
        >
          刷新列表
        </Button>
      </div>

      {manager.errorMessage && (
        <Alert
          className="page-error"
          type="error"
          showIcon
          closable
          message={manager.errorMessage}
          onClose={manager.dismissError}
        />
      )}

      <div className="resource-workspace">
        <ResourceListCard
          items={manager.items}
          selectedId={manager.selectedResourceId}
          loading={manager.busyOperation === 'load'}
          onSelect={manager.selectResource}
        />
        <Spin spinning={manager.busyOperation === 'load'}>
          {manager.detail ? (
            <div className="resource-editor">
              <div className="resource-editor-heading">
                <div>
                  <Space align="center">
                    <Title level={3}>{manager.detail.displayName}</Title>
                    <ResourceStatusTag status={manager.detail.status} />
                  </Space>
                  <Paragraph type="secondary">
                    来源表：{manager.detail.tableName} · {manager.detail.dataSourceName} ·{' '}
                    {manager.detail.fields.length} 个字段
                  </Paragraph>
                </div>
                <Space wrap>
                  <Button
                    icon={<ReloadOutlined />}
                    loading={manager.busyOperation === 'refresh'}
                    disabled={needsReview || busy}
                    onClick={() => void handleRefreshSchema()}
                  >
                    刷新表结构
                  </Button>
                  <Button
                    icon={<SaveOutlined />}
                    loading={manager.busyOperation === 'save'}
                    disabled={needsReview || busy}
                    onClick={() => void handleSave()}
                  >
                    保存草稿
                  </Button>
                  <Button
                    type="primary"
                    icon={<UploadOutlined />}
                    loading={manager.busyOperation === 'publish'}
                    disabled={needsReview || busy}
                    onClick={() => void handlePublish()}
                  >
                    一键发布
                  </Button>
                </Space>
              </div>

              {needsReview && manager.detail.schemaReview && (
                <SchemaReviewPanel
                  changes={manager.detail.schemaReview.changes}
                  loading={manager.busyOperation === 'accept'}
                  onAccept={() => void handleAcceptSchema()}
                />
              )}

              <Form<ResourceConfigurationInput>
                form={form}
                layout="vertical"
                disabled={needsReview}
                className="resource-configuration-form"
                initialValues={toConfiguration(manager.detail)}
              >
                <Card title="基本信息" className="resource-config-card">
                  <Form.Item
                    label="资源名称"
                    name="displayName"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={80} placeholder="例如：订单数据" />
                  </Form.Item>
                </Card>

                <Card
                  title="字段语义与可问范围"
                  className="resource-config-card"
                  extra={<Text type="secondary">可问字段会提供给后续查询规划</Text>}
                >
                  <ResourceFieldsEditor
                    form={form}
                    sourceFields={manager.detail.fields}
                    disabled={needsReview || busy}
                  />
                </Card>

                <Collapse
                  items={[
                    {
                      key: 'optional-settings',
                      label: '高级配置（可选）：业务口径和推荐问题',
                      children: (
                        <>
                          <Card
                            title="命名指标和固定口径"
                            className="resource-config-card"
                            extra={
                              <Text type="secondary">固定条件由管理员维护，用户问题不能覆盖</Text>
                            }
                          >
                            <ResourceMetricsEditor
                              form={form}
                              sourceFields={manager.detail.fields}
                            />
                          </Card>

                          <Card title="推荐问题" className="resource-config-card">
                            <RecommendedQuestionsEditor />
                          </Card>
                        </>
                      ),
                    },
                  ]}
                />
              </Form>
            </div>
          ) : (
            <Card className="resource-empty-card">
              <Empty
                description={
                  manager.items.length === 0 ? '先创建一个问数资源' : '选择左侧资源进行配置'
                }
              >
                {manager.items.length === 0 && (
                  <Button type="primary" onClick={onGoToDataSources}>
                    前往数据源管理
                  </Button>
                )}
              </Empty>
            </Card>
          )}
        </Spin>
      </div>
    </>
  );
}

function ResourceStatusTag({ status }: { status: ResourceDetail['status'] }) {
  const label = status === 'active' ? '已发布' : status === 'needs_review' ? '待复核' : '草稿';
  const color = status === 'active' ? 'green' : status === 'needs_review' ? 'orange' : 'default';
  return <Tag color={color}>{label}</Tag>;
}

function toConfiguration(resource: ResourceDetail): ResourceConfigurationInput {
  return {
    displayName: resource.displayName,
    fields: resource.fields.map((field) => ({
      id: field.id,
      displayName: field.displayName,
      description: field.description,
      semanticRole: field.semanticRole,
      enabled: field.enabled,
      unit: field.unit,
      defaultAggregation: field.defaultAggregation,
      synonyms: [...field.synonyms],
    })),
    metrics: resource.metrics.map((metric) => ({
      id: metric.id,
      displayName: metric.displayName,
      description: metric.description,
      fieldId: metric.fieldId,
      aggregation: metric.aggregation,
      synonyms: [...metric.synonyms],
      fixedFilters: metric.fixedFilters.map((filter) => ({ ...filter })),
    })),
    recommendedQuestions: [...resource.recommendedQuestions],
  };
}
