import { Readable } from 'node:stream';
import { parse as parseDelimitedText } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import * as LegacyExcel from 'xlsx';
import * as codepage from 'xlsx/dist/cpexcel.full.mjs';

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 100;
const MAX_NON_EMPTY_CELLS = 500_000;
const LEGACY_XLS_SIGNATURE = Buffer.from('d0cf11e0a1b11ae1', 'hex');
type StreamWorksheet = AsyncIterable<ExcelJS.Row> & { id: number; name: string };

LegacyExcel.set_cptable(codepage);

export type ImportedCellValue = string | number | boolean | null;
type ImportedRow = ImportedCellValue[] | undefined;
export type ImportedColumnType = 'integer' | 'number' | 'boolean' | 'date' | 'text';

export type ParsedSpreadsheet = {
  sheets: Array<{ name: string; index: number }>;
  selectedSheet: string;
  rowCount: number;
  columnCount: number;
  columns: Array<{
    name: string;
    dataType: ImportedColumnType;
    nullable: boolean;
    mysqlType: string;
  }>;
  rows: ImportedCellValue[][];
};

export class SpreadsheetParseError extends Error {
  constructor(
    readonly code:
      | 'IMPORT_FILE_TYPE_UNSUPPORTED'
      | 'IMPORT_FILE_INVALID'
      | 'IMPORT_SHEET_NOT_FOUND'
      | 'IMPORT_SHEET_LIMIT_EXCEEDED',
    message: string,
  ) {
    super(message);
    this.name = 'SpreadsheetParseError';
  }
}

export async function parseSpreadsheet(
  fileName: string,
  content: Buffer,
  requestedSheetName?: string,
): Promise<ParsedSpreadsheet> {
  if (content.length === 0) {
    throw new SpreadsheetParseError('IMPORT_FILE_INVALID', '文件内容为空，请选择有效的表格文件。');
  }

  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'csv' || extension === 'tsv') {
    if (requestedSheetName && requestedSheetName !== defaultSheetName(fileName)) {
      throw new SpreadsheetParseError('IMPORT_SHEET_NOT_FOUND', '找不到所选工作表，请重新选择。');
    }
    return parseDelimitedSpreadsheet(fileName, content, extension === 'tsv' ? '\t' : ',');
  }
  if (extension === 'xls' || hasLegacyXlsSignature(content)) {
    return parseLegacyExcelSpreadsheet(content, requestedSheetName);
  }
  if (extension !== 'xlsx') {
    throw new SpreadsheetParseError(
      'IMPORT_FILE_TYPE_UNSUPPORTED',
      '暂不支持该文件格式，请上传 .xlsx、.xls、.csv 或 .tsv 文件。',
    );
  }
  return parseXlsxSpreadsheet(content, requestedSheetName);
}

