import { useState } from 'react';
import { Column, Line } from '@ant-design/charts';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Input,
  Segmented,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd';
import type { ConversationMessage, QueryResult } from '@smartq/contracts';
import { QueryProcessHistory } from './QueryProcess';

const { Paragraph, Text } = Typography;

type Props = {
  message: ConversationMessage;
  isPendingClarification: boolean;
  disabled: boolean;
  onAnswerClarification: (input: {
    optionId?: string;
    answerText?: string;
    displayText: string;
  }) => void;
};

export function ChatMessage({
  message,
  isPendingClarification,
  disabled,
  onAnswerClarification,
}: Props) {
  const content = message.content;
  if (content.kind === 'question' || content.kind === 'clarification_answer') {
    return (
      <div className="chat-message chat-message-user">
        <div className="chat-message-avatar">我</div>
        <div className="chat-message-body chat-user-bubble">
          {content.kind === 'question' ? content.text : content.answerText}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-message chat-message-assistant">
      <div className="chat-message-avatar chat-assistant-avatar">Q</div>
      <div className="chat-message-body">
        {content.kind === 'clarification' ? (
          <ClarificationMessage
            content={content}
            isPending={isPendingClarification}
            disabled={disabled}
            onAnswer={onAnswerClarification}
          />
        ) : content.kind === 'answer' ? (
          <ResultMessage result={content.result} />
        ) : (
          <div className="chat-error-message">
            <Alert showIcon type="error" message={content.message} />
            <QueryProcessHistory steps={content.processSteps} />
          </div>
        )}
      </div>
    </div>
  );
}

function ClarificationMessage({
  content,
  isPending,
  disabled,
  onAnswer,
}: {
  content: Extract<ConversationMessage['content'], { kind: 'clarification' }>;
  isPending: boolean;
  disabled: boolean;
  onAnswer: Props['onAnswerClarification'];
}) {
  const [answerText, setAnswerText] = useState('');
  return (
    <Card size="small" className="chat-clarification-card">
      <Text strong>{content.question}</Text>
      <div className="chat-clarification-options">
        {content.options.map((option) => (
          <Button
            key={option.id}
            disabled={!isPending || disabled}
            onClick={() => {
              onAnswer({ optionId: option.id, displayText: option.label });
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {isPending && content.allowFreeText ? (
        <Space.Compact className="chat-clarification-input">
          <Input
            value={answerText}
            maxLength={500}
            placeholder="也可以补充说明"
            onChange={(event) => {
              setAnswerText(event.target.value);
            }}
            onPressEnter={() => {
              if (answerText.trim()) {
                onAnswer({ answerText: answerText.trim(), displayText: answerText.trim() });
              }
            }}
          />
          <Button
            type="primary"
            disabled={disabled || !answerText.trim()}
            onClick={() => {
              onAnswer({ answerText: answerText.trim(), displayText: answerText.trim() });
            }}
          >
            确认
          </Button>
        </Space.Compact>
      ) : null}
      {!isPending ? <Text type="secondary">本轮澄清已处理</Text> : null}
      <QueryProcessHistory steps={content.processSteps} />
    </Card>
  );
}

function ResultMessage({ result }: { result: QueryResult }) {
  const [chartType, setChartType] = useState<QueryResult['chart']['recommended']>(
    result.chart.recommended,
  );
  const tableColumns = result.columns.map((column) => ({
    title: (
      <span>
        {column.label}
        {column.unit ? <Text type="secondary">（{column.unit}）</Text> : null}
      </span>
    ),
    dataIndex: column.key,
    key: column.key,
    render: renderCellValue,
  }));
  const chartData = result.rows
    .map((row) => ({
      x: String(
        result.chart.xKey ? (row[result.chart.xKey] ?? '') : result.interpretation.metric.label,
      ),
      y: Number(row[result.chart.yKey]),
    }))
    .filter((row) => row.x.length > 0 && Number.isFinite(row.y));

  return (
    <div className="chat-result">
      <Paragraph className="chat-result-answer">{result.answer}</Paragraph>
      <div className="chat-result-tags">
        <Text type="secondary">指标：{result.interpretation.metric.label}</Text>
        {result.interpretation.dimensions.map((dimension) => (
          <Text key={dimension} type="secondary">
            维度：{dimension}
          </Text>
        ))}
        {result.interpretation.timeRangeLabel ? (
          <Text type="secondary">时间：{result.interpretation.timeRangeLabel}</Text>
        ) : null}
        {result.interpretation.filters.map((filter, index) => (
          <Text key={`${filter.label}-${String(index)}`} type="secondary">
            {filter.label}
            {filter.description}
          </Text>
        ))}
      </div>
      {result.rowCount > 0 ? (
        <Card size="small" className="chat-result-card">
          <div className="chat-result-card-heading">
            <Text strong>查询结果</Text>
            {result.chart.available.length > 1 ? (
              <Segmented
                size="small"
                value={chartType}
                options={result.chart.available.map((type) => ({
                  value: type,
                  label: { table: '表格', metric: '指标卡', bar: '柱状图', line: '折线图' }[type],
                }))}
                onChange={(value) => {
                  setChartType(value);
                }}
              />
            ) : null}
          </div>
          {chartType === 'table' || !result.chart.available.includes(chartType) ? (
            <Table
              rowKey={(_row, index) => String(index)}
              size="small"
              pagination={false}
              scroll={{ x: true, y: 320 }}
              columns={tableColumns}
              dataSource={result.rows}
            />
          ) : chartType === 'metric' ? (
            <div className="chat-metric-result">
              <Statistic
                title={result.interpretation.metric.label}
                value={String(result.rows[0]?.[result.chart.yKey] ?? '—')}
                suffix={
                  result.columns.find((column) => column.key === result.chart.yKey)?.unit ??
                  undefined
                }
              />
            </div>
          ) : chartType === 'line' ? (
            <Line data={chartData} xField="x" yField="y" height={280} />
          ) : (
            <Column data={chartData} xField="x" yField="y" height={280} />
          )}
          {result.truncated ? (
            <Alert banner type="warning" message="结果已达到本轮行数上限，已显示部分数据。" />
          ) : null}
        </Card>
      ) : (
        <Alert showIcon type="info" message="没有匹配的数据" description={result.answer} />
      )}
      <Collapse
        size="small"
        items={[
          {
            key: 'sql',
            label: '查看本次查询 SQL',
            children: <pre className="chat-sql-text">{result.sqlText}</pre>,
          },
        ]}
      />
      <Text className="chat-result-duration" type="secondary">
        返回 {result.rowCount} 行 · 查询耗时 {result.durationMs} 毫秒
      </Text>
      <QueryProcessHistory steps={result.processSteps} />
    </div>
  );
}

function renderCellValue(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
