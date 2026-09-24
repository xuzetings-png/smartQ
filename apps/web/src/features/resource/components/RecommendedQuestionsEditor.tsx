import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, Space } from 'antd';

export function RecommendedQuestionsEditor() {
  return (
    <Form.List name="recommendedQuestions">
      {(questions, { add, remove }) => (
        <Space direction="vertical" className="full-width">
          {questions.map((question) => (
            <Space key={question.key} className="full-width" align="start">
              <Form.Item
                className="recommended-question-input"
                name={question.name}
                rules={[{ required: true, whitespace: true, message: '推荐问题不能为空' }]}
              >
                <Input placeholder="例如：按城市统计销售额" />
              </Form.Item>
              <Button
                danger
                type="text"
                aria-label="删除推荐问题"
                icon={<DeleteOutlined />}
                onClick={() => {
                  remove(question.name);
                }}
              />
            </Space>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            disabled={questions.length >= 4}
            onClick={() => {
              add('');
            }}
          >
            添加推荐问题
          </Button>
        </Space>
      )}
    </Form.List>
  );
}
