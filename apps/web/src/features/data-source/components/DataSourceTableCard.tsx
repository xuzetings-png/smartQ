import { Button, Card, Table, Typography } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import type { DataTable } from '../dataSourceApi';
import type { DataSourceOperation } from '../useDataSourceManager';
import { StepTitle } from './StepTitle';

const { Text } = Typography;

type Props = {
  hasDataSource: boolean;
  tables: DataTable[];
  selectedTable: string | null;
  busyOperation: DataSourceOperation;
  onSelect: (tableName: string) => void;
  onRefresh: () => void;
};

export function DataSourceTableCard({
  hasDataSource,
  tables,
  selectedTable,
  busyOperation,
  onSelect,
  onRefresh,
}: Props) {
  return (
    <Card
      className="tables-card"
      title={<StepTitle step={2}>选择数据表</StepTitle>}
      extra={
        hasDataSource && (
          <Button type="text" loading={busyOperation === 'schema'} onClick={onRefresh}>
            刷新
          </Button>
        )
      }
    >
      {!hasDataSource ? (
        <div className="empty-state">
          <DatabaseOutlined />
          <span>先完成数据库连接</span>
          <span className="empty-state-help">连接成功并保存后，这里会显示可用的数据表</span>
        </div>
      ) : (
        <Table<DataTable>
          rowKey="name"
          size="middle"
          dataSource={tables}
          loading={busyOperation === 'schema'}
          pagination={false}
          onRow={(record) => ({
            onClick: () => {
              onSelect(record.name);
            },
            className: selectedTable === record.name ? 'selected-row' : '',
          })}
          columns={[
            {
              title: '表名',
              dataIndex: 'name',
              render: (name: string, record) => (
                <div className="table-name">
                  <DatabaseOutlined />
                  <span>
                    <Text strong>{name}</Text>
                    <Text type="secondary">{record.comment || '暂无说明'}</Text>
                  </span>
                </div>
              ),
            },
            { title: '字段数', dataIndex: 'columnCount', width: 80 },
          ]}
          locale={{ emptyText: '当前数据库没有可用的数据表' }}
        />
      )}
      {hasDataSource && <div className="table-hint">选择一张表查看字段和样例行</div>}
    </Card>
  );
}