function parseLegacyExcelSpreadsheet(
  content: Buffer,
  requestedSheetName?: string,
): ParsedSpreadsheet {
  let workbook: LegacyExcel.WorkBook;
  try {
    workbook = LegacyExcel.read(content, {
      type: 'buffer',
      cellDates: true,
      codepage: 1200,
    });
  } catch {
    throw new SpreadsheetParseError(
      'IMPORT_FILE_INVALID',
      'Excel 文件损坏、受密码保护或无法读取，请另存为未加密的 .xls 或 .xlsx 后重试。',
    );
  }

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new SpreadsheetParseError('IMPORT_FILE_INVALID', '工作簿中没有可读取的工作表。');
  }
  const selectedSheet = requestedSheetName ?? sheetNames[0];
  if (!sheetNames.includes(selectedSheet)) {
    throw new SpreadsheetParseError('IMPORT_SHEET_NOT_FOUND', '找不到所选工作表，请重新选择。');
  }

  const worksheet = workbook.Sheets[selectedSheet];
  const usedRange = worksheet['!ref'];
  if (usedRange) {
    const range = LegacyExcel.utils.decode_range(usedRange);
    const rowCount = range.e.r - range.s.r + 1;
    const columnCount = range.e.c - range.s.c + 1;
    if (rowCount > MAX_ROWS + 1 || columnCount > MAX_COLUMNS) {
      throw new SpreadsheetParseError(
        'IMPORT_SHEET_LIMIT_EXCEEDED',
        '工作表超过 50,000 行或 100 列，请整理文件后重试。',
      );
    }
  }

  const nonEmptyCellCount = Object.entries(worksheet).reduce((count, [address, cell]) => {
    if (address.startsWith('!') || !isRecord(cell)) return count;
    return count + (isNonEmpty(normalizeExcelCellValue(cell.v) ?? null) ? 1 : 0);
  }, 0);
  if (nonEmptyCellCount > MAX_NON_EMPTY_CELLS) {
    throw new SpreadsheetParseError(
      'IMPORT_SHEET_LIMIT_EXCEEDED',
      '工作表超过 500,000 个非空单元格，请拆分文件后重试。',
    );
  }

  try {
    const rows = LegacyExcel.utils
      .sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      })
      .map((row) => row.map((value) => normalizeExcelCellValue(value)));
    return buildParsedSheet(selectedSheet, sheetNames, rows);
  } catch (error) {
    if (error instanceof SpreadsheetParseError) throw error;
    throw new SpreadsheetParseError(
      'IMPORT_FILE_INVALID',
      'Excel 文件损坏、受密码保护或无法读取，请另存为未加密的 .xls 或 .xlsx 后重试。',
    );
  }
}

function hasLegacyXlsSignature(content: Buffer) {
  return (
    content.length >= LEGACY_XLS_SIGNATURE.length &&
    content.subarray(0, LEGACY_XLS_SIGNATURE.length).equals(LEGACY_XLS_SIGNATURE)
  );
}

function parseDelimitedSpreadsheet(
  fileName: string,
  content: Buffer,
  delimiter: ',' | '\t',
): ParsedSpreadsheet {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    throw new SpreadsheetParseError(
      'IMPORT_FILE_INVALID',
      'CSV/TSV 文件必须使用 UTF-8 编码，请另存为 UTF-8 后重试。',
    );
  }

  let records: string[][];
  try {
    records = parseDelimitedText(text, {
      bom: true,
      delimiter,
      relax_column_count: true,
      skip_empty_lines: false,
      max_record_size: 2 * 1024 * 1024,
    });
  } catch {
    throw new SpreadsheetParseError(
      'IMPORT_FILE_INVALID',
      '文件内容无法解析，请检查分隔符和引号。',
    );
  }

  const rows = records.map((record) => record.map((value) => normalizeValue(value)));
  return buildParsedSheet(defaultSheetName(fileName), [defaultSheetName(fileName)], rows);
}

