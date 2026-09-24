import { describe, expect, it } from 'vitest';
import {
  createResourceInputSchema,
  dataSourceInputSchema,
  dataSourceUpdateSchema,
} from '../../packages/contracts/src/index';

describe('数据源和资源请求结构', () => {
  it('清理连接字段、转换端口，并应用默认数据源名称', () => {
    const result = dataSourceInputSchema.parse({
      host: ' 127.0.0.1 ',
      port: '3306',
      database: ' smartq_demo ',
      username: ' smartq_reader ',
      password: 'demo-password',
    });

    expect(result).toMatchObject({
      name: '本地演示 MySQL',
      host: '127.0.0.1',
      port: 3306,
      database: 'smartq_demo',
      username: 'smartq_reader',
    });
  });

  it('拒绝超出 TCP 端口范围的值', () => {
    const result = dataSourceInputSchema.safeParse({
      host: '127.0.0.1',
      port: 65536,
      database: 'smartq_demo',
      username: 'smartq_reader',
      password: 'demo-password',
    });

    expect(result.success).toBe(false);
  });

  it('更新数据源时允许沿用已保存的密码', () => {
    const result = dataSourceUpdateSchema.safeParse({
      host: '127.0.0.1',
      port: 3306,
      database: 'smartq_demo',
      username: 'smartq_reader',
    });

    expect(result.success).toBe(true);
  });

  it('拒绝没有有效数据源标识的资源创建请求', () => {
    const result = createResourceInputSchema.safeParse({
      dataSourceId: 'invalid-id',
      tableName: 'orders',
      displayName: '订单',
    });

    expect(result.success).toBe(false);
  });
});
