export type ResourceSchemaField = {
  columnName: string;
  mysqlType: string;
  nullable: boolean;
  ordinalPosition: number;
};

export type ObservedSchemaColumn = {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: 'YES' | 'NO';
  ORDINAL_POSITION: number;
};

export function compareResourceSchema(
  currentFields: ResourceSchemaField[],
  observedColumns: ObservedSchemaColumn[],
) {
  const currentByName = new Map(currentFields.map((field) => [field.columnName, field]));
  const observedByName = new Map(observedColumns.map((column) => [column.COLUMN_NAME, column]));
  const added = observedColumns
    .filter((column) => !currentByName.has(column.COLUMN_NAME))
    .map((column) => ({ columnName: column.COLUMN_NAME, mysqlType: column.COLUMN_TYPE }));
  const removed = currentFields
    .filter((field) => !observedByName.has(field.columnName))
    .map((field) => ({ columnName: field.columnName, mysqlType: field.mysqlType }));
  const changed = observedColumns.flatMap((column) => {
    const current = currentByName.get(column.COLUMN_NAME);
    if (!current) return [];
    const nullable = column.IS_NULLABLE === 'YES';
    if (
      current.mysqlType === column.COLUMN_TYPE &&
      current.nullable === nullable &&
      current.ordinalPosition === column.ORDINAL_POSITION
    ) {
      return [];
    }
    return [
      {
        columnName: column.COLUMN_NAME,
        previousMysqlType: current.mysqlType,
        mysqlType: column.COLUMN_TYPE,
        nullable,
        ordinalPosition: column.ORDINAL_POSITION,
        previousOrdinalPosition: current.ordinalPosition,
      },
    ];
  });
  return { added, removed, changed };
}
