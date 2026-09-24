import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  queryResultSchema,
  type ConversationDetail,
  type ConversationMessage as ConversationMessageType,
  type ConversationSseEvent,
  type ConversationSummary,
  type ConversationTurnInput,
} from '@smartq/contracts';
import { ApiError } from '../../shared/api/apiClient';
import { resourceApi, type ResourceDetail, type ResourceSummary } from '../resource/resourceApi';
import { conversationApi } from './conversationApi';
import type { QueryProgressStep } from './QueryProcess';

type ChatStatus =
  | 'idle'
  | 'submitting'
  | 'understanding'
  | 'executing'
  | 'clarification_required'
  | 'succeeded'
  | 'empty'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

type ChatState = {
  resources: ResourceSummary[];
  resourceDetails: ResourceDetail | null;
  conversations: ConversationSummary[];
  selectedResourceId: string | null;
  conversation: ConversationDetail | null;
  loading: boolean;
  status: ChatStatus;
  activeTurnId: string | null;
  progressSteps: QueryProgressStep[];
  pendingDraft: ConversationMessageType['content'] | null;
  errorMessage: string | null;
};

type Action =
  | { type: 'indexLoaded'; resources: ResourceSummary[]; conversations: ConversationSummary[] }
  | { type: 'loading'; value: boolean }
  | { type: 'resourceSelected'; resourceId: string | null }
  | { type: 'resourceDetailsLoaded'; resource: ResourceDetail | null }
  | { type: 'conversationLoaded'; conversation: ConversationDetail }
  | { type: 'conversationCreated'; conversation: ConversationDetail; summary: ConversationSummary }
  | { type: 'conversationsLoaded'; conversations: ConversationSummary[] }
  | { type: 'draft'; content: ConversationMessageType['content'] }
  | { type: 'clearDraft'; message: string | null }
  | { type: 'event'; event: ConversationSseEvent }
  | { type: 'requestFailed'; message: string }
  | { type: 'turnInterrupted' }
  | { type: 'turnCancelled' };

const initialState: ChatState = {
  resources: [],
  resourceDetails: null,
  conversations: [],
  selectedResourceId: null,
  conversation: null,
  loading: true,
  status: 'idle',
  activeTurnId: null,
  progressSteps: [],
  pendingDraft: null,
  errorMessage: null,
};