async function parseXlsxSpreadsheet(
  content: Buffer,
  requestedSheetName?: string,
): Promise<ParsedSpreadsheet> {
  const sheets: Array<{ name: string; index: number }> = [];
  let parsedSheet: ParsedSpreadsheet | null = null;

  try {
    const workbook = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([content]), {
      worksheets: 'emit',
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      styles: 'cache',
    });

    for await (const worksheet of workbook) {
      const streamWorksheet = worksheet as unknown as StreamWorksheet;
      const sheetName = streamWorksheet.name;
      sheets.push({ name: sheetName, index: sheets.length });
      const shouldParse = requestedSheetName
        ? sheetName === requestedSheetName
        : sheets.length === 1;
      const rows: ImportedRow[] = [];
      let nonEmptyCellCount = 0;
      for await (const row of streamWorksheet) {
        if (row.number > MAX_ROWS + 1 || row.cellCount > MAX_COLUMNS) {
          throw new SpreadsheetParseError(
            'IMPORT_SHEET_LIMIT_EXCEEDED',
            '工作簿中的工作表超过 50,000 行或 100 列，请整理文件后重试。',
          );
        }
        const values = Array.from({ length: row.cellCount }, (_, index) =>
          normalizeExcelCellValue(row.getCell(index + 1).value),
        );
        nonEmptyCellCount += values.filter(isNonEmpty).length;
        if (nonEmptyCellCount > MAX_NON_EMPTY_CELLS) {
          throw new SpreadsheetParseError(
            'IMPORT_SHEET_LIMIT_EXCEEDED',
            '工作簿中的工作表超过 500,000 个非空单元格，请拆分文件后重试。',
          );
        }
        if (shouldParse) rows[row.number - 1] = values;
      }
      if (shouldParse) parsedSheet = buildParsedSheet(sheetName, [], rows);
    }
  } catch (error) {
    if (error instanceof SpreadsheetParseError) throw error;
    throw new SpreadsheetParseError(
      'IMPORT_FILE_INVALID',
      'Excel 文件损坏、受密码保护或无法读取，请另存为未加密的 .xlsx 后重试。',
    );
  }

  if (sheets.length === 0) {
    throw new SpreadsheetParseError('IMPORT_FILE_INVALID', '工作簿中没有可读取的工作表。');
  }
  if (requestedSheetName && !sheets.some((sheet) => sheet.name === requestedSheetName)) {
    throw new SpreadsheetParseError('IMPORT_SHEET_NOT_FOUND', '找不到所选工作表，请重新选择。');
  }
  if (!parsedSheet) {
    throw new SpreadsheetParseError('IMPORT_FILE_INVALID', '工作表没有可读取的表头。');
  }

  return { ...parsedSheet, sheets };
}

function buildParsedSheet(
  selectedSheet: string,
  sheetNames: string[],
  sourceRows: ImportedRow[],
): ParsedSpreadsheet {
  const headerRow = sourceRows.at(0);
  if (!headerRow?.some((value) => value !== null && String(value).trim() !== '')) {
    throw new SpreadsheetParseError(
      'IMPORT_FILE_INVALID',
      '第一行必须包含至少一个字段名，请补充表头后重试。',
    );
  }

  const rowCount = Math.max(0, sourceRows.length - 1);
  const columnCount = sourceRows.reduce(
    (max, row) => Math.max(max, row?.length ?? 0),
    headerRow.length,
  );
  if (rowCount > MAX_ROWS || columnCount > MAX_COLUMNS) {
    throw new SpreadsheetParseError(
      'IMPORT_SHEET_LIMIT_EXCEEDED',
      '工作表超过 50,000 行或 100 列，请整理文件后重试。',
    );
  }

  const headers = normalizeHeaders(headerRow, columnCount);
  const nonEmptyCellCount = sourceRows.reduce(
    (total, row) => total + (row ?? []).filter(isNonEmpty).length,
    0,
  );
  if (nonEmptyCellCount > MAX_NON_EMPTY_CELLS) {
    throw new SpreadsheetParseError(
      'IMPORT_SHEET_LIMIT_EXCEEDED',
      '工作表超过 500,000 个非空单元格，请拆分文件后重试。',
    );
  }

  const dataRows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const row = sourceRows[rowIndex + 1];
    return Array.from({ length: columnCount }, (_, columnIndex) => row?.[columnIndex] ?? null);
  });
  const columns = headers.map((name, index) => {
    const values = dataRows.map((row) => row[index]);
    const dataType = inferColumnType(values);
    const storageTypes = getStorageTypes(dataType);
    return {
      name,
      dataType,
      nullable: values.some((value) => !isNonEmpty(value)),
      ...storageTypes,
    };
  });
  const normalizedRows = dataRows.map((row) =>
    row.map((value, index) => normalizeForColumn(value, columns[index]?.dataType ?? 'text')),
  );

  return {
    sheets: sheetNames.map((name, index) => ({ name, index })),
    selectedSheet,
    rowCount: dataRows.length,
    columnCount,
    columns,
    rows: normalizedRows,
  };
}

