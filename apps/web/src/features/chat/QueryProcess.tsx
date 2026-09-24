import { CheckCircleFilled } from '@ant-design/icons';
import { Collapse, Spin, Typography } from 'antd';
import type { ConversationSseEvent } from '@smartq/contracts';

const { Text } = Typography;

export type QueryProgressStep = Extract<ConversationSseEvent, { type: 'progress' }>;

export function ActiveQueryProcess({ steps }: { steps: QueryProgressStep[] }) {
  if (steps.length === 0) return null;

  return (
    <section className="ask-query-process-live" aria-live="polite" aria-label="问数过程">
      <Text strong>问数过程</Text>
      <ol className="ask-query-process-list">
        {steps.map((step) => (
          <li key={step.step} className="ask-query-process-step">
            <span className="ask-query-process-icon">
              {step.status === 'completed' ? (
                <CheckCircleFilled className="ask-query-process-complete" />
              ) : (
                <Spin size="small" />
              )}
            </span>
            <Text type={step.status === 'completed' ? 'secondary' : undefined}>{step.message}</Text>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function QueryProcessHistory({ steps }: { steps: string[] | undefined }) {
  if (!steps?.length) return null;

  return (
    <Collapse
      size="small"
      className="chat-query-process-history"
      items={[
        {
          key: 'process',
          label: `查看问数过程（${String(steps.length)}步）`,
          children: (
            <ol className="ask-query-process-list ask-query-process-history-list">
              {steps.map((message, index) => (
                <li key={`${String(index)}-${message}`} className="ask-query-process-step">
                  <span className="ask-query-process-icon">
                    <CheckCircleFilled className="ask-query-process-complete" />
                  </span>
                  <Text type="secondary">{message}</Text>
                </li>
              ))}
            </ol>
          ),
        },
      ]}
    />
  );
}
