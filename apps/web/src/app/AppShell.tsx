import { useState } from 'react';
import { Button, Card, Dropdown, Layout, Menu, Typography } from 'antd';
import {
  AppstoreOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  DownOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { DataSourcePage } from '../features/data-source/DataSourcePage';
import { ResourcePage } from '../features/resource/ResourcePage';

const { Header, Sider, Content } = Layout;
const { Paragraph, Title } = Typography;

type PageId = 'ask' | 'data-source' | 'resource' | 'model';
type DemoRole = 'admin' | 'asker';

const pageLabels: Record<PageId, string> = {
  ask: '问数工作台',
  'data-source': '数据源管理',
  resource: '问数资源',
  model: '模型配置',
};

export function AppShell() {
  const [activePage, setActivePage] = useState<PageId>('data-source');
  const [demoRole, setDemoRole] = useState<DemoRole>('admin');
  const [selectedResourceId, setSelectedResourceId] = useState<string>();

  const handleResourceCreated = (_name: string, id: string) => {
    setSelectedResourceId(id);
    setActivePage('resource');
  };

  return (
    <Layout className="app-shell">
      <Sider width={236} theme="light" className="app-sider">
        <div className="brand">
          <div className="brand-icon">Q</div>
          <div>
            <strong>SmartQ</strong>
            <small>自然语言问数</small>
          </div>
        </div>
        <div className="nav-caption">工作空间</div>
        <Menu
          mode="inline"
          selectedKeys={[activePage]}
          onClick={({ key }) => {
            setActivePage(key as PageId);
          }}
          items={[
            { key: 'ask', icon: <BarChartOutlined />, label: pageLabels.ask },
            { key: 'data-source', icon: <DatabaseOutlined />, label: pageLabels['data-source'] },
            { key: 'resource', icon: <AppstoreOutlined />, label: pageLabels.resource },
            { key: 'model', icon: <ApiOutlined />, label: pageLabels.model },
          ]}
        />
        <div className="sider-bottom">本地演示环境</div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="crumb">
            管理后台 <span>/</span> {pageLabels[activePage]}
          </div>
          <Dropdown
            menu={{
              selectedKeys: [demoRole],
              items: [
                { key: 'admin', label: '管理员' },
                { key: 'asker', label: '问数用户' },
              ],
              onClick: ({ key }) => {
                const role = key as DemoRole;
                setDemoRole(role);
                setActivePage(role === 'asker' ? 'ask' : 'data-source');
              },
            }}
          >
            <Button type="text">
              {demoRole === 'admin' ? '管理员' : '问数用户'} <DownOutlined />
            </Button>
          </Dropdown>
        </Header>
        <Content className="page-content">
          {activePage === 'data-source' ? (
            <DataSourcePage onResourceCreated={handleResourceCreated} />
          ) : activePage === 'resource' ? (
            <ResourcePage
              initialResourceId={selectedResourceId}
              onGoToDataSources={() => {
                setActivePage('data-source');
              }}
            />
          ) : (
            <NotImplementedPage page={activePage} />
          )}
        </Content>
      </Layout>
    </Layout>
  );
}

function NotImplementedPage({ page }: { page: PageId }) {
  return (
    <Card className="placeholder-card">
      <Title level={3}>{pageLabels[page]}</Title>
      <Paragraph type="secondary">这个页面将在后续开发阶段接入。</Paragraph>
    </Card>
  );
}
