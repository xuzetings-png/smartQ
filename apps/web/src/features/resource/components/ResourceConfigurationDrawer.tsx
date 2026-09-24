import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Collapse,
  Drawer,
  Empty,
  Form,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { ReloadOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import type { ResourceConfigurationInput } from '@smartq/contracts';
import type { ResourceDetail, SchemaRefreshResult } from '../resourceApi';
import type { ResourceOperation } from '../useResourceManager';
import { ResourceFieldsEditor } from './ResourceFieldsEditor';
import { ResourceMetricsEditor } from './ResourceMetricsEditor';
import { RecommendedQuestionsEditor } from './RecommendedQuestionsEditor';
import { SchemaReviewPanel } from './SchemaReviewPanel';
import { PlanPreviewPanel } from './PlanPreviewPanel';

const { Paragraph, Title, Text } = Typography;

type Props = {
  open: boolean;
  resource: ResourceDetail | null;
  busyOperation: ResourceOperation;
  onClose: () => void;
  onSave: (configuration: ResourceConfigurationInput) => Promise<ResourceDetail | null>;
  onPublish: () => Promise<ResourceDetail | null>;
  onRefreshSchema: () => Promise<SchemaRefreshResult | null>;
  onAcceptSchema: () => Promise<ResourceDetail | null>;
  messageApi: MessageInstance;
};

export function ResourceConfigurationDrawer({
  open,
  resource,
  busyOperation,
  onClose,
  onSave,
  onPublish,
  onRefreshSchema,
  onAcceptSchema,
  messageApi,
}: Props) {
  return (
    <Drawer
      className="resource-config-drawer"
      title={resource ? `配置问数资源：${resource.displayName}` : '配置问数资源'}
      placement="right"
      width="min(1200px, 94vw)"
      open={open}
      onClose={onClose}
      destroyOnHidden
      styles={{ body: { padding: 0, overflow: 'hidden' } }}
    >
      {resource ? (
        <ResourceEditor
          key={resource.id}
          resource={resource}
          busyOperation={busyOperation}
          onSave={onSave}
          onPublish={onPublish}
          onRefreshSchema={onRefreshSchema}
          onAcceptSchema={onAcceptSchema}
          messageApi={messageApi}
        />
      ) : busyOperation === 'load' ? (
        <div className="resource-drawer-loading">
          <Spin size="large" />
        </div>
      ) : (
        <div className="resource-drawer-loading">
          <Empty description="暂时无法读取资源配置" />
        </div>
      )}
    </Drawer>
  );
}

type EditorProps = Omit<Props, 'open' | 'onClose' | 'resource'> & { resource: ResourceDetail };

function ResourceEditor({
  resource,
  busyOperation,
  onSave,
  onPublish,
  onRefreshSchema,
  onAcceptSchema,
  messageApi,
}: EditorProps) {
  const [form] = Form.useForm<ResourceConfigurationInput>();
  const [configurationRevision, setConfigurationRevision] = useState(0);
  const busy = busyOperation !== null;
  const needsReview = resource.status === 'needs_review';

  useEffect(() => {
    form.setFieldsValue(toConfiguration(resource));
  }, [form, resource]);

  const handleSave = async () => {
    try {
      const values = await getCompleteConfiguration(form);
      await onSave(values);
      messageApi.success('资源配置已保存为草稿');
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    }
  };

  const handlePublish = async () => {
    try {
      const values = await getCompleteConfiguration(form);
      const hasQueryableField = values.fields.some(
        (field) => field.enabled && field.semanticRole !== 'hidden',
      );
      if (!hasQueryableField) {
        messageApi.warning(
          '至少开启一个指标或维度字段后才能发布；也可以点击“全部开启”使用默认范围。',
        );
        return;
      }
      await onSave(values);
      await onPublish();
      messageApi.success('问数资源已发布');
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    }
  };

  const handleRefreshSchema = async () => {
    try {
      const result = await onRefreshSchema();
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
      await onAcceptSchema();
      messageApi.success('新结构已接受，请检查新增或变更字段后保存并重新发布');
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    }
  };

  return (
    <div className="resource-drawer-editor">
      <div className="resource-editor-heading">
        <div>
          <Space align="center">
            <Title level={3}>{resource.displayName}</Title>
            <ResourceStatusTag status={resource.status} />
          </Space>
          <Paragraph type="secondary">
            来源表：{resource.tableName} · {resource.dataSourceName} · {resource.fields.length}{' '}
            个字段
          </Paragraph>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            loading={busyOperation === 'refresh'}
            disabled={needsReview || busy}
            onClick={() => void handleRefreshSchema()}
          >
            刷新表结构
          </Button>
          <Button
            icon={<SaveOutlined />}
            loading={busyOperation === 'save'}
            disabled={needsReview || busy}
            onClick={() => void handleSave()}
          >
            保存草稿
          </Button>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={busyOperation === 'publish'}
            disabled={needsReview || busy}
            onClick={() => void handlePublish()}
          >
            一键发布
          </Button>
        </Space>
      </div>

      <div className="resource-drawer-scroll">
        {resource.status === 'needs_review' && resource.schemaReview && (
          <SchemaReviewPanel
            changes={resource.schemaReview.changes}
            loading={busyOperation === 'accept'}
            onAccept={() => void handleAcceptSchema()}
          />
        )}

        <Form<ResourceConfigurationInput>
          form={form}
          layout="vertical"
          disabled={needsReview}
          className="resource-configuration-form"
          initialValues={toConfiguration(resource)}
          onValuesChange={() => {
            setConfigurationRevision((current) => current + 1);
          }}
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
              sourceFields={resource.fields}
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
                      extra={<Text type="secondary">固定条件由管理员维护，用户问题不能覆盖</Text>}
                    >
                      <ResourceMetricsEditor form={form} sourceFields={resource.fields} />
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

        <PlanPreviewPanel
          resourceId={resource.id}
          disabled={needsReview || busy}
          configurationRevision={configurationRevision}
          getConfiguration={() => getCompleteConfiguration(form)}
        />
      </div>
    </div>
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

async function getCompleteConfiguration(
  form: FormInstance<ResourceConfigurationInput>,
): Promise<ResourceConfigurationInput> {
  await form.validateFields();
  const values = form.getFieldsValue(true) as Partial<ResourceConfigurationInput>;
  return {
    displayName: values.displayName ?? '',
    fields: values.fields ?? [],
    metrics: values.metrics ?? [],
    recommendedQuestions: values.recommendedQuestions ?? [],
  };
}
