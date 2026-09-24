import { AppError } from '../AppError.js';
import { createDraftResource } from '../../infrastructure/sqlite/resourceRepository.js';
import { getMysqlTableColumns, type MysqlColumn } from '../../infrastructure/mysql/mysqlAdapter.js';
import { requireDataSource } from '../dataSources/dataSourceService.js';

export async function createResourceDraft(
  dataSourceId: string,
  tableName: string,
  displayName: string,
) {
  const source = requireDataSource(dataSourceId);
  let columns: MysqlColumn[];
  try {
    columns = await getMysqlTableColumns(source, tableName);
  } catch {
    throw new AppError('无法读取所选数据表结构', 503, 'DATA_SOURCE_UNAVAILABLE');
  }

  if (columns.length === 0) {
    throw new AppError('数据表不存在或没有字段', 404, 'TABLE_NOT_FOUND');
  }

  let resource: ReturnType<typeof createDraftResource>;
  try {
    resource = createDraftResource(source.id, displayName, tableName, columns);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      throw new AppError('该数据表已经创建为问数资源', 409, 'RESOURCE_EXISTS');
    }
    throw error;
  }
  return resource;
}
