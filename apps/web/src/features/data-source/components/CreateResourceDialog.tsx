import { Form, Input, Modal, Typography } from 'antd';
import type { FormInstance } from 'antd';

const { Paragraph } = Typography;

export type CreateResourceForm = { displayName: string };

type Props = {
  open: boolean;
  tableName: string;
  form: FormInstance<CreateResourceForm>;
  onCancel: () => void;
  onCreate: (values: CreateResourceForm) => void;
};

export function CreateResourceDialog({ open, tableName, form, onCancel, onCreate }: Props) {
  return (
    <Modal
      title="创建问数资源"
      open={open}
      okText="创建草稿"
      cancelText="取消"
      onCancel={onCancel}
      onOk={() => {
        form.submit();
      }}
    >
      <Paragraph type="secondary">资源把数据表包装成问数用户可以选择和提问的数据范围。</Paragraph>
      <Form form={form} layout="vertical" onFinish={onCreate}>
        <Form.Item
          name="displayName"
          label="资源名称"
          rules={[{ required: true, whitespace: true, message: '请输入资源名称' }]}
        >
          <Input maxLength={80} placeholder="例如：订单数据" />
        </Form.Item>
        <Form.Item label="来源数据表">{tableName}</Form.Item>
      </Form>
    </Modal>
  );
}
