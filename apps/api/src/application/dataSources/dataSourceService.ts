import type { DataSourceInput, DataSourceSummary, DataSourceUpdate } from '@smartq/contracts';
import { AppError } from '../AppError.js';
import {
  findDataSourceById,
  listDataSources,
  saveDataSource,
} from '../../infrastructure/sqlite/dataSourceRepository.js';
import {
  listMysqlTables,
  previewMysqlTable,
  readMysqlTablePage,
  testMysqlConnection,
} from '../../infrastructure/mysql/mysqlAdapter.js';

export async function testNewDataSource(input: DataSourceInput) {
  try {
    return await testMysqlConnection(input);
  } catch {
    throw dataSourceUnavailable('连接失败，请检查地址、端口、数据库名和账号密码');
  }
}

export async function createDataSource(input: DataSourceInput): Promise<DataSourceSummary> {
  await testNewDataSource(input);
  try {
    return saveDataSource(input);
  } catch (error) {
    if (error instanceof Error && error.message.includes('SMARTQ_ENCRYPTION_KEY')) {
      throw new AppError(error.message, 500, 'ENCRYPTION_NOT_CONFIGURED');
    }
    throw error;
  }
}

export async function testSavedDataSource(id: string, input: DataSourceUpdate) {
  const saved = requireDataSource(id);
  try {
    return await testMysqlConnection({
      ...saved,
      ...input,
      password: input.password ?? saved.password,
    });
  } catch {
    throw dataSourceUnavailable('连接测试失败，请检查数据库连接信息');
  }
}

export async function updateDataSource(
  id: string,
  input: DataSourceUpdate,
): Promise<DataSourceSummary> {
  const saved = requireDataSource(id);
  const updated = { ...saved, ...input, password: input.password ?? saved.password };
  try {
    await testMysqlConnection(updated);
    return saveDataSource(updated);
  } catch {
    throw dataSourceUnavailable('连接验证失败，未覆盖原配置');
  }
}

export function getDataSources() {
  return listDataSources();
}

export async function getDataSourceSchema(id: string) {
  const source = requireDataSource(id);
  try {
    return await listMysqlTables(source);
  } catch {
    throw dataSourceUnavailable('读取数据表失败，请确认数据库正在运行');
  }
}

export async function getTablePreview(id: string, tableName: string, limit: number) {
  const source = requireDataSource(id);
  try {
    const schema = await listMysqlTables(source);
    if (!schema.tables.some((table) => table.name === tableName)) {
      throw new AppError('数据表不存在或不可访问', 404, 'TABLE_NOT_FOUND');
    }
    return await previewMysqlTable(source, tableName, limit);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw dataSourceUnavailable('读取样例数据失败，请确认数据库正在运行');
  }
}

export async function getTableDataPage(
  id: string,
  tableName: string,
  page: number,
  pageSize: number,
) {
  const source = requireDataSource(id);
  try {
    const schema = await listMysqlTables(source);
    if (!schema.tables.some((table) => table.name === tableName)) {
      throw new AppError('数据表不存在或不可访问', 404, 'TABLE_NOT_FOUND');
    }
    return await readMysqlTablePage(source, tableName, page, pageSize);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw dataSourceUnavailable('读取完整数据失败，请检查数据库状态后重试');
  }
}

export function requireDataSource(id: string) {
  const source = findDataSourceById(id);
  if (!source) throw new AppError('未找到数据源', 404, 'DATA_SOURCE_NOT_FOUND');
  return source;
}

function dataSourceUnavailable(message: string) {
  return new AppError(message, 503, 'DATA_SOURCE_UNAVAILABLE');
}
