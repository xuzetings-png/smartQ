import { describe, expect, it } from 'vitest';
import schemaSql from '../../demo/mysql/init/01-schema.sql?raw';

describe('演示 MySQL 初始化字符集', () => {
  it('应在含中文的建表语句前启用 utf8mb4', () => {
    const charsetDeclarationIndex = schemaSql.search(/^\s*SET NAMES utf8mb4\s*;/im);
    const createTableIndex = schemaSql.search(/^\s*CREATE TABLE/im);

    expect(charsetDeclarationIndex).toBeGreaterThanOrEqual(0);
    expect(createTableIndex).toBeGreaterThan(charsetDeclarationIndex);
  });
});
