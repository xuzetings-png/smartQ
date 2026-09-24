import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mysql = vi.hoisted(() => ({
  getMysqlTableColumns: vi.fn(),
  listMysqlTables: vi.fn(),
  previewMysqlTable: vi.fn(),
  testMysqlConnection: vi.fn(),
}));

vi.mock('../apps/api/src/infrastructure/mysql/mysqlAdapter.js', () => mysql);

let appServer;
let baseUrl;
let database;
let saveDataSource;
let temporaryDirectory;
let currentColumns;

const orderColumns = [
  {
    COLUMN_NAME: 'order_no',
    COLUMN_TYPE: 'varchar(32)',
    IS_NULLABLE: 'NO',
    ORDINAL_POSITION: 1,
    COLUMN_COMMENT: '订单号',
  },
  {
    COLUMN_NAME: 'city',
    COLUMN_TYPE: 'varchar(40)',
    IS_NULLABLE: 'NO',
    ORDINAL_POSITION: 2,
    COLUMN_COMMENT: '所在城市',
  },
  {
    COLUMN_NAME: 'amount',
    COLUMN_TYPE: 'decimal(12,2)',
    IS_NULLABLE: 'NO',
    ORDINAL_POSITION: 3,
    COLUMN_COMMENT: '订单金额',
  },
  {
    COLUMN_NAME: 'status',
    COLUMN_TYPE: "enum('paid','cancelled','refunded')",
    IS_NULLABLE: 'NO',
    ORDINAL_POSITION: 4,
    COLUMN_COMMENT: '订单状态',
  },
];

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'smartq-resource-api-'));
  process.env.SMARTQ_SQLITE_PATH = join(temporaryDirectory, 'smartq.sqlite');
  process.env.SMARTQ_ENCRYPTION_KEY = 'a'.repeat(64);

  const [{ createApp }, sqlite, dataSources] = await Promise.all([
    import('../apps/api/src/http/createApp.ts'),
    import('../apps/api/src/infrastructure/sqlite/database.ts'),
    import('../apps/api/src/infrastructure/sqlite/dataSourceRepository.ts'),
  ]);
  database = sqlite.db;
  saveDataSource = dataSources.saveDataSource;
  mysql.getMysqlTableColumns.mockImplementation(async () => currentColumns);
  appServer = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => appServer.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${appServer.address().port}`;
});

afterAll(async () => {
  if (appServer)
    await new Promise((resolve, reject) =>
      appServer.close((error) => (error ? reject(error) : resolve())),
    );
  database?.close();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  delete process.env.SMARTQ_SQLITE_PATH;
  delete process.env.SMARTQ_ENCRYPTION_KEY;
});

describe('问数资源公开 API', () => {
  it('管理员可以读取空资源列表', async () => {
    const response = await fetch(`${baseUrl}/api/resources`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
  });

  it('管理员可以读取资源详情和字段语义，且响应不包含数据库密码', async () => {
    const resource = await createDraft();
    const response = await fetch(`${baseUrl}/api/resources/${resource.id}`);
    const detail = await response.json();

    expect(response.status).toBe(200);
    expect(detail).toMatchObject({
      id: resource.id,
      displayName: '订单数据',
      tableName: 'orders_detail',
      status: 'draft',
      recommendedQuestions: [],
    });
    expect(detail.fields).toHaveLength(orderColumns.length);
    expect(detail.fields[0]).toMatchObject({
      columnName: 'order_no',
      displayName: '订单号',
      semanticRole: 'dimension',
      enabled: true,
    });
    expect(detail.fields.find((field) => field.columnName === 'amount')).toMatchObject({
      semanticRole: 'metric',
      enabled: true,
    });
    expect(JSON.stringify(detail)).not.toContain('fixture-database-password');
    expect(JSON.stringify(detail)).not.toContain('password_ciphertext');
  });

  it('管理员可以保存字段语义和推荐问题', async () => {
    const resource = await createDraft('orders_config');
    const detailResponse = await fetch(`${baseUrl}/api/resources/${resource.id}`);
    const detail = await detailResponse.json();
    const response = await fetch(`${baseUrl}/api/resources/${resource.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidConfiguration(detail)),
    });
    const saved = await response.json();

    expect(response.status).toBe(200);
    expect(saved.status).toBe('draft');
    expect(saved.displayName).toBe('订单数据');
    expect(saved.fields.find((field) => field.columnName === 'amount')).toMatchObject({
      displayName: '销售额',
      semanticRole: 'metric',
      enabled: true,
      unit: '元',
      defaultAggregation: 'sum',
      synonyms: ['销售额', '销售金额'],
    });
    expect(saved.recommendedQuestions).toEqual(['按城市统计销售额', '最近 30 天订单数']);
    expect(saved.metrics).toHaveLength(1);
    expect(saved.metrics[0]).toMatchObject({
      displayName: '销售额',
      aggregation: 'sum',
      synonyms: ['销售额', '销售金额'],
      fixedFilters: [{ operator: 'eq', value: 'paid' }],
    });

    const updateResponse = await fetch(`${baseUrl}/api/resources/${resource.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidConfiguration(saved)),
    });
    const updated = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated.metrics[0].id).toBe(saved.metrics[0].id);
  });

  it('拒绝固定过滤值不在数据库枚举范围内的配置', async () => {
    const resource = await createDraft('orders_invalid_metric');
    const detail = await (await fetch(`${baseUrl}/api/resources/${resource.id}`)).json();
    const input = buildValidConfiguration(detail);
    input.metrics[0].fixedFilters[0].value = 'chargeback';

    const response = await fetch(`${baseUrl}/api/resources/${resource.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await response.json();

    expect(response.status).toBe(422);
    expect(result.error.code).toBe('RESOURCE_CONFIGURATION_INVALID');
    expect(JSON.stringify(result)).toContain('status');
  });

  it('有效的命名指标可以发布为可问资源', async () => {
    const resource = await createConfiguredResource('orders_publish');
    const response = await fetch(`${baseUrl}/api/resources/${resource.id}/publish`, {
      method: 'POST',
    });
    const published = await response.json();

    expect(response.status).toBe(200);
    expect(published.status).toBe('active');
    expect(published.metrics[0].fixedFilters[0]).toMatchObject({
      fieldId: published.fields.find((field) => field.columnName === 'status').id,
      operator: 'eq',
      value: 'paid',
    });
  });

  it('没有配置命名指标时也可以发布可问资源', async () => {
    const resource = await createDraft('orders_empty_metrics');
    const detail = await (await fetch(`${baseUrl}/api/resources/${resource.id}`)).json();
    const input = buildValidConfiguration(detail);
    input.metrics = [];
    await fetch(`${baseUrl}/api/resources/${resource.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const response = await fetch(`${baseUrl}/api/resources/${resource.id}/publish`, {
      method: 'POST',
    });
    const saved = await (await fetch(`${baseUrl}/api/resources/${resource.id}`)).json();

    expect(response.status).toBe(200);
    expect(saved.status).toBe('active');
    expect(saved.metrics).toHaveLength(0);
    expect(saved.fields.some((field) => field.enabled)).toBe(true);
  });

  it('刷新未变化的结构时保留资源状态', async () => {
    const resource = await createConfiguredResource('orders_schema_same');
    const response = await fetch(`${baseUrl}/api/resources/${resource.id}/schema/refresh`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ changed: false, status: 'draft' });
  });

  it('结构变化进入待复核并在接受后合并新字段', async () => {
    const resource = await createConfiguredResource('orders_schema_changed');
    currentColumns = [
      orderColumns[0],
      orderColumns[1],
      { ...orderColumns[2], COLUMN_TYPE: 'varchar(32)' },
      orderColumns[3],
      {
        COLUMN_NAME: 'channel',
        COLUMN_TYPE: "enum('web','store')",
        IS_NULLABLE: 'YES',
        ORDINAL_POSITION: 5,
        COLUMN_COMMENT: '下单渠道',
      },
    ];

    const refreshResponse = await fetch(`${baseUrl}/api/resources/${resource.id}/schema/refresh`, {
      method: 'POST',
    });
    const refresh = await refreshResponse.json();
    expect(refreshResponse.status).toBe(200);
    expect(refresh).toMatchObject({
      changed: true,
      status: 'needs_review',
      changes: {
        added: [{ columnName: 'channel' }],
        changed: [{ columnName: 'amount' }],
      },
    });

    const blockedPublish = await fetch(`${baseUrl}/api/resources/${resource.id}/publish`, {
      method: 'POST',
    });
    expect(blockedPublish.status).toBe(409);
    expect((await blockedPublish.json()).error.code).toBe('RESOURCE_SCHEMA_REVIEW_REQUIRED');
    const reviewDetail = await (await fetch(`${baseUrl}/api/resources/${resource.id}`)).json();
    const blockedSave = await fetch(`${baseUrl}/api/resources/${resource.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidConfiguration(reviewDetail)),
    });
    expect(blockedSave.status).toBe(409);

    const acceptResponse = await fetch(`${baseUrl}/api/resources/${resource.id}/schema/accept`, {
      method: 'POST',
    });
    const accepted = await acceptResponse.json();
    expect(acceptResponse.status).toBe(200);
    expect(accepted.status).toBe('draft');
    expect(accepted.schemaReview).toBeNull();
    expect(accepted.fields.find((field) => field.columnName === 'amount')).toMatchObject({
      enabled: false,
      defaultAggregation: null,
    });
    expect(accepted.fields.find((field) => field.columnName === 'channel')).toMatchObject({
      displayName: '下单渠道',
      enabled: false,
    });
    expect(accepted.fields.find((field) => field.columnName === 'city').enabled).toBe(true);
  });
});