export function useChatWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const controllerRef = useRef<AbortController | null>(null);
  const loadVersionRef = useRef(0);

  const refreshConversationList = useCallback(async () => {
    const conversations = await conversationApi.list();
    dispatch({ type: 'conversationsLoaded', conversations });
  }, []);

  const openConversation = useCallback(async (conversationId: string) => {
    controllerRef.current?.abort('navigation');
    controllerRef.current = null;
    const version = ++loadVersionRef.current;
    dispatch({ type: 'loading', value: true });
    try {
      const conversation = await conversationApi.get(conversationId);
      if (version === loadVersionRef.current) {
        dispatch({ type: 'conversationLoaded', conversation });
        const resource = await resourceApi.get(conversation.resourceId);
        if (version === loadVersionRef.current)
          dispatch({ type: 'resourceDetailsLoaded', resource });
      }
    } catch (error) {
      if (version === loadVersionRef.current) {
        dispatch({ type: 'requestFailed', message: getErrorMessage(error, '读取会话失败') });
      }
    } finally {
      if (version === loadVersionRef.current) dispatch({ type: 'loading', value: false });
    }
  }, []);

  useEffect(() => {
    const version = loadVersionRef.current + 1;
    loadVersionRef.current = version;
    const isCurrent = () => loadVersionRef.current === version;
    void Promise.all([resourceApi.list(), conversationApi.list()])
      .then(async ([resourceResult, conversations]) => {
        if (!isCurrent()) return;
        const activeResources = resourceResult.items.filter(
          (resource) => resource.status === 'active',
        );
        const selectedResourceId = activeResources[0]?.id ?? null;
        dispatch({ type: 'indexLoaded', resources: activeResources, conversations });
        if (selectedResourceId) {
          const resource = await resourceApi.get(selectedResourceId);
          if (isCurrent()) dispatch({ type: 'resourceDetailsLoaded', resource });
        }
        if (conversations.length > 0) {
          const recentConversation = conversations[0];
          const conversation = await conversationApi.get(recentConversation.id);
          if (isCurrent()) {
            dispatch({ type: 'conversationLoaded', conversation });
            const resource = await resourceApi.get(conversation.resourceId);
            if (isCurrent()) dispatch({ type: 'resourceDetailsLoaded', resource });
          }
        }
      })
      .catch((error: unknown) => {
        if (isCurrent())
          dispatch({
            type: 'requestFailed',
            message: getErrorMessage(error, '加载问数工作台失败'),
          });
      })
      .finally(() => {
        if (isCurrent()) dispatch({ type: 'loading', value: false });
      });

    return () => {
      if (isCurrent()) loadVersionRef.current += 1;
      controllerRef.current?.abort('navigation');
      controllerRef.current = null;
    };
  }, []);

  const selectResource = useCallback(async (resourceId: string | null) => {
    dispatch({ type: 'resourceSelected', resourceId });
    if (!resourceId) {
      dispatch({ type: 'resourceDetailsLoaded', resource: null });
      return;
    }
    try {
      const resource = await resourceApi.get(resourceId);
      dispatch({ type: 'resourceDetailsLoaded', resource });
    } catch (error) {
      dispatch({ type: 'requestFailed', message: getErrorMessage(error, '读取资源推荐问题失败') });
    }
  }, []);

  const createConversation = useCallback(async () => {
    if (!state.selectedResourceId) return null;
    dispatch({ type: 'loading', value: true });
    try {
      const summary = await conversationApi.create({
        resourceId: state.selectedResourceId,
        title: null,
      });
      const conversation = await conversationApi.get(summary.id);
      dispatch({ type: 'conversationCreated', conversation, summary });
      await refreshConversationList();
      return conversation;
    } catch (error) {
      dispatch({ type: 'requestFailed', message: getErrorMessage(error, '创建问数会话失败') });
      return null;
    } finally {
      dispatch({ type: 'loading', value: false });
    }
  }, [refreshConversationList, state.selectedResourceId]);

  const submitTurn = useCallback(
    async (
      input: ConversationTurnInput['input'],
      localContent: ConversationMessageType['content'],
    ) => {
      if (
        state.status === 'submitting' ||
        state.status === 'understanding' ||
        state.status === 'executing'
      ) {
        return;
      }
      let conversation = state.conversation;
      conversation ??= await createConversation();
      if (!conversation) return;

      const controller = new AbortController();
      controllerRef.current = controller;
      const viewVersion = loadVersionRef.current;
      dispatch({ type: 'draft', content: localContent });
      const request: ConversationTurnInput = { requestId: crypto.randomUUID(), input };
      let completed = false;
      try {
        const result = await conversationApi.submitTurn(
          conversation.id,
          request,
          controller.signal,
          (event) => {
            if (event.conversationId !== conversation.id || event.requestId !== request.requestId)
              return;
            completed ||= event.type === 'turn.completed';
            dispatch({ type: 'event', event });
          },
        );
        completed ||= result.completed;
        if (!completed && !controller.signal.aborted) dispatch({ type: 'turnInterrupted' });
        const refreshed = await conversationApi.get(conversation.id);
        if (loadVersionRef.current === viewVersion && controllerRef.current === controller) {
          dispatch({ type: 'conversationLoaded', conversation: refreshed });
          await refreshConversationList();
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          dispatch({
            type: 'requestFailed',
            message: getErrorMessage(error, '问数请求失败，请重试'),
          });
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [createConversation, refreshConversationList, state.conversation, state.status],
  );

  const ask = useCallback(
    (text: string) => {
      const normalized = text.trim();
      if (!normalized) return;
      return submitTurn(
        { kind: 'question', text: normalized },
        { kind: 'question', text: normalized },
      );
    },
    [submitTurn],
  );

  const answerClarification = useCallback(
    (input: { optionId?: string; answerText?: string; displayText: string }) => {
      const pending = state.conversation?.pendingClarification;
      if (pending?.kind !== 'clarification') return;
      return submitTurn(
        {
          kind: 'clarification',
          clarificationId: pending.clarificationId,
          ...(input.optionId ? { optionId: input.optionId } : {}),
          ...(input.answerText ? { answerText: input.answerText } : {}),
        },
        {
          kind: 'clarification_answer',
          clarificationId: pending.clarificationId,
          answerText: input.displayText,
          optionLabel: input.optionId ? input.displayText : null,
        },
      );
    },
    [state.conversation?.pendingClarification, submitTurn],
  );

  const cancelTurn = useCallback(async () => {
    const conversation = state.conversation;
    const turnId = state.activeTurnId;
    if (!conversation || !turnId) return;
    try {
      await conversationApi.cancelTurn(conversation.id, turnId);
      controllerRef.current?.abort('cancelled');
      controllerRef.current = null;
      dispatch({ type: 'turnCancelled' });
      const refreshed = await conversationApi.get(conversation.id);
      dispatch({ type: 'conversationLoaded', conversation: refreshed });
      await refreshConversationList();
    } catch (error) {
      dispatch({ type: 'requestFailed', message: getErrorMessage(error, '取消本轮失败') });
    }
  }, [refreshConversationList, state.activeTurnId, state.conversation]);

  return {
    ...state,
    openConversation,
    selectResource,
    createConversation,
    ask,
    answerClarification,
    cancelTurn,
  };
}

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'indexLoaded':
      return {
        ...state,
        resources: action.resources,
        conversations: action.conversations,
        selectedResourceId:
          state.selectedResourceId ?? (action.resources.length > 0 ? action.resources[0].id : null),
      };
    case 'loading':
      return { ...state, loading: action.value };
    case 'resourceSelected':
      return { ...state, selectedResourceId: action.resourceId };
    case 'resourceDetailsLoaded':
      return { ...state, resourceDetails: action.resource };
    case 'conversationLoaded':
      return {
        ...state,
        conversation: action.conversation,
        selectedResourceId: state.resources.some(
          (resource) => resource.id === action.conversation.resourceId,
        )
          ? action.conversation.resourceId
          : state.selectedResourceId,
        ...stateFromConversation(action.conversation),
        progressSteps: [],
        pendingDraft: null,
        errorMessage: null,
      };
    case 'conversationCreated':
      return {
        ...state,
        conversation: action.conversation,
        conversations: [
          action.summary,
          ...state.conversations.filter((item) => item.id !== action.summary.id),
        ],
        ...stateFromConversation(action.conversation),
        progressSteps: [],
        pendingDraft: null,
        errorMessage: null,
      };
    case 'conversationsLoaded':
      return { ...state, conversations: action.conversations };
    case 'draft':
      return {
        ...state,
        pendingDraft: action.content,
        progressSteps: [],
        status: 'submitting',
        errorMessage: null,
      };
    case 'clearDraft':
      return { ...state, pendingDraft: null, status: 'failed', errorMessage: action.message };
    case 'event':
      return reduceEvent(state, action.event);
    case 'requestFailed':
      return { ...state, pendingDraft: null, status: 'failed', errorMessage: action.message };
    case 'turnInterrupted':
      return { ...state, pendingDraft: null, status: 'interrupted', activeTurnId: null };
    case 'turnCancelled':
      return { ...state, pendingDraft: null, status: 'cancelled', activeTurnId: null };
  }
}