function normalizeHeaders(headerRow: ImportedCellValue[], columnCount: number) {
  const used = new Set<string>();
  return Array.from({ length: columnCount }, (_, index) => {
    const original = headerRow.at(index);
    const base =
      (original === null || original === undefined ? '' : String(original))
        .split('')
        .filter((character) => {
          const code = character.charCodeAt(0);
          return code >= 32 && (code < 127 || code > 159);
        })
        .join('')
        .trim()
        .slice(0, 64) || `列 ${String(index + 1)}`;
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      const tail = `_${String(suffix++)}`;
      name = `${base.slice(0, 64 - tail.length)}${tail}`;
    }
    used.add(name);
    return name;
  });
}

function inferColumnType(values: ImportedCellValue[]): ImportedColumnType {
  const categories = new Set<'number' | 'boolean' | 'date' | 'text'>();
  let hasDecimal = false;
  for (const value of values) {
    if (!isNonEmpty(value)) continue;
    if (typeof value === 'number') {
      categories.add('number');
      hasDecimal ||= !Number.isInteger(value);
      continue;
    }
    if (typeof value === 'boolean') {
      categories.add('boolean');
      continue;
    }
    const text = String(value).trim();
    if (isBooleanText(text)) {
      categories.add('boolean');
    } else if (isDateText(text)) {
      categories.add('date');
    } else if (isNumericText(text)) {
      categories.add('number');
      hasDecimal ||= text.includes('.');
    } else {
      categories.add('text');
    }
  }

  if (categories.size === 1) {
    const [category] = categories;
    if (category === 'number') return hasDecimal ? 'number' : 'integer';
    if (category === 'boolean' || category === 'date') return category;
  }
  return 'text';
}

function normalizeForColumn(value: ImportedCellValue, type: ImportedColumnType): ImportedCellValue {
  if (!isNonEmpty(value)) return null;
  if (type === 'integer' || type === 'number') {
    if (typeof value === 'number') return value;
    const numeric = Number(String(value).trim());
    return Number.isFinite(numeric) ? numeric : String(value);
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    return /^(true|yes|是)$/i.test(String(value).trim());
  }
  if (type === 'date') return normalizeDateText(value);
  return value;
}

function getStorageTypes(dataType: ImportedColumnType) {
  const types: Record<ImportedColumnType, string> = {
    integer: 'bigint',
    number: 'decimal(18,4)',
    boolean: 'tinyint(1)',
    date: 'datetime',
    text: 'text',
  };
  return { mysqlType: types[dataType] };
}

function normalizeExcelCellValue(value: unknown): ImportedCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'number' && !Number.isFinite(value) ? null : value;
  }
  if (typeof value !== 'object') return null;
  if ('result' in value) return normalizeExcelCellValue(value.result ?? null);
  if ('richText' in value && Array.isArray(value.richText)) {
    const parts: unknown[] = value.richText;
    return parts
      .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  if ('text' in value && typeof value.text === 'string') return value.text;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeDateText(value: ImportedCellValue) {
  const text = String(value).trim();
  return text.includes(' ') && !text.includes('T') ? text.replace(' ', 'T') : text;
}

function isNumericText(value: string) {
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}

function isBooleanText(value: string) {
  return /^(true|false|yes|no|是|否)$/i.test(value);
}

function isDateText(value: string) {
  return (
    /^\d{4}-\d{1,2}-\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(
      value,
    ) && Number.isFinite(Date.parse(value))
  );
}

function normalizeValue(value: string): ImportedCellValue {
  const trimmed = value.trim();
  return trimmed === '' ? null : value;
}

function isNonEmpty(value: ImportedCellValue) {
  return value !== null && value !== '';
}

function defaultSheetName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const name = baseName.replace(/\.[^.]+$/, '').trim();
  return name || '导入数据';
}
