import { Alert, Button, Card, Form, Input, InputNumber } from 'antd';
import type { FormInstance } from 'antd';
import type { DataSource, DataSourceConnection } from '../dataSourceApi';
import type { DataSourceOperation } from '../useDataSourceManager';
import { StepTitle } from './StepTitle';

type Props = {
  form: FormInstance<DataSourceConnection>;
  dataSource: DataSource | null;
  busyOperation: DataSourceOperation;
  tested: boolean;
  onTest: () => void;
  onSave: () => void;
};

export function DataSourceConnectionCard({
  form,
  dataSource,
  busyOperation,
  tested,
  onTest,
  onSave,
}: Props) {
  return (
    <Card className="connection-card" title={<StepTitle step={1}>数据库连接</StepTitle>}>
      <Form form={form} layout="vertical" initialValues={initialConnection}>
        <Form.Item
          name="name"
          label="连接名称"
          rules={[{ required: true, message: '请输入连接名称' }]}
        >
          <Input placeholder="例如：本地演示 MySQL" />
        </Form.Item>
        <div className="form-row">
          <Form.Item
            name="host"
            label="主机地址"
            rules={[{ required: true, message: '请输入主机地址' }]}
          >
            <Input placeholder="127.0.0.1" />
          </Form.Item>
          <Form.Item name="port" label="端口" rules={[{ required: true, message: '请输入端口' }]}>
            <InputNumber min={1} max={65535} className="full-width" />
          </Form.Item>
        </div>
        <Form.Item
          name="database"
          label="数据库名"
          rules={[{ required: true, message: '请输入数据库名' }]}
        >
          <Input placeholder="smartq_demo" />
        </Form.Item>
        <div className="form-row">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="smartq_reader" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: !dataSource, message: '请输入数据库密码' }]}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={dataSource ? '留空沿用已保存密码' : '请输入数据库密码'}
            />
          </Form.Item>
        </div>
        <Alert
          className="security-note"
          type="info"
          showIcon
          message="凭据在本地加密保存，仅用于读取数据库表结构和样例数据。"
        />
        <div className="form-actions">
          <Button loading={busyOperation === 'test'} onClick={onTest}>
            测试连接
          </Button>
          <Button
            type="primary"
            loading={busyOperation === 'save'}
            disabled={!dataSource && !tested}
            onClick={onSave}
          >
            保存连接
          </Button>
        </div>
      </Form>
    </Card>
  );
}

const initialConnection: DataSourceConnection = {
  name: '本地演示 MySQL',
  host: '127.0.0.1',
  port: 3306,
  database: 'smartq_demo',
  username: 'smartq_reader',
};