function reduceEvent(state: ChatState, event: ConversationSseEvent): ChatState {
  if (state.conversation && event.conversationId !== state.conversation.id) return state;
  if (event.type === 'turn.started') {
    const messages = state.pendingDraft
      ? appendMessage(state.conversation, {
          id: crypto.randomUUID(),
          role: 'user',
          turnId: event.turnId,
          content: state.pendingDraft,
          createdAt: new Date().toISOString(),
        })
      : (state.conversation?.messages ?? []);
    return {
      ...state,
      conversation: state.conversation ? { ...state.conversation, messages } : null,
      pendingDraft: null,
      progressSteps: [],
      status: 'understanding',
      activeTurnId: event.turnId,
    };
  }
  if (event.type === 'stage') {
    if (event.turnId !== state.activeTurnId) return state;
    return { ...state, status: event.stage };
  }
  if (event.type === 'progress') {
    if (event.turnId !== state.activeTurnId) return state;
    const stepsByNumber = new Map(state.progressSteps.map((step) => [step.step, step]));
    stepsByNumber.set(event.step, event);
    return {
      ...state,
      progressSteps: [...stepsByNumber.values()].sort((left, right) => left.step - right.step),
    };
  }
  if (event.type === 'clarification.required') {
    if (event.turnId !== state.activeTurnId || !state.conversation) return state;
    const content: ConversationMessageType['content'] = {
      kind: 'clarification',
      clarificationId: event.clarificationId,
      question: event.question,
      options: event.options,
      allowFreeText: event.allowFreeText,
      processSteps: event.processSteps,
    };
    return {
      ...state,
      conversation: {
        ...state.conversation,
        messages: appendMessage(state.conversation, {
          id: crypto.randomUUID(),
          role: 'assistant',
          turnId: event.turnId,
          content,
          createdAt: new Date().toISOString(),
        }),
        pendingClarification: content,
      },
      status: 'clarification_required',
    };
  }
  if (event.type === 'result') {
    if (event.turnId !== state.activeTurnId || !state.conversation) return state;
    const {
      type: _type,
      conversationId: _conversationId,
      requestId: _requestId,
      turnId,
      ...resultPayload
    } = event;
    const result = queryResultSchema.parse(resultPayload);
    return {
      ...state,
      conversation: {
        ...state.conversation,
        messages: appendMessage(state.conversation, {
          id: crypto.randomUUID(),
          role: 'assistant',
          turnId,
          content: { kind: 'answer', result },
          createdAt: new Date().toISOString(),
        }),
        pendingClarification: null,
      },
      status: result.rowCount === 0 ? 'empty' : 'succeeded',
    };
  }
  if (event.type === 'error') {
    if (event.turnId !== state.activeTurnId || !state.conversation) return state;
    return {
      ...state,
      conversation: {
        ...state.conversation,
        messages: appendMessage(state.conversation, {
          id: crypto.randomUUID(),
          role: 'assistant',
          turnId: event.turnId,
          content: {
            kind: 'error',
            code: event.code,
            message: event.message,
            processSteps: event.processSteps,
          },
          createdAt: new Date().toISOString(),
        }),
        pendingClarification: null,
      },
      status: 'failed',
      errorMessage: event.message,
    };
  }
  if (event.turnId === state.activeTurnId) {
    const status =
      event.status === 'awaiting_clarification' ? 'clarification_required' : event.status;
    return {
      ...state,
      status,
      activeTurnId: status === 'clarification_required' ? event.turnId : null,
    };
  }
  return state;
}

function stateFromConversation(
  conversation: ConversationDetail,
): Pick<ChatState, 'status' | 'activeTurnId'> {
  if (conversation.pendingClarification?.kind === 'clarification') {
    const lastMessage = conversation.messages.at(-1);
    return { status: 'clarification_required', activeTurnId: lastMessage?.turnId ?? null };
  }
  const lastMessage = conversation.messages.at(-1);
  if (lastMessage?.content.kind === 'error') {
    if (lastMessage.content.code === 'TURN_CANCELLED')
      return { status: 'cancelled', activeTurnId: null };
    if (lastMessage.content.code === 'TURN_INTERRUPTED')
      return { status: 'interrupted', activeTurnId: null };
    return { status: 'failed', activeTurnId: null };
  }
  if (lastMessage?.content.kind === 'answer') {
    return {
      status: lastMessage.content.result.rowCount === 0 ? 'empty' : 'succeeded',
      activeTurnId: null,
    };
  }
  return { status: 'idle', activeTurnId: null };
}

function appendMessage(conversation: ConversationDetail | null, message: ConversationMessageType) {
  return [...(conversation?.messages ?? []), message];
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : fallback;
}
