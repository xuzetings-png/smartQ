import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Form } from 'antd';
import { expect, it } from 'vitest';
import { ResourceMetricsEditor } from '../src/features/resource/components/ResourceMetricsEditor.tsx';

it('资源字段观察值尚未就绪时仍能渲染指标编辑器', () => {
  function EditorHarness() {
    const [form] = Form.useForm();
    return createElement(
      Form,
      {
        form,
        initialValues: {
          fields: [{ enabled: true, semanticRole: 'metric' }],
          metrics: [],
        },
      },
      createElement(ResourceMetricsEditor, {
        form,
        sourceFields: [
          {
            id: 'amount',
            columnName: 'amount',
            displayName: '销售额',
            mysqlType: 'decimal(12,2)',
          },
        ],
      }),
    );
  }

  expect(() => renderToStaticMarkup(createElement(EditorHarness))).not.toThrow();
});
