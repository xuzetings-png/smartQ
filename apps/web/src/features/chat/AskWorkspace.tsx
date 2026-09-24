import { useEffect, useRef, useState } from 'react';
import { Button, Card, Empty, Input, List, Select, Space, Spin, Tag, Typography } from 'antd';
import { MessageOutlined, PlusOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import type { ConversationMessage } from '@smartq/contracts';
import { ChatMessage } from './ChatMessage';
import { ActiveQueryProcess } from './QueryProcess';
import { useChatWorkspace } from './useChatWorkspace';

const { Paragraph, Text, Title } = Typography;

const statusLabels: Record<string, string> = {
  submitting: '正在提交',
  understanding: '正在理解问题',
  executing: '正在查询数据',
  clarification_required: '等待你补充信息',
  succeeded: '查询完成',
  empty: '没有匹配数据',
  failed: '本轮未完成',
  cancelled: '本轮已取消',
  interrupted: '连接中断',
  idle: '可以开始提问',
};

export function AskWorkspace() {
  const workspace = useChatWorkspace();
  const [question, setQuestion] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversation = workspace.conversation;
  const isBusy = ['submitting', 'understanding', 'executing'].includes(workspace.status);
  const isWaitingForClarification = workspace.status === 'clarification_required';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [
    conversation?.messages.length,
    workspace.status,
    workspace.pendingDraft,
    workspace.progressSteps.length,
  ]);

  const handleSubmit = () => {
    const text = question.trim();
    if (!text || isBusy || isWaitingForClarification) return;
    setQuestion('');
    void workspace.ask(text);
  };

  const resourceDetails =
    workspace.resourceDetails?.id === workspace.selectedResourceId
      ? workspace.resourceDetails
      : null;

  return (
    <div className="ask-workspace">
      <aside className="ask-sidebar">
        <Card
          size="small"
          className="ask-sidebar-card"
          title="问数会话"
          extra={
            <Button
              aria-label="新建会话"
              type="text"
              size="small"
              icon={<PlusOutlined />}
              disabled={!workspace.resources.length || workspace.loading}
              onClick={() => void workspace.createConversation()}
            />
          }
        >
          <div className="ask-resource-picker">
            <Text type="secondary">新会话使用的数据资源</Text>
            <Select
              value={workspace.selectedResourceId ?? undefined}
              placeholder="选择已发布资源"
              className="full-width"
              options={workspace.resources.map((resource) => ({
                value: resource.id,
                label: resource.displayName,
              }))}
              onChange={(resourceId: string) => void workspace.selectResource(resourceId)}
              notFoundContent="暂无已发布资源"
            />
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="ask-new-conversation"
            disabled={!workspace.selectedResourceId || workspace.loading}
            onClick={() => void workspace.createConversation()}
          >
            新建会话
          </Button>
          <div className="ask-session-list" aria-label="历史会话">
            {workspace.conversations.length > 0 ? (
              <List
                dataSource={workspace.conversations}
                renderItem={(item) => (
                  <List.Item
                    key={item.id}
                    className={`ask-session-item${conversation?.id === item.id ? ' selected' : ''}`}
                    onClick={() => void workspace.openConversation(item.id)}
                  >
                    <button type="button" className="ask-session-button">
                      <span className="ask-session-title">{item.title}</span>
                      <span className="ask-session-resource">{item.resourceName}</span>
                    </button>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有会话" />
            )}
          </div>
        </Card>
      </aside>

      <main className="ask-main">
        <div className="ask-main-heading">
          <div>
            <Title level={3}>{conversation?.title ?? '问数工作台'}</Title>
            <Paragraph type="secondary">
              {conversation
                ? `当前资源：${conversation.resourceName}。一个会话固定使用同一份资源配置。`
                : '选择一个已发布资源，直接用自然语言提问。'}
            </Paragraph>
          </div>
          <Space>
            {conversation ? <Tag color="blue">{conversation.resourceName}</Tag> : null}
            <Tag color={isBusy ? 'processing' : isWaitingForClarification ? 'warning' : 'default'}>
              {statusLabels[workspace.status] ?? '可以开始提问'}
            </Tag>
            {workspace.activeTurnId && (isBusy || isWaitingForClarification) ? (
              <Button icon={<StopOutlined />} onClick={() => void workspace.cancelTurn()}>
                取消本轮
              </Button>
            ) : null}
          </Space>
        </div>

        {workspace.errorMessage ? (
          <div className="ask-error-banner" role="alert">
            {workspace.errorMessage}
          </div>
        ) : null}

        <Card className="ask-conversation-card" styles={{ body: { padding: 0 } }}>
          {workspace.loading && !conversation ? (
            <div className="ask-loading">
              <Spin tip="正在加载问数工作台" />
            </div>
          ) : !conversation ? (
            <div className="ask-welcome">
              <Empty
                image={<MessageOutlined />}
                description={
                  workspace.resources.length ? '选择资源后开始一个新会话' : '还没有已发布资源'
                }
              />
              {!workspace.resources.length ? (
                <Text type="secondary">请先切换到管理员视图，连接数据源并发布问数资源。</Text>
              ) : (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => void workspace.createConversation()}
                >
                  开始新会话
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="ask-message-list" aria-live="polite">
                {!conversation.messages.length ? (
                  <div className="ask-recommendations">
                    <div className="ask-recommendations-heading">
                      <MessageOutlined />
                      <Text strong>可以这样提问</Text>
                    </div>
                    {resourceDetails?.recommendedQuestions.length ? (
                      resourceDetails.recommendedQuestions.map((item) => (
                        <Button
                          key={item}
                          className="ask-recommendation"
                          disabled={isBusy}
                          onClick={() => void workspace.ask(item)}
                        >
                          {item}
                        </Button>
                      ))
                    ) : (
                      <Text type="secondary">直接输入你想了解的指标、时间范围或分类维度。</Text>
                    )}
                  </div>
                ) : (
                  conversation.messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      isPendingClarification={
                        conversation.pendingClarification?.kind === 'clarification' &&
                        message.content.kind === 'clarification' &&
                        conversation.pendingClarification.clarificationId ===
                          message.content.clarificationId
                      }
                      disabled={isBusy}
                      onAnswerClarification={(answer) => void workspace.answerClarification(answer)}
                    />
                  ))
                )}
                {workspace.pendingDraft ? <DraftMessage content={workspace.pendingDraft} /> : null}
                {isBusy ? (
                  workspace.progressSteps.length ? (
                    <ActiveQueryProcess steps={workspace.progressSteps} />
                  ) : (
                    <div className="ask-progress">
                      <Spin size="small" />
                      <Text type="secondary">{statusLabels[workspace.status]}</Text>
                    </div>
                  )
                ) : null}
                <div ref={messagesEndRef} />
              </div>
              <div className="ask-composer">
                <Input.TextArea
                  value={question}
                  maxLength={1000}
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  placeholder={
                    isWaitingForClarification
                      ? '请先选择澄清选项，或取消本轮后再提新问题'
                      : '输入问题，例如：今年各城市销售额怎么样'
                  }
                  disabled={isBusy || isWaitingForClarification}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                  }}
                  onPressEnter={(event) => {
                    if (!event.shiftKey) {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <div className="ask-composer-footer">
                  <Text type="secondary">Enter 发送，Shift + Enter 换行</Text>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    disabled={!question.trim() || isBusy || isWaitingForClarification}
                    onClick={handleSubmit}
                  >
                    发送
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}

function DraftMessage({ content }: { content: ConversationMessage['content'] }) {
  const text =
    content.kind === 'question'
      ? content.text
      : content.kind === 'clarification_answer'
        ? content.answerText
        : '';
  return (
    <div className="chat-message chat-message-user">
      <div className="chat-message-avatar">我</div>
      <div className="chat-message-body chat-user-bubble">{text}</div>
    </div>
  );
}
