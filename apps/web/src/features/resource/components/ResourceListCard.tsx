import { Card, Empty, List, Spin, Tag, Typography } from 'antd';
import type { ResourceSummary } from '../resourceApi';

type Props = {
  items: ResourceSummary[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
};

export function ResourceListCard({ items, selectedId, loading, onSelect }: Props) {
  return (
    <Card className="resource-list-card" title={`资源列表（${String(items.length)}）`}>
      <Spin spinning={loading}>
        {items.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有问数资源" />
        ) : (
          <List
            dataSource={items}
            renderItem={(resource) => (
              <List.Item
                key={resource.id}
                className={
                  resource.id === selectedId ? 'resource-list-item selected' : 'resource-list-item'
                }
                onClick={() => {
                  onSelect(resource.id);
                }}
              >
                <div className="resource-list-item-content">
                  <Typography.Text strong ellipsis>
                    {resource.displayName}
                  </Typography.Text>
                  <Typography.Text type="secondary" ellipsis>
                    {resource.dataSourceName} · {resource.tableName}
                  </Typography.Text>
                  <Tag
                    color={
                      resource.status === 'active'
                        ? 'green'
                        : resource.status === 'needs_review'
                          ? 'orange'
                          : 'default'
                    }
                  >
                    {resource.status === 'active'
                      ? '已发布'
                      : resource.status === 'needs_review'
                        ? '待复核'
                        : '草稿'}
                  </Tag>
                </div>
              </List.Item>
            )}
          />
        )}
      </Spin>
    </Card>
  );
}
