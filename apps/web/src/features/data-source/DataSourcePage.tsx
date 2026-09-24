import { useEffect, useState } from 'react';
import { Alert, Form, Tag, Typography, message } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import type { DataSourceConnection } from './dataSourceApi';
import { DataSourceConnectionCard } from './components/DataSourceConnectionCard';
import { DataSourceTableCard } from './components/DataSourceTableCard';
import { TablePreviewCard } from './components/TablePreviewCard';
import { CreateResourceDialog, type CreateResourceForm } from './components/CreateResourceDialog';
import { useDataSourceManager } from './useDataSourceManager';

const { Paragraph, Title } = Typography;

type Props = {
  onResourceCreated: (resourceName: string, resourceId: string) => void;
};

export function DataSourcePage({ onResourceCreated }: Props) {
  const [connectionForm] = Form.useForm<DataSourceConnection>();
  const [resourceForm] = Form.useForm<CreateResourceForm>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [messageApi, messageContext] = message.useMessage();
  const manager = useDataSourceManager();

  useEffect(() => {
    if (!manager.dataSource) return;
    connectionForm.setFieldsValue({
      name: manager.dataSource.name,
      host: manager.dataSource.host,
      port: manager.dataSource.port,
      database: manager.dataSource.database,
      username: manager.dataSource.username,
      password: undefined,
    });
  }, [connectionForm, manager.dataSource]);

  const handleTest = async () => {
    try {
      const connection = await getConnectionFormValues(connectionForm, manager.dataSource !== null);
      const result = await manager.testConnection(connection);
      messageApi.success(result);
    } catch (error) {
      messageApi.error(getErrorMessage(error, '连接测试失败'));
    }
  };

  const handleSave = async () => {
    try {
      const connection = await getConnectionFormValues(connectionForm, manager.dataSource !== null);
      await manager.saveConnection(connection);
      connectionForm.setFieldValue('password', undefined);
      messageApi.success('数据源已保存');
    } catch (error) {
      messageApi.error(getErrorMessage(error, '保存数据源失败'));
    }
  };

  const handleSelectTable = async (tableName: string) => {
    try {
      await manager.selectTable(tableName);
    } catch (error) {
      messageApi.error(getErrorMessage(error, '读取样例数据失败'));
    }
  };

  const handleCreateResource = async ({ displayName }: CreateResourceForm) => {
    try {
      const resource = await manager.createResource(displayName);
      if (!resource) return;
      setDialogOpen(false);
      messageApi.success('问数资源草稿已创建');
      onResourceCreated(resource.displayName, resource.id);
    } catch (error) {
      messageApi.error(getErrorMessage(error, '创建问数资源失败'));
    }
  };

  const openCreateDialog = () => {
    if (!manager.preview) return;
    resourceForm.setFieldsValue({
      displayName: manager.preview.tableName === 'orders' ? '订单数据' : manager.preview.tableName,
    });
    setDialogOpen(true);
  };

  return (
    <>
      {messageContext}
      <div className="page-heading">
        <div>
          <Title level={2}>数据源管理</Title>
          <Paragraph>连接业务数据库，浏览表结构，并将数据表创建为问数资源。</Paragraph>
        </div>
        <Tag color={manager.dataSource ? 'green' : 'default'}>
          {manager.dataSource ? '已连接' : '未配置'}
        </Tag>
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

      <div className="source-grid">
        <DataSourceConnectionCard
          form={connectionForm}
          dataSource={manager.dataSource}
          busyOperation={manager.busyOperation}
          tested={manager.tested}
          onTest={() => {
            void handleTest();
          }}
          onSave={() => {
            void handleSave();
          }}
        />
        <DataSourceTableCard
          hasDataSource={manager.dataSource !== null}
          tables={manager.tables}
          selectedTable={manager.selectedTable}
          busyOperation={manager.busyOperation}
          onSelect={(tableName) => {
            void handleSelectTable(tableName);
          }}
          onRefresh={manager.refreshTables}
        />
      </div>

      {manager.preview && (
        <TablePreviewCard
          preview={manager.preview}
          loading={manager.busyOperation === 'preview'}
          onCreateResource={openCreateDialog}
        />
      )}

      <div className="page-footnote">
        <SafetyCertificateOutlined /> 数据库采用只读账号连接。每次预览最多读取 20 行。
      </div>

      <CreateResourceDialog
        open={dialogOpen}
        tableName={manager.selectedTable ?? ''}
        form={resourceForm}
        onCancel={() => {
          setDialogOpen(false);
        }}
        onCreate={(values) => {
          void handleCreateResource(values);
        }}
      />
    </>
  );
}

async function getConnectionFormValues(
  form: ReturnType<typeof Form.useForm<DataSourceConnection>>[0],
  hasSavedConnection: boolean,
) {
  const values = await form.validateFields();
  const password = values.password?.trim();
  if (!hasSavedConnection && !password) throw new Error('请输入数据库密码');
  if (password) return { ...values, password };

  const { password: _password, ...connectionWithoutPassword } = values;
  return connectionWithoutPassword;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
