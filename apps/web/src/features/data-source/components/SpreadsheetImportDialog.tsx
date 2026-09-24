import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Alert, Button, Input, Modal, Select, Spin, Table, Typography, message } from 'antd';
import { InboxOutlined, UploadOutlined } from '@ant-design/icons';
import type { SpreadsheetImportPreview } from '@smartq/contracts';
import type { CreatedResource } from '../dataSourceApi';
import { useSpreadsheetImport } from '../useSpreadsheetImport';

const { Paragraph, Text } = Typography;

type Props = {
  open: boolean;
  onCancel: () => void;
  onCreated: (resource: CreatedResource) => void;
};

export function SpreadsheetImportDialog({ open, onCancel, onCreated }: Props) {
  const importer = useSpreadsheetImport();
  const [resourceName, setResourceName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [messageApi, messageContext] = message.useMessage();
  const fileInput = useRef<HTMLInputElement>(null);

  const closeDialog = () => {
    if (importer.isCreating) return;
    importer.reset();
    setResourceName('');
    setIsDragging(false);
    onCancel();
  };

  const handleFile = (file: File) => {
    setResourceName(file.name.replace(/\.[^.]+$/, '') || '导入数据');
    void importer.selectFile(file);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.item(0);
    if (file !== null && file !== undefined) handleFile(file);
    event.currentTarget.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files.item(0);
    if (file !== null) handleFile(file);
  };

  const handleCreate = async () => {
    const displayName = resourceName.trim();
    if (!displayName) {
      messageApi.error('请输入资源名称。');
      return;
    }
    if (!importer.preview) return;
    const resource = await importer.createResource(displayName);
    if (resource !== null) {
      importer.reset();
      setResourceName('');
      onCreated(resource);
    }
  };

  const columns = importer.preview ? toPreviewColumns(importer.preview) : [];
  const rows = importer.preview ? toPreviewRows(importer.preview) : [];

  return (
    <>
      {messageContext}
      <Modal
        className="spreadsheet-import-modal"
        title="导入表格创建问数资源"
        open={open}
        width={960}
        destroyOnHidden
        closable={!importer.isCreating}
        maskClosable={!importer.isCreating}
        okText="创建资源并配置"
        cancelText="取消"
        cancelButtonProps={{ disabled: importer.isCreating }}
        confirmLoading={importer.isCreating}
        okButtonProps={{ disabled: !importer.preview || importer.isPreviewing }}
        onCancel={closeDialog}
        onOk={() => {
          void handleCreate();
        }}
      >
        <Paragraph type="secondary">
          选择一个工作表创建资源。第一行作为字段名；文件和导入数据仅保存在本机。
        </Paragraph>

        <input
          ref={fileInput}
          className="spreadsheet-import-file-input"
          type="file"
          accept=".xlsx,.xls,.csv,.tsv"
          onChange={handleInputChange}
        />
        <div
          className={`spreadsheet-import-dropzone${isDragging ? ' is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => {
            setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          <InboxOutlined />
          <div className="spreadsheet-import-dropzone-copy">
            <Text strong>{importer.file?.name ?? '将表格拖到这里，或使用右侧按钮选择文件'}</Text>
            <Text type="secondary">支持 .xlsx、.xls、.csv、.tsv，文件最大 10 MiB</Text>
          </div>
          <Button
            icon={<UploadOutlined />}
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            选择文件
          </Button>
        </div>

        {importer.errorMessage && (
          <Alert
            className="spreadsheet-import-alert"
            type="error"
            showIcon
            message={importer.errorMessage}
          />
        )}

        {importer.file && (
          <div className="spreadsheet-import-resource-name">
            <Text strong>问数资源名称</Text>
            <Input
              maxLength={80}
              value={resourceName}
              placeholder="例如：订单数据"
              onChange={(event) => {
                setResourceName(event.target.value);
              }}
            />
          </div>
        )}

        {importer.isPreviewing && (
          <div className="spreadsheet-import-loading">
            <Spin tip="正在读取表格结构和样例数据" />
          </div>
        )}

        {importer.preview && !importer.isPreviewing && (
          <section className="spreadsheet-import-preview">
            <div className="spreadsheet-import-preview-toolbar">
              <div>
                <Text strong>数据预览</Text>
                <Text type="secondary">
                  {importer.preview.rowCount.toLocaleString()} 行 · {importer.preview.columnCount}{' '}
                  列 · 最多预览 20 行
                </Text>
              </div>
              {importer.preview.sheets.length > 1 && (
                <Select
                  aria-label="选择工作表"
                  value={importer.preview.selectedSheet}
                  options={importer.preview.sheets.map((sheet) => ({
                    label: sheet.name,
                    value: sheet.name,
                  }))}
                  onChange={(sheetName) => {
                    void importer.selectSheet(sheetName);
                  }}
                />
              )}
            </div>
            <Table
              rowKey={(_row, index) => String(index)}
              size="small"
              pagination={false}
              scroll={{ x: 'max-content', y: 300 }}
              columns={columns}
              dataSource={rows}
              locale={{ emptyText: '工作表中只有字段名，暂时没有数据行' }}
            />
          </section>
        )}
      </Modal>
    </>
  );
}

function toPreviewColumns(preview: SpreadsheetImportPreview) {
  return preview.columns.map((column) => ({
    title: (
      <div className="spreadsheet-import-column-heading">
        <Text>{column.name}</Text>
        <Text type="secondary">{dataTypeLabel(column.dataType)}</Text>
      </div>
    ),
    dataIndex: column.name,
    key: column.name,
    width: 180,
    ellipsis: true,
  }));
}

function toPreviewRows(preview: SpreadsheetImportPreview) {
  return preview.rows.map((row) => {
    const record: Record<string, string | number | boolean | null> = {};
    preview.columns.forEach((column, columnIndex) => {
      record[column.name] = row[columnIndex] ?? null;
    });
    return record;
  });
}

function dataTypeLabel(type: SpreadsheetImportPreview['columns'][number]['dataType']) {
  return {
    integer: '整数',
    number: '数值',
    boolean: '布尔值',
    date: '日期',
    text: '文本',
  }[type];
}
