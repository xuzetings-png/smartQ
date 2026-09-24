import { createHash, randomUUID } from 'node:crypto';
import { db } from './database.js';
import type { MysqlColumn } from '../mysql/mysqlAdapter.js';
import type { ResourceConfigurationInput } from '@smartq/contracts';

export function createDraftResource(
  dataSourceId: string,
  displayName: string,
  tableName: string,
  columns: MysqlColumn[],
) {
  if (columns.length === 0) {
    throw new Error('找不到所选数据表');
  }

  const schemaHash = createSchemaHash(columns);
  const resourceId = randomUUID();
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO resources (
        id, data_source_id, display_name, table_name, status, schema_hash, schema_json, created_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
    ).run(
      resourceId,
      dataSourceId,
      displayName,
      tableName,
      schemaHash,
      JSON.stringify(columns),
      new Date().toISOString(),
    );

    const insertField = db.prepare(
      `INSERT INTO resource_fields (
        id, resource_id, column_name, mysql_type, nullable, ordinal_position,
        display_name, semantic_role, enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const column of columns) {
      const semanticRole = inferSemanticRole(
        column.COLUMN_NAME,
        column.COLUMN_COMMENT,
        column.COLUMN_TYPE,
      );
      insertField.run(
        randomUUID(),
        resourceId,
        column.COLUMN_NAME,
        column.COLUMN_TYPE,
        column.IS_NULLABLE === 'YES' ? 1 : 0,
        column.ORDINAL_POSITION,
        column.COLUMN_COMMENT || column.COLUMN_NAME,
        semanticRole,
        semanticRole === 'hidden' ? 0 : 1,
      );
    }
  });

  try {
    create();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw Object.assign(new Error('该数据表已经创建为问数资源'), {
        status: 409,
        code: 'RESOURCE_EXISTS',
      });
    }
    throw error;
  }

  return { id: resourceId, status: 'draft' as const, displayName, tableName, schemaHash };
}

export function listResources() {
  return db
    .prepare(
      `SELECT r.id, r.display_name AS displayName, r.table_name AS tableName,
              r.status, ds.name AS dataSourceName, COUNT(rf.id) AS fieldCount,
              r.created_at AS createdAt
       FROM resources AS r
       JOIN data_sources AS ds ON ds.id = r.data_source_id
       LEFT JOIN resource_fields AS rf ON rf.resource_id = r.id
       GROUP BY r.id
       ORDER BY r.created_at DESC, r.id`,
    )
    .all();
}

export function getResourceDetails(resourceId: string) {
  const resource = db
    .prepare(
      `SELECT r.id, r.display_name AS displayName, r.table_name AS tableName,
              r.status, r.schema_hash AS schemaHash, ds.name AS dataSourceName,
              r.created_at AS createdAt
       FROM resources AS r
       JOIN data_sources AS ds ON ds.id = r.data_source_id
       WHERE r.id = ?`,
    )
    .get(resourceId) as
    | {
        id: string;
        displayName: string;
        tableName: string;
        status: string;
        schemaHash: string;
        dataSourceName: string;
        createdAt: string;
      }
    | undefined;
  if (!resource) return null;

  const fields = db
    .prepare(
      `SELECT id, column_name AS columnName, mysql_type AS mysqlType,
              nullable, ordinal_position AS ordinalPosition, display_name AS displayName,
              description, semantic_role AS semanticRole, enabled, unit,
              default_aggregation AS defaultAggregation, synonyms_json AS synonymsJson
       FROM resource_fields WHERE resource_id = ? ORDER BY ordinal_position`,
    )
    .all(resourceId) as Array<{
    id: string;
    columnName: string;
    mysqlType: string;
    nullable: number;
    ordinalPosition: number;
    displayName: string;
    description: string;
    semanticRole: string;
    enabled: number;
    unit: string | null;
    defaultAggregation: string | null;
    synonymsJson: string;
  }>;
  const recommendedQuestions = db
    .prepare(
      `SELECT question FROM resource_recommended_questions
       WHERE resource_id = ? ORDER BY position`,
    )
    .all(resourceId) as Array<{ question: string }>;
  const metrics = db
    .prepare(
      `SELECT id, display_name AS displayName, description,
              field_id AS fieldId, aggregation, synonyms_json AS synonymsJson,
              fixed_filters_json AS fixedFiltersJson
       FROM resource_metrics WHERE resource_id = ? ORDER BY position`,
    )
    .all(resourceId) as Array<{
    id: string;
    displayName: string;
    description: string;
    fieldId: string;
    aggregation: string;
    synonymsJson: string;
    fixedFiltersJson: string;
  }>;
  const schemaReview = db
    .prepare(
      `SELECT observed_schema_hash AS observedSchemaHash,
              observed_schema_json AS observedSchemaJson, detected_at AS detectedAt
       FROM resource_schema_reviews WHERE resource_id = ?`,
    )
    .get(resourceId) as
    { observedSchemaHash: string; observedSchemaJson: string; detectedAt: string } | undefined;

  return {
    ...resource,
    status: normalizeResourceStatus(resource.status),
    fields: fields.map((field) => ({
      id: field.id,
      columnName: field.columnName,
      mysqlType: field.mysqlType,
      nullable: field.nullable === 1,
      ordinalPosition: field.ordinalPosition,
      displayName: field.displayName,
      description: field.description,
      semanticRole: field.semanticRole,
      enabled: field.enabled === 1,
      unit: field.unit,
      defaultAggregation: field.defaultAggregation,
      synonyms: JSON.parse(field.synonymsJson) as string[],
    })),
    metrics: metrics.map((metric) => ({
      id: metric.id,
      displayName: metric.displayName,
      description: metric.description,
      fieldId: metric.fieldId,
      aggregation: metric.aggregation,
      synonyms: JSON.parse(metric.synonymsJson) as string[],
      fixedFilters: JSON.parse(metric.fixedFiltersJson) as Array<{
        fieldId: string;
        operator: 'eq';
        value: string;
      }>,
    })),
    recommendedQuestions: recommendedQuestions.map(({ question }) => question),
    schemaReview: schemaReview
      ? {
          observedSchemaHash: schemaReview.observedSchemaHash,
          observedSchema: JSON.parse(schemaReview.observedSchemaJson) as unknown,
          detectedAt: schemaReview.detectedAt,
        }
      : null,
  };
}

export function saveResourceConfiguration(
  resourceId: string,
  configuration: ResourceConfigurationInput,
) {
  const save = db.transaction(() => {
    db.prepare(`UPDATE resources SET display_name = ?, status = 'draft' WHERE id = ?`).run(
      configuration.displayName,
      resourceId,
    );

    const updateField = db.prepare(
      `UPDATE resource_fields SET display_name = ?, description = ?, semantic_role = ?,
        enabled = ?, unit = ?, default_aggregation = ?, synonyms_json = ?
       WHERE id = ? AND resource_id = ?`,
    );
    for (const field of configuration.fields) {
      updateField.run(
        field.displayName,
        field.description,
        field.semanticRole,
        field.enabled ? 1 : 0,
        field.unit,
        field.defaultAggregation,
        JSON.stringify(field.synonyms),
        field.id,
        resourceId,
      );
    }

    db.prepare('DELETE FROM resource_metrics WHERE resource_id = ?').run(resourceId);
    const insertMetric = db.prepare(
      `INSERT INTO resource_metrics (
        id, resource_id, display_name, description, field_id, aggregation,
        synonyms_json, fixed_filters_json, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    configuration.metrics.forEach((metric, position) => {
      insertMetric.run(
        metric.id ?? randomUUID(),
        resourceId,
        metric.displayName,
        metric.description,
        metric.fieldId,
        metric.aggregation,
        JSON.stringify(metric.synonyms),
        JSON.stringify(metric.fixedFilters),
        position,
      );
    });

    db.prepare('DELETE FROM resource_recommended_questions WHERE resource_id = ?').run(resourceId);
    const insertQuestion = db.prepare(
      `INSERT INTO resource_recommended_questions (id, resource_id, position, question)
       VALUES (?, ?, ?, ?)`,
    );
    configuration.recommendedQuestions.forEach((question, position) => {
      insertQuestion.run(randomUUID(), resourceId, position, question);
    });
  });

  save();
}

