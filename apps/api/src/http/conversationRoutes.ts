import { Router, type Response } from 'express';
import {
  conversationCreateInputSchema,
  type ConversationSseEvent,
  conversationTurnInputSchema,
} from '@smartq/contracts';
import {
  cancelQuestionTurn,
  createNewConversation,
  listConversations,
  loadConversation,
  prepareQuestionTurn,
  runPreparedQuestionTurn,
} from '../application/conversations/conversationService.js';
import { asyncRoute } from './asyncRoute.js';

export const conversationRoutes = Router();

conversationRoutes.get('/', (request, response) => {
  const resourceId =
    typeof request.query.resourceId === 'string' ? request.query.resourceId : undefined;
  response.json({ items: listConversations(resourceId) });
});

conversationRoutes.post(
  '/',
  asyncRoute(async (request, response) => {
    const input = conversationCreateInputSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请选择已发布资源后创建会话' },
      });
      return;
    }
    const conversation = await createNewConversation(
      input.data.resourceId,
      input.data.title ?? null,
    );
    response.status(201).json(conversation);
  }),
);

conversationRoutes.get('/:conversationId', (request, response) => {
  response.json(loadConversation(idFromParam(request.params.conversationId)));
});

conversationRoutes.post(
  '/:conversationId/turns',
  asyncRoute(async (request, response) => {
    const input = conversationTurnInputSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '请输入问题或完成当前澄清问题' },
      });
      return;
    }
    const conversationId = idFromParam(request.params.conversationId);
    const prepared = await prepareQuestionTurn(conversationId, input.data);
    const controller = new AbortController();

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    response.on('close', () => {
      if (!response.writableEnded) controller.abort('interrupted');
    });

    const emit = (event: ConversationSseEvent) => {
      if (response.destroyed || response.writableEnded) return;
      writeEvent(response, event);
    };
    void runPreparedQuestionTurn(prepared, controller, emit)
      .catch(() => undefined)
      .finally(() => {
        if (!response.writableEnded) response.end();
      });
  }),
);

conversationRoutes.delete(
  '/:conversationId/turns/:turnId',
  asyncRoute(async (request, response) => {
    const result = await cancelQuestionTurn(
      idFromParam(request.params.conversationId),
      idFromParam(request.params.turnId),
    );
    response.json(result);
  }),
);

function writeEvent(response: Response, event: ConversationSseEvent) {
  const data = JSON.stringify(event);
  response.write(`event: ${event.type}\ndata: ${data}\n\n`);
}

function idFromParam(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? '') : value;
}
