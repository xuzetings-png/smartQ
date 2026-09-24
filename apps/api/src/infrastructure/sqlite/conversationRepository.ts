import { randomUUID } from 'node:crypto';
import type {
  ConversationDetail,
  ConversationMessage,
  ConversationSummary,
  QueryResult,
} from '@smartq/contracts';
import { db } from './database.js';

export type StoredClarification = {
  clarificationId: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  allowFreeText: boolean;
  processSteps?: string[];
};

export type QueryRun = {
  id: string;
  conversationId: string;
  turnId: string;
  requestId: string;
  parentRunId: string | null;
  question: string;
  request: {
    input: { kind: 'question'; text: string } | { kind: 'clarification'; answerText: string };
    clarificationAnswer?: string;
  };
  status: string;
  clarification: StoredClarification | null;
};

export function createConversation(
  resourceId: string,
  resourceConfigHash: string,
  title: string | null,
): ConversationSummary {
  const id = randomUUID();
  const now = new Date().toISOString();
  const normalizedTitle = title?.trim();
  db.prepare(
    `INSERT INTO conversations (id, resource_id, resource_config_hash, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    resourceId,
    resourceConfigHash,
    normalizedTitle && normalizedTitle.length > 0 ? normalizedTitle : '新建会话',
    now,
    now,
  );
  const summary = getConversationSummary(id);
  if (!summary) throw new Error('CONVERSATION_CREATE_FAILED');
  return summary;
}

export function listConversationSummaries(resourceId?: string): ConversationSummary[] {
  const rows = resourceId
    ? db
        .prepare(
          `SELECT c.id, c.resource_id AS resourceId, r.display_name AS resourceName,
                  c.title, c.created_at AS createdAt, c.updated_at AS updatedAt
           FROM conversations AS c JOIN resources AS r ON r.id = c.resource_id
           WHERE c.resource_id = ? ORDER BY c.updated_at DESC LIMIT 50`,
        )
        .all(resourceId)
    : db
        .prepare(
          `SELECT c.id, c.resource_id AS resourceId, r.display_name AS resourceName,
                  c.title, c.created_at AS createdAt, c.updated_at AS updatedAt
           FROM conversations AS c JOIN resources AS r ON r.id = c.resource_id
           ORDER BY c.updated_at DESC LIMIT 50`,
        )
        .all();
  return rows as ConversationSummary[];
}

export function getConversationDetail(conversationId: string): ConversationDetail | null {
  const summary = getConversationSummary(conversationId);
  if (!summary) return null;
  const storedMessages = db
    .prepare(
      `SELECT id, conversation_id AS conversationId, turn_id AS turnId,
              role, content_json AS contentJson, created_at AS createdAt
       FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid LIMIT 100`,
    )
    .all(conversationId) as Array<{
    id: string;
    conversationId: string;
    turnId: string;
    role: 'user' | 'assistant';
    contentJson: string;
    createdAt: string;
  }>;
  const pending = db
    .prepare(
      `SELECT clarification_json AS clarificationJson FROM query_runs
       WHERE conversation_id = ? AND status = 'awaiting_clarification'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(conversationId) as { clarificationJson: string } | undefined;
  const messages = storedMessages.map((message) => ({
    id: message.id,
    role: message.role,
    turnId: message.turnId,
    content: JSON.parse(message.contentJson) as ConversationMessage['content'],
    createdAt: message.createdAt,
  }));

  return {
    ...summary,
    messages,
    pendingClarification: pending
      ? (JSON.parse(pending.clarificationJson) as ConversationDetail['pendingClarification'])
      : null,
  };
}

export function getConversationBinding(conversationId: string) {
  return db
    .prepare(
      `SELECT id, resource_id AS resourceId, resource_config_hash AS resourceConfigHash
       FROM conversations WHERE id = ?`,
    )
    .get(conversationId) as
    { id: string; resourceId: string; resourceConfigHash: string } | undefined;
}

export function startQuestionRun(input: {
  conversationId: string;
  requestId: string;
  text: string;
}): QueryRun {
  const transaction = db.transaction(() => {
    assertRequestIsNew(input.conversationId, input.requestId);
    assertNoPendingTurn(input.conversationId);
    const id = randomUUID();
    const turnId = randomUUID();
    const now = new Date().toISOString();
    const request = { input: { kind: 'question' as const, text: input.text } };
    db.prepare(
      `INSERT INTO query_runs (
        id, conversation_id, turn_id, parent_run_id, request_id, request_json,
        question, status, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, 'executing', ?)`,
    ).run(
      id,
      input.conversationId,
      turnId,
      input.requestId,
      JSON.stringify(request),
      input.text,
      now,
    );
    insertMessage(
      input.conversationId,
      turnId,
      'user',
      { kind: 'question', text: input.text },
      now,
    );
    db.prepare(
      `UPDATE conversations SET
        title = CASE WHEN title = '新建会话' THEN ? ELSE title END,
        updated_at = ? WHERE id = ?`,
    ).run(input.text.slice(0, 30), now, input.conversationId);
    return getQueryRun(id);
  });
  return transaction();
}

export function startClarificationRun(input: {
  conversationId: string;
  requestId: string;
  clarificationId: string;
  optionId?: string;
  answerText?: string;
}): QueryRun {
  const transaction = db.transaction(() => {
    assertRequestIsNew(input.conversationId, input.requestId);
    const parent = db
      .prepare(
        `SELECT id, turn_id AS turnId, question, clarification_json AS clarificationJson
         FROM query_runs
         WHERE conversation_id = ? AND clarification_id = ? AND status = 'awaiting_clarification'`,
      )
      .get(input.conversationId, input.clarificationId) as
      { id: string; turnId: string; question: string; clarificationJson: string } | undefined;
    if (!parent) throw new Error('CLARIFICATION_NOT_PENDING');
    const clarification = JSON.parse(parent.clarificationJson) as StoredClarification;
    const option = input.optionId
      ? clarification.options.find((candidate) => candidate.id === input.optionId)
      : undefined;
    if (input.optionId && !option) throw new Error('CLARIFICATION_OPTION_INVALID');
    if (input.answerText && !clarification.allowFreeText) {
      throw new Error('CLARIFICATION_FREE_TEXT_NOT_ALLOWED');
    }
    const answerText = option?.label ?? input.answerText;
    if (!answerText) throw new Error('CLARIFICATION_ANSWER_REQUIRED');
    const now = new Date().toISOString();
    const id = randomUUID();
    const request = {
      input: {
        kind: 'clarification' as const,
        answerText,
      },
      clarificationAnswer: `${clarification.question}：${answerText}`,
    };

    db.prepare("UPDATE query_runs SET status = 'continued', finished_at = ? WHERE id = ?").run(
      now,
      parent.id,
    );
    db.prepare(
      `INSERT INTO query_runs (
        id, conversation_id, turn_id, parent_run_id, request_id, request_json,
        question, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'executing', ?)`,
    ).run(
      id,
      input.conversationId,
      parent.turnId,
      parent.id,
      input.requestId,
      JSON.stringify(request),
      parent.question,
      now,
    );
    insertMessage(
      input.conversationId,
      parent.turnId,
      'user',
      {
        kind: 'clarification_answer',
        clarificationId: input.clarificationId,
        answerText,
        optionLabel: option?.label ?? null,
      },
      now,
    );
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
      now,
      input.conversationId,
    );
    return getQueryRun(id);
  });
  return transaction();
}