export function publishResource(resourceId: string) {
  db.prepare(`UPDATE resources SET status = 'active' WHERE id = ?`).run(resourceId);
}

export function getResourceSchemaContext(resourceId: string) {
  return db
    .prepare(
      `SELECT id, data_source_id AS dataSourceId, table_name AS tableName,
              status, schema_hash AS schemaHash, schema_json AS schemaJson
       FROM resources WHERE id = ?`,
    )
    .get(resourceId) as
    | {
        id: string;
        dataSourceId: string;
        tableName: string;
        status: string;
        schemaHash: string;
        schemaJson: string;
      }
    | undefined;
}

export function saveSchemaReview(resourceId: string, schemaHash: string, columns: MysqlColumn[]) {
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO resource_schema_reviews (
        resource_id, observed_schema_hash, observed_schema_json, detected_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(resource_id) DO UPDATE SET
        observed_schema_hash = excluded.observed_schema_hash,
        observed_schema_json = excluded.observed_schema_json,
        detected_at = excluded.detected_at`,
    ).run(resourceId, schemaHash, JSON.stringify(columns), now);
    db.prepare(`UPDATE resources SET status = 'needs_review' WHERE id = ?`).run(resourceId);
  })();
}

export function acceptObservedSchema(resourceId: string) {
  const accept = db.transaction(() => {
    const review = db
      .prepare(
        `SELECT observed_schema_hash AS schemaHash, observed_schema_json AS schemaJson
         FROM resource_schema_reviews WHERE resource_id = ?`,
      )
      .get(resourceId) as { schemaHash: string; schemaJson: string } | undefined;
    if (!review) return false;

    const columns = JSON.parse(review.schemaJson) as MysqlColumn[];
    const existingFields = db
      .prepare(
        `SELECT id, column_name AS columnName, mysql_type AS mysqlType
         FROM resource_fields WHERE resource_id = ?`,
      )
      .all(resourceId) as Array<{ id: string; columnName: string; mysqlType: string }>;
    const existingByName = new Map(existingFields.map((field) => [field.columnName, field]));
    const insertField = db.prepare(
      `INSERT INTO resource_fields (
        id, resource_id, column_name, mysql_type, nullable, ordinal_position,
        display_name, semantic_role, enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    const updateField = db.prepare(
      `UPDATE resource_fields SET mysql_type = ?, nullable = ?, ordinal_position = ?,
        enabled = CASE WHEN mysql_type <> ? THEN 0 ELSE enabled END,
        default_aggregation = CASE WHEN mysql_type <> ? THEN NULL ELSE default_aggregation END
       WHERE id = ? AND resource_id = ?`,
    );

    for (const column of columns) {
      const existing = existingByName.get(column.COLUMN_NAME);
      if (existing) {
        updateField.run(
          column.COLUMN_TYPE,
          column.IS_NULLABLE === 'YES' ? 1 : 0,
          column.ORDINAL_POSITION,
          column.COLUMN_TYPE,
          column.COLUMN_TYPE,
          existing.id,
          resourceId,
        );
      } else {
        insertField.run(
          randomUUID(),
          resourceId,
          column.COLUMN_NAME,
          column.COLUMN_TYPE,
          column.IS_NULLABLE === 'YES' ? 1 : 0,
          column.ORDINAL_POSITION,
          column.COLUMN_COMMENT || column.COLUMN_NAME,
          isNumericMysqlType(column.COLUMN_TYPE) ? 'metric' : 'dimension',
        );
      }
    }

    if (columns.length > 0) {
      const names = columns.map((column) => column.COLUMN_NAME);
      const placeholders = names.map(() => '?').join(', ');
      db.prepare(
        `DELETE FROM resource_fields WHERE resource_id = ? AND column_name NOT IN (${placeholders})`,
      ).run(resourceId, ...names);
    }
    db.prepare(
      `UPDATE resources SET schema_hash = ?, schema_json = ?, status = 'draft' WHERE id = ?`,
    ).run(review.schemaHash, review.schemaJson, resourceId);
    db.prepare('DELETE FROM resource_schema_reviews WHERE resource_id = ?').run(resourceId);
    return true;
  });

  return accept();
}

