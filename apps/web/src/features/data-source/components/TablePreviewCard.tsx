import { Button, Card, Space, Table, Tag, Typography } from 'antd';
import { EyeOutlined, PlusOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import type { TablePreview } from '../dataSourceApi';
import { StepTitle } from './StepTitle';

const { Text } = Typography;

type Props = {
  preview: TablePreview;
  loading: boolean;
  onViewFullData: () => void;
  onCreateResource: () => void;
};

export function TablePreviewCard({ preview, loading, onViewFullData, onCreateResource }: Props) {
  const columns: TableColumnsType<Record<string, unknown>> = preview.columns.map((column) => ({
    title: (
      <span>
        {column.name}
        <Text type="secondary" className="column-type">
          {column.mysqlType}
        </Text>
      </span>
    ),
    dataIndex: column.name,
    key: column.name,
    ellipsis: true,
    render: (value: unknown) =>
      value === null || value === undefined ? <Text type="secondary">空</Text> : formatCell(value),
  }));

  return (
    <Card
      className="preview-card"
      title={
        <>
          <StepTitle step={3}>样例数据预览</StepTitle>
          <Tag>{preview.tableName}</Tag>
        </>
      }
      extra={<Text type="secondary">最多展示 {preview.limit} 行</Text>}
    >
      <Table<Record<string, unknown>>
        size="small"
        rowKey={(_record, index) => String(index ?? 0)}
        columns={columns}
        dataSource={preview.rows}
        scroll={{ x: 'max-content' }}
        pagination={false}
        loading={loading}
        locale={{ emptyText: '这张表还没有数据' }}
      />
      <div className="preview-footer">
        <Space wrap>
          <Text type="secondary">字段结构 {preview.columns.length} 列</Text>
          <Button icon={<EyeOutlined />} onClick={onViewFullData}>
            查看完整数据
          </Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreateResource}>
          创建问数资源
        </Button>
      </div>
    </Card>
  );
}

function formatCell(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}
