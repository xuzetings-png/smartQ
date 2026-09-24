import { useState } from 'react';
import { Alert, Button, Card, Empty, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import type { ResourceSummary } from './resourceApi';
import { ResourceConfigurationDrawer } from './components/ResourceConfigurationDrawer';
import { useResourceManager } from './useResourceManager';

const { Paragraph, Title, Text } = Typography;

type Props = {
  initialResourceId?: string;
  onGoToDataSources: () => void;
};

export function ResourcePage({ initialResourceId, onGoToDataSources }: Props) {
  const [messageApi, messageContext] = message.useMessage();
  const [configurationOpen, setConfigurationOpen] = useState(Boolean(initialResourceId));
  const manager = useResourceManager(initialResourceId);

  const openConfiguration = (resourceId: string) => {
    manager.selectResource(resourceId);
    setConfigurationOpen(true);
  };

  const columns: ColumnsType<ResourceSummary> = [
    {
      title: '资源名称',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 220,
      ellipsis: true,
      render: (displayName: string) => <Text strong>{displayName}</Text>,
    },
    {
      title: '来源表',
      dataIndex: 'tableName',
      key: 'tableName',
      width: 180,
      ellipsis: true,
      render: (tableName: string) => <Text code>{tableName}</Text>,
    },
    {
      title: '数据源',
      dataIndex: 'dataSourceName',
      key: 'dataSourceName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '字段数',
      dataIndex: 'fieldCount',
      key: 'fieldCount',
      width: 100,
      align: 'center',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: ResourceSummary['status']) => <ResourceStatusTag status={status} />,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 190,
      render: (createdAt: string) => formatCreatedAt(createdAt),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 120,
      align: 'center',
      render: (_value, resource) => (
        <Button
          type="link"
          icon={<SettingOutlined />}
          onClick={() => {
            openConfiguration(resource.id);
          }}
        >
          配置
        </Button>
      ),
    },
  ];

  return (
    <>
      {messageContext}
      <div className="resource-management-page">
        <div className="page-heading">
          <div>
            <Title level={2}>问数资源</Title>
            <Paragraph>
              集中查看已创建的问数资源，并在配置抽屉中完成字段设置、调试和发布。
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

        <Card className="resource-table-card" title={`资源列表（${String(manager.items.length)}）`}>
          <Table<ResourceSummary>
            rowKey="id"
            columns={columns}
            dataSource={manager.items}
            loading={manager.busyOperation === 'load'}
            scroll={{ x: 1100, y: 'calc(100dvh - 390px)' }}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (total) => `共 ${String(total)} 个资源`,
            }}
            locale={{
              emptyText: (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有问数资源">
                  <Button type="primary" onClick={onGoToDataSources}>
                    前往数据源管理
                  </Button>
                </Empty>
              ),
            }}
          />
        </Card>
      </div>

      <ResourceConfigurationDrawer
        open={configurationOpen}
        resource={manager.detail}
        busyOperation={manager.busyOperation}
        onClose={() => {
          setConfigurationOpen(false);
        }}
        onSave={manager.save}
        onPublish={manager.publish}
        onRefreshSchema={manager.refreshSchema}
        onAcceptSchema={manager.acceptSchema}
        messageApi={messageApi}
      />
    </>
  );
}

function ResourceStatusTag({ status }: { status: ResourceSummary['status'] }) {
  const labels: Record<ResourceSummary['status'], string> = {
    draft: '草稿',
    active: '已发布',
    needs_review: '待复核',
  };
  const colors: Record<ResourceSummary['status'], string> = {
    draft: 'default',
    active: 'green',
    needs_review: 'orange',
  };

  return <Tag color={colors[status]}>{labels[status]}</Tag>;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