async function createDraft(tableName = 'orders_detail') {
  currentColumns = orderColumns;
  const dataSource = saveDataSource({
    name: '测试数据源',
    host: '127.0.0.1',
    port: 3307,
    database: 'smartq_test',
    username: 'smartq_reader',
    password: 'fixture-database-password',
  });
  const response = await fetch(`${baseUrl}/api/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataSourceId: dataSource.id,
      tableName,
      displayName: '订单数据',
    }),
  });

  expect(response.status).toBe(201);
  return response.json();
}

function buildValidConfiguration(detail) {
  const statusField = detail.fields.find((field) => field.columnName === 'status');
  return {
    displayName: '订单数据',
    fields: detail.fields.map((field) => {
      const isAmount = field.columnName === 'amount';
      const isCity = field.columnName === 'city';
      const isStatus = field.columnName === 'status';
      return {
        id: field.id,
        displayName: isAmount ? '销售额' : field.displayName,
        description: isAmount ? '按已支付订单金额汇总' : field.description,
        semanticRole: isAmount ? 'metric' : 'dimension',
        enabled: isAmount || isCity || isStatus,
        unit: isAmount ? '元' : null,
        defaultAggregation: isAmount ? 'sum' : null,
        synonyms: isAmount ? ['销售额', '销售金额'] : [],
      };
    }),
    metrics: [
      {
        ...(detail.metrics[0]?.id ? { id: detail.metrics[0].id } : {}),
        displayName: '销售额',
        description: '已支付订单的销售金额',
        fieldId: detail.fields.find((field) => field.columnName === 'amount').id,
        aggregation: 'sum',
        synonyms: ['销售额', '销售金额'],
        fixedFilters: [{ fieldId: statusField.id, operator: 'eq', value: 'paid' }],
      },
    ],
    recommendedQuestions: ['按城市统计销售额', '最近 30 天订单数'],
  };
}

async function createConfiguredResource(tableName) {
  const resource = await createDraft(tableName);
  const detail = await (await fetch(`${baseUrl}/api/resources/${resource.id}`)).json();
  const response = await fetch(`${baseUrl}/api/resources/${resource.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildValidConfiguration(detail)),
  });
  expect(response.status).toBe(200);
  return resource;
}
