import { useEffect, useState } from 'react';
import { ApiOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, message, Space, Spin, Tag, Typography } from 'antd';
import { modelApi } from './modelApi';
import type { ModelConfigSummary } from '@smartq/contracts';

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL_ID = 'qwen-plus';

type ModelFormValues = {
  baseUrl: string;
  modelId: string;
  apiKey: string;
};

export function ModelConfigPage() {
  const [form] = Form.useForm<ModelFormValues>();
  const [messageApi, messageContext] = message.useMessage();
  const [config, setConfig] = useState<ModelConfigSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSucceeded, setTestSucceeded] = useState(false);
  const [responseTimeMs, setResponseTimeMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void modelApi
      .getConfig()
      .then((savedConfig) => {
        if (!isCurrent) return;
        setConfig(savedConfig);
        form.setFieldsValue({
          baseUrl: savedConfig.configured ? savedConfig.baseUrl : DEFAULT_BASE_URL,
          modelId: savedConfig.configured ? savedConfig.modelId : DEFAULT_MODEL_ID,
          apiKey: '',
        });
      })
      .catch((error: unknown) => {
        if (isCurrent) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [form]);

  const handleTest = async () => {
    setErrorMessage(null);
    try {
      const values = await form.validateFields();
      setTesting(true);
      const apiKey = values.apiKey.trim();
      const result = await modelApi.test({
        baseUrl: values.baseUrl.trim(),
        modelId: values.modelId.trim(),
        ...(apiKey
          ? { apiKey, useSavedKey: false }
          : { useSavedKey: Boolean(config?.configured && config.apiKeyConfigured) }),
      });
      setTestSucceeded(true);
      setResponseTimeMs(result.responseTimeMs);
      messageApi.success('模型服务连通性测试通过');
    } catch (error) {
      if (isFormValidationError(error)) {
        setErrorMessage('请先检查标红的配置项，补全后再测试连接。');
        return;
      }
      setTestSucceeded(false);
      setResponseTimeMs(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    try {
      const values = await form.validateFields();
      setSaving(true);
      const apiKey = values.apiKey.trim();
      const savedConfig = await modelApi.save({
        baseUrl: values.baseUrl.trim(),
        modelId: values.modelId.trim(),
        ...(apiKey ? { apiKey } : {}),
      });
      setConfig(savedConfig);
      form.setFieldValue('apiKey', '');
      setTestSucceeded(false);
      setResponseTimeMs(null);
      messageApi.success('模型配置已加密保存并设为默认模型');
    } catch (error) {
      if (isFormValidationError(error)) {
        setErrorMessage('请先检查标红的配置项，补全后再保存。');
        return;
      }
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="model-page-loading">
        <Spin tip="正在读取模型配置" />
      </div>
    );
  }

  return (
    <div className="model-config-page">
      {messageContext}
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>模型配置</Typography.Title>
          <Typography.Paragraph>
            配置阿里云百炼兼容接口，为后续自然语言问数提供模型能力。
          </Typography.Paragraph>
        </div>
        <Tag color={config?.configured && config.enabled ? 'success' : 'default'}>
          {config?.configured && config.enabled ? '已启用' : '未配置'}
        </Tag>
      </div>

      <Card
        className="model-config-card"
        title={
          <>
            <ApiOutlined /> 默认模型
          </>
        }
      >
        {errorMessage && (
          <Alert
            className="model-config-error"
            type="error"
            showIcon
            message={errorMessage}
            closable
            onClose={() => {
              setErrorMessage(null);
            }}
          />
        )}

        <Form<ModelFormValues>
          form={form}
          layout="vertical"
          requiredMark="optional"
          initialValues={{
            baseUrl: DEFAULT_BASE_URL,
            modelId: DEFAULT_MODEL_ID,
            apiKey: '',
          }}
          onValuesChange={() => {
            setTestSucceeded(false);
            setResponseTimeMs(null);
            setErrorMessage(null);
          }}
        >
          <Form.Item
            label="百炼服务地址"
            name="baseUrl"
            rules={[
              { required: true, message: '请输入百炼服务地址' },
              { type: 'url', message: '请输入完整的服务地址，例如 https://example.com/v1' },
            ]}
          >
            <Input placeholder={DEFAULT_BASE_URL} autoComplete="url" />
          </Form.Item>

          <Form.Item
            label="模型名称"
            name="modelId"
            rules={[{ required: true, message: '请输入模型名称' }]}
            extra="例如 qwen-plus；请填写百炼控制台中已开通的模型名称。"
          >
            <Input placeholder={DEFAULT_MODEL_ID} />
          </Form.Item>

          <Form.Item
            label="API Key"
            name="apiKey"
            required={!(config?.configured && config.apiKeyConfigured)}
            rules={
              config?.configured && config.apiKeyConfigured
                ? []
                : [{ required: true, whitespace: true, message: '请输入百炼 API Key' }]
            }
            extra={
              config?.configured && config.apiKeyConfigured
                ? `已保存密钥 ${config.apiKeyMasked ?? '••••••••'}。留空即可沿用；输入新密钥会替换原密钥。`
                : '密钥会在服务端使用 AES-256-GCM 加密后保存。'
            }
          >
            <Input.Password
              placeholder={
                config?.configured && config.apiKeyConfigured
                  ? '留空表示沿用已保存的密钥'
                  : '请输入百炼 API Key'
              }
              autoComplete="new-password"
              maxLength={4096}
            />
          </Form.Item>
        </Form>

        <Alert
          className="model-security-note"
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="API Key 仅在服务端解密并调用模型；配置读取接口不会返回密钥明文或密文。"
        />

        {config?.configured && config.lastTestAt && (
          <Typography.Paragraph className="model-last-tested" type="secondary">
            最近成功保存并测试：{formatDate(config.lastTestAt)}
          </Typography.Paragraph>
        )}

        {testSucceeded && responseTimeMs !== null && (
          <Alert
            className="model-test-success"
            type="success"
            showIcon
            message={`连接成功，响应耗时 ${String(responseTimeMs)} 毫秒。保存时服务端会再次验证。`}
          />
        )}

        <div className="model-config-actions">
          <Space>
            <Button onClick={() => void handleTest()} loading={testing}>
              测试连接
            </Button>
            <Button
              type="primary"
              onClick={() => void handleSave()}
              loading={saving}
              disabled={!testSucceeded || testing}
            >
              测试通过后保存并启用
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

function isFormValidationError(error: unknown) {
  return typeof error === 'object' && error !== null && 'errorFields' in error;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}
