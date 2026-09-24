import { Alert, Button, List, Space, Tag, Typography } from 'antd';
import type { SchemaChanges } from '../resourceApi';

type Props = {
  changes: SchemaChanges;
  loading: boolean;
  onAccept: () => void;
};

export function SchemaReviewPanel({ changes, loading, onAccept }: Props) {
  const hasChanges = changes.added.length + changes.removed.length + changes.changed.length > 0;
  return (
    <Alert
      type="warning"
      showIcon
      className="schema-review-alert"
      message="数据表结构有变化，资源已暂停发布和问数"
      description={
        <div>
          {hasChanges ? (
            <List
              size="small"
              dataSource={[
                ...changes.added.map((change) => ({ ...change, category: '新增', color: 'green' })),
                ...changes.removed.map((change) => ({ ...change, category: '删除', color: 'red' })),
                ...changes.changed.map((change) => ({
                  ...change,
                  category: '变更',
                  color: 'orange',
                })),
              ]}
              renderItem={(change) => (
                <List.Item>
                  <Space>
                    <Tag color={change.color}>{change.category}</Tag>
                    <Typography.Text code>{change.columnName}</Typography.Text>
                    <Typography.Text type="secondary">
                      {change.previousMysqlType && change.previousMysqlType !== change.mysqlType
                        ? `${change.previousMysqlType} → ${change.mysqlType}`
                        : change.previousOrdinalPosition && change.ordinalPosition
                          ? `第 ${String(change.previousOrdinalPosition)} 列 → 第 ${String(change.ordinalPosition)} 列`
                          : change.mysqlType}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          ) : (
            <Typography.Paragraph>
              待复核结构与当前结构摘要一致，可接受后继续配置。
            </Typography.Paragraph>
          )}
          <Button type="primary" loading={loading} onClick={onAccept}>
            接受新结构并回到草稿
          </Button>
        </div>
      }
    />
  );
}