export function getQueryRun(runId: string): QueryRun {
  const row = db
    .prepare(
      `SELECT id, conversation_id AS conversationId, turn_id AS turnId,
              request_id AS requestId, parent_run_id AS parentRunId, question,
              request_json AS requestJson, status, clarification_json AS clarificationJson
       FROM query_runs WHERE id = ?`,
    )
    .get(runId) as
    | {
        id: string;
        conversationId: string;
        turnId: string;
        requestId: string;
        parentRunId: string | null;
        question: string;
        requestJson: string;
        status: string;
        clarificationJson: string | null;
      }
    | undefined;
  if (!row) throw new Error('QUERY_RUN_NOT_FOUND');
  return {
    id: row.id,
    conversationId: row.conversationId,
    turnId: row.turnId,
    requestId: row.requestId,
    parentRunId: row.parentRunId,
    question: row.question,
    request: JSON.parse(row.requestJson) as QueryRun['request'],
    status: row.status,
    clarification: row.clarificationJson
      ? (JSON.parse(row.clarificationJson) as StoredClarification)
      : null,
  };
}

export function getConversationHistory(conversationId: string, currentTurnId: string) {
  const rows = db
    .prepare(
      `SELECT question, plan_json AS planJson, result_json AS resultJson
       FROM query_runs
       WHERE conversation_id = ? AND turn_id <> ? AND status IN ('succeeded', 'empty')
       ORDER BY created_at DESC, rowid DESC LIMIT 6`,
    )
    .all(conversationId, currentTurnId) as Array<{
    question: string;
    planJson: string | null;
    resultJson: string | null;
  }>;
  return rows.reverse().map((row) => {
    const result = row.resultJson ? (JSON.parse(row.resultJson) as QueryResult) : null;
    return {
      question: row.question,
      plan: row.planJson ? (JSON.parse(row.planJson) as unknown) : null,
      answer: result
        ? {
            interpretation: result.interpretation,
            answer: result.answer,
            rows: result.rows.slice(0, 10),
          }
        : null,
    };
  });
}

export function countTurnClarifications(conversationId: string, turnId: string) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM query_runs
       WHERE conversation_id = ? AND turn_id = ? AND clarification_id IS NOT NULL`,
    )
    .get(conversationId, turnId) as { count: number };
  return row.count;
}

export function getTurnStatus(conversationId: string, turnId: string) {
  const row = db
    .prepare(
      `SELECT status FROM query_runs WHERE conversation_id = ? AND turn_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(conversationId, turnId) as { status: string } | undefined;
  return row?.status ?? null;
}

export function saveRunPlan(runId: string, plan: unknown) {
  db.prepare('UPDATE query_runs SET plan_json = ? WHERE id = ?').run(JSON.stringify(plan), runId);
}

