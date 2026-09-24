import { useEffect, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Empty, Pagination, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { dataSourceApi } from '../dataSourceApi';
import type { TableDataPage } from '../dataSourceApi';

const { Text } = Typography;

type Props = {
  dataSourceId: string;
  tableName: string;
  onClose: () => void;
};

type LoadState = {
  requestKey: string;
  data: TableDataPage | null;
  error: string | null;
};

const initialState: LoadState = { requestKey: '', data: null, error: null };

export function TableDataBrowser({ dataSourceId, tableName, onClose }: Props) {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState(initialState);
  const requestKey = `${dataSourceId}:${tableName}:${String(page)}:${String(reloadKey)}`;

  useEffect(() => {
    let isCurrent = true;
    void dataSourceApi
      .getTableDataPage(dataSourceId, tableName, page)
      .then((data) => {
        if (isCurrent) setState({ requestKey, data, error: null });
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState({
            requestKey,
            data: null,
            error: error instanceof Error ? error.message : '读取数据失败，请重试',
          });
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [dataSourceId, page, reloadKey, requestKey, tableName]);

  const isLoading = state.requestKey !== requestKey;
  const data = isLoading ? null : state.data;
  const error = isLoading ? null : state.error;
  const columns: TableColumnsType<Record<string, unknown>> = (data?.columns ?? []).map(
    (column) => ({
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
        value === null || value === undefined ? (
          <Text type="secondary">空</Text>
        ) : (
          formatCell(value)
        ),
    }),
  );

  return (
    <Drawer
      title={`完整数据浏览 · ${tableName}`}
      placement="right"
      width="min(1200px, 92vw)"
      open
      onClose={onClose}
      className="table-data-browser"
      styles={{
        body: {
          display: 'flex',
          minHeight: 0,
          flexDirection: 'column',
          gap: 12,
          overflow: 'hidden',
        },
      }}
    >
      <div className="table-data-browser-heading">
        <Text type="secondary">
          {data
            ? `共 ${String(data.totalRows)} 行 · 第 ${String(data.page)} / ${String(data.totalPages || 1)} 页 · 每页最多 20 行`
            : '每页最多读取 20 行'}
        </Text>
        <Button
          icon={<ReloadOutlined />}
          disabled={isLoading}
          onClick={() => {
            setReloadKey((current) => current + 1);
          }}
        >
          刷新
        </Button>
      </div>
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button
              size="small"
              onClick={() => {
                setReloadKey((current) => current + 1);
              }}
            >
              重试
            </Button>
          }
        />
      ) : null}
      <Table<Record<string, unknown>>
        className="table-data-browser-table"
        size="small"
        rowKey={(_record, index) => `${String(data?.page ?? page)}-${String(index ?? 0)}`}
        columns={columns}
        dataSource={data?.rows ?? []}
        scroll={{ x: 'max-content', y: 'calc(100vh - 260px)' }}
        pagination={false}
        loading={isLoading}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这张表还没有数据" />,
        }}
      />
      {data && data.totalRows > 0 ? (
        <Pagination
          className="table-data-browser-pagination"
          current={data.page}
          pageSize={data.pageSize}
          total={data.totalRows}
          showSizeChanger={false}
          showTotal={(total, range) =>
            `第 ${String(range[0])}–${String(range[1])} 行，共 ${String(total)} 行`
          }
          onChange={(nextPage) => {
            setPage(nextPage);
          }}
        />
      ) : null}
    </Drawer>
  );
}

function formatCell(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return '';
}