export function createSchemaHash(columns: MysqlColumn[]) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        columns.map((column) => [
          column.COLUMN_NAME,
          column.COLUMN_TYPE,
          column.IS_NULLABLE,
          column.ORDINAL_POSITION,
        ]),
      ),
    )
    .digest('hex');
}

function isNumericMysqlType(mysqlType: string) {
  return /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real)(\b|\()/i.test(
    mysqlType,
  );
}

function inferSemanticRole(columnName: string, columnComment: string, mysqlType: string) {
  if (isSensitiveColumn(columnName, columnComment)) return 'hidden';
  if (isIdentifierColumn(columnName)) return 'dimension';
  return isNumericMysqlType(mysqlType) ? 'metric' : 'dimension';
}

function isIdentifierColumn(columnName: string) {
  return (
    /(^|[_-])(id|key|code|no|number)$/i.test(columnName) ||
    /(id|key|code|no|number)$/i.test(columnName.replace(/([a-z])([A-Z])/g, '$1_$2'))
  );
}

function isSensitiveColumn(columnName: string, columnComment: string) {
  const searchableName = `${columnName} ${columnComment}`;
  return /password|passwd|secret|token|(?:api|private)[_-]?key|e-?mail|phone|mobile|telephone|address|account[_-]?number|card[_-]?number|birth[_-]?date|身份证|证件号|手机号|电话号码|邮箱|住址|家庭住址|银行卡|银行账号|银行卡号|出生日期|生日|护照号|性别|(?:客户|用户|会员|收件人|收货人|联系人)姓名|(?:customer|user|member|recipient|receiver|contact|consignee)[_-]?(?:full[_-]?)?name/i.test(
    searchableName,
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

function normalizeResourceStatus(status: string): 'draft' | 'active' | 'needs_review' {
  if (status === 'active' || status === 'needs_review') return status;
  return 'draft';
}