export function saveRunSql(runId: string, plan: unknown, sqlText: string) {
  db.prepare('UPDATE query_runs SET plan_json = ?, sql_text = ? WHERE id = ?').run(
    JSON.stringify(plan),
    sqlText,
    runId,
  );
}

export function saveRunClarification(
  run: QueryRun,
  plan: unknown,
  clarification: StoredClarification,
  processSteps: string[],
) {
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE query_runs SET status = 'awaiting_clarification', plan_json = ?,
        clarification_id = ?, clarification_json = ?, finished_at = ? WHERE id = ?`,
    ).run(
      JSON.stringify(plan),
      clarification.clarificationId,
      JSON.stringify({ ...clarification, processSteps, kind: 'clarification' }),
      now,
      run.id,
    );
    insertMessage(
      run.conversationId,
      run.turnId,
      'assistant',
      { kind: 'clarification', ...clarification, processSteps },
      now,
    );
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, run.conversationId);
  });
  transaction();
}

export function saveRunResult(run: QueryRun, plan: unknown, sqlText: string, result: QueryResult) {
  const now = new Date().toISOString();
  const status = result.rowCount === 0 ? 'empty' : 'succeeded';
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE query_runs SET status = ?, plan_json = ?, sql_text = ?, result_json = ?,
        row_count = ?, truncated = ?, duration_ms = ?, finished_at = ? WHERE id = ?`,
    ).run(
      status,
      JSON.stringify(plan),
      sqlText,
      JSON.stringify(result),
      result.rowCount,
      Number(result.truncated),
      result.durationMs,
      now,
      run.id,
    );
    insertMessage(run.conversationId, run.turnId, 'assistant', { kind: 'answer', result }, now);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, run.conversationId);
  });
  transaction();
}

export function saveRunError(
  run: QueryRun,
  input: {
    code: string;
    stage: 'understanding' | 'executing';
    message: string;
    rejected?: boolean;
    processSteps?: string[];
  },
) {
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE query_runs SET status = ?, error_code = ?, error_stage = ?, finished_at = ? WHERE id = ?`,
    ).run(input.rejected ? 'rejected' : 'failed', input.code, input.stage, now, run.id);
    insertMessage(
      run.conversationId,
      run.turnId,
      'assistant',
      {
        kind: 'error',
        code: input.code,
        message: input.message,
        ...(input.processSteps ? { processSteps: input.processSteps } : {}),
      },
      now,
    );
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, run.conversationId);
  });
  transaction();
}

export function saveRunInterruption(runId: string, status: 'cancelled' | 'interrupted') {
  const run = getQueryRun(runId);
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE query_runs SET status = ?, finished_at = ?
       WHERE id = ? AND status = 'executing'`,
      )
      .run(status, now, runId);
    if (result.changes === 0) return;
    insertMessage(
      run.conversationId,
      run.turnId,
      'assistant',
      {
        kind: 'error',
        code: status === 'cancelled' ? 'TURN_CANCELLED' : 'TURN_INTERRUPTED',
        message: status === 'cancelled' ? '本轮已取消。' : '本轮连接中断，请重新提问。',
      },
      now,
    );
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, run.conversationId);
  });
  transaction();
}

export function cancelPendingRun(conversationId: string, turnId: string) {
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE query_runs SET status = 'cancelled', finished_at = ?
       WHERE conversation_id = ? AND turn_id = ? AND status = 'awaiting_clarification'`,
      )
      .run(now, conversationId, turnId);
    if (result.changes === 0) return false;
    insertMessage(
      conversationId,
      turnId,
      'assistant',
      { kind: 'error', code: 'TURN_CANCELLED', message: '本轮已取消。' },
      now,
    );
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
    return true;
  });
  return transaction();
}

function getConversationSummary(conversationId: string): ConversationSummary | null {
  return (
    (db
      .prepare(
        `SELECT c.id, c.resource_id AS resourceId, r.display_name AS resourceName,
              c.title, c.created_at AS createdAt, c.updated_at AS updatedAt
       FROM conversations AS c JOIN resources AS r ON r.id = c.resource_id
       WHERE c.id = ?`,
      )
      .get(conversationId) as ConversationSummary | undefined) ?? null
  );
}

function insertMessage(
  conversationId: string,
  turnId: string,
  role: ConversationMessage['role'],
  content: ConversationMessage['content'],
  createdAt: string,
) {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, turn_id, role, content_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), conversationId, turnId, role, JSON.stringify(content), createdAt);
}

function assertRequestIsNew(conversationId: string, requestId: string) {
  const duplicate = db
    .prepare('SELECT 1 FROM query_runs WHERE conversation_id = ? AND request_id = ?')
    .get(conversationId, requestId);
  if (duplicate) throw new Error('REQUEST_ALREADY_PROCESSED');
}

function assertNoPendingTurn(conversationId: string) {
  const pending = db
    .prepare(
      `SELECT status FROM query_runs WHERE conversation_id = ?
       AND status IN ('executing', 'awaiting_clarification') LIMIT 1`,
    )
    .get(conversationId);
  if (pending) throw new Error('TURN_IN_PROGRESS');
}
