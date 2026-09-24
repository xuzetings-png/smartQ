# 技术设计：表格文件导入问数资源

## 目标与边界

用户在“数据源管理”页导入 `.xlsx`、`.xls`、`.csv` 或 `.tsv`，选取一个工作表，填写资源名称后创建草稿；随后复用现有资源配置、发布和问数流程。导入不要求先连接 MySQL，也不保存原始上传文件，只把解析后的记录写入本地 SQLite。跨工作表关联、多个文件合并和导入后的原始文件下载不在本次范围。

资源列表、字段配置、模型规划、计划校验、结果展示和现有 MySQL 链路保持统一。查询服务根据资源对应的数据源类型选择 MySQL 或 SQLite 只读执行器。

## 页面交互

1. 数据源管理页新增“导入表格”按钮；连接 MySQL 是否已配置不影响导入。
2. 弹窗接受拖放或选择 `.xlsx`、`.xls`、`.csv`、`.tsv` 文件，单个文件最大 10 MiB。上传后默认预览第一个工作表；文件头为旧版 XLS 容器时，即使扩展名为 `.xlsx` 也按内容识别。
3. 用户可在工作表选择器中切换工作表，看到工作表行数、列数和前 20 行数据；CSV/TSV 作为单工作表处理。第一行用作字段名，空字段名按“列 N”补齐，重名字段自动追加序号。
4. 用户填写资源名称并选择“创建资源并配置”。服务端重新解析用户刚上传的文件，在一个 SQLite 事务中写入导入数据、数据源元信息、导入表元信息和资源草稿。
5. 成功后复用 `onResourceCreated` 打开资源管理页并显示该资源配置抽屉；失败时保留弹窗文件和选择状态，展示可理解的错误，便于重试。
6. 弹窗内部内容超出视口时在弹窗内滚动，页面外壳仍固定视口，不创建页面级滚动条。

## 文件解析与数据规则

- API 依赖 `exceljs` 流式读取 XLSX，依赖 SheetJS 读取旧版 XLS 二进制工作簿，并加载编码表以正确保留中文；`csv-parse` 解析 CSV/TSV，UTF-8 BOM 自动去除，TSV 固定使用制表符分隔。
- 文件格式必须受支持；XLS/XLSX 解析失败、加密文件、空文件和空表头返回 422。只有表头的空工作表允许导入，便于后续通过问数界面呈现空结果。CSV/TSV 使用严格 UTF-8 解码，解析错误不生成资源。
- 第一行必须存在且包含至少一个非空字段名。列名去除首尾空格和控制字符、长度最多 64；空名称生成“列 N”，重复名称追加序号。服务端在已验证列名后创建带引号的 SQLite 标识符。
- 工作簿中的每个工作表限 50,000 条数据行、100 列和 500,000 个非空单元格；预览最多 20 条数据行。扫描过程中立即检查限制，避免将超限工作表全部载入内存；创建资源时只保留用户选择的工作表内容。
- 解析值只接受字符串、有限数字、布尔、日期和空值。公式单元格只取文件内已有的缓存计算结果；无缓存结果按空值处理，不在服务端执行公式。富文本取文本内容；不认识的单元格对象按纯文本安全降级。
- 类型按整张所选工作表的非空值推断：整数、数值、布尔、日期和文本分别映射为 SQLite `BIGINT`、`DECIMAL`、`TINYINT`、`DATETIME` 和 `TEXT` 类型声明；SQLite 按其类型亲和性存储。混合类型及无法判断的字段按 `TEXT` 保存。数字文本只有在无前导零时才转换为数值，以保留订单号等编码。
- 创建字段时产生现有资源服务需要的 `MysqlColumn` 兼容结构：`COLUMN_NAME` 为规范化列名，`COLUMN_COMMENT` 为字段业务名称，`COLUMN_TYPE` 使用可识别的 `bigint`、`decimal(18,4)`、`tinyint(1)`、`datetime` 或 `text`。字段语义仍通过现有 `inferSemanticRole` 推断，敏感字段默认关闭。

## 数据结构与迁移

现有 `resources.data_source_id` 外键要求每个资源关联 `data_sources`。迁移 `006-file-data-sources.sql` 在事务中重建 `data_sources`：新增 `source_type`（`mysql`/`file`），保留现存 MySQL 行及 ID，并把仅 MySQL 使用的连接列改为可空；文件来源不会伪造地址或凭据。SQLite 对“删除并用相同 ID 重建被引用表”的延迟外键计数不会在事务中正确抵消，因此迁移器只在此迁移期间关闭外键执行；提交前运行 `foreign_key_check`，发现任何异常就回滚，随后立即恢复外键约束。资源关联 ID 不变。

增加 `imported_datasets` 元数据表，记录 `data_source_id`、逻辑工作表名、服务端生成的物理 SQLite 表名、源文件名、导入行列数和创建时间。物理表名只使用服务端生成的 UUID 派生标识符；工作表名、文件名和用户提供字段名绝不拼成数据表名。原始文件内容不会保存。

导入数据和应用元数据处于当前 `SMARTQ_SQLITE_PATH` 指定的 SQLite 文件中。所有创建动作共用一个事务；任何失败都会回滚元数据、物理表和资源，不产生孤立导入表。资源列表中数据源显示原文件名，资源表名显示工作表名。MySQL 数据源管理只读写 `source_type='mysql'` 的记录。

## HTTP 接口

请求体使用 `application/octet-stream` 原始文件字节；扩展名、工作表名和资源名称通过 URL 查询参数传入并用 Zod 校验。路由只解析 HTTP 输入，将已校验的 `Buffer` 交给用例。

### `POST /api/imports/preview`

- 查询参数：`fileName` 必填；`sheetName` 可选。未传工作表时选择文件中的第一个工作表。
- 成功响应：`fileName`、`sheets`（工作表名和索引）、`selectedSheet`、`rowCount`、`columnCount`、字段名及推断类型、`rows`（最多 20 条）。
- 错误：413 `IMPORT_FILE_TOO_LARGE`；415 `IMPORT_FILE_TYPE_UNSUPPORTED`；422 `IMPORT_FILE_INVALID`、`IMPORT_SHEET_NOT_FOUND`、`IMPORT_SHEET_LIMIT_EXCEEDED`。错误响应不包含堆栈、文件内容或原始解析错误。
- 切换工作表时，前端使用同一文件再次调用此接口并设置 `sheetName`。不在服务器保存临时上传会话。

### `POST /api/imports/resources`

- 查询参数：`fileName`、`sheetName`、`displayName` 均必填。
- 服务端重新解析和校验所选工作表，并原子创建本地文件数据源、导入表和资源草稿。
- 成功返回现有资源创建响应 `{ id, displayName, tableName, status: 'draft' }`，HTTP 201。
- 失败时回滚所有写入；名称冲突映射为 409，格式或规模错误沿用预览接口错误码。

前端 `features/data-source` 调用独立的 `spreadsheetImportApi`；其视图组件和请求状态放在 `features/data-source/components/SpreadsheetImportDialog.tsx` 与对应 Hook，避免把解析、上传和表单全部塞进页面组件。共享边界可复用 `packages/contracts` 的响应 schema。

## 查询与结构复核

- `dataSourceRepository` 保留现有 MySQL `findDataSourceById` 约定，并增加面向资源的判别联合来源查询。只返回 MySQL 来源时才解密密码；文件来源从 `imported_datasets` 解析物理表名。
- `refreshResourceSchema` 按来源读取 MySQL information_schema 或本地 `PRAGMA table_info`，统一映射成现有字段结构，继续使用现有结构摘要、差异展示和待复核阻断规则。删除物理导入表或映射缺失时按结构不可用处理。
- SQL 编译器增加显式 `mysql` / `sqlite` 方言。两种方言共用经过验证的字段、参数和只读计划；日期分桶 MySQL 使用 `DATE_FORMAT`，SQLite 使用 `strftime`。MySQL 保留执行时间 hint；SQLite 不输出该 hint。
- 问数执行前先从资源关联读取来源。MySQL 继续调用现有只读事务适配器；文件来源用 `better-sqlite3` 以只读模式打开当前 SQLite 数据库，设置 `query_only` 后执行编译结果。表名来自服务端导入映射，值继续参数绑定，执行后检查取消信号。
- SQLite 驱动为同步调用，运行期间无法像 MySQL 连接那样立即中止查询。单表 50,000 行和 500,000 非空单元格限制将同步执行控制在本地演示数据规模；取消在执行前后生效。
- 保存到会话历史的 SQL仍是实际执行语句；SQLite 随机物理表名只用于导入数据隔离，不暴露为用户可配置标识符。

## 安全与错误处理

- 文件大小由 Express 原始请求解析器限制到 `10 * 1024 * 1024` 字节，并在服务层复核；错误中间件把 `entity.too.large` 映射为明确的 413 响应。
- 扩展名由服务端白名单验证，ExcelJS/csv-parse 解析真实内容；所有字段值均参数化写入。列名只在服务端规范化后作为标识符并正确引用。
- 上传文件不写入临时目录、不保留原件、不调用外部服务；导入后业务数据仅保存在本地 SQLite。
- 预览失败不做持久化写入。最终导入事务回滚所有数据库更改；页面保留文件以便用户修正工作表或重试。
- API 暴露稳定中文错误消息和稳定错误码；不回显具体单元格数据、SQL、堆栈和解析库原始异常。

## 质量验收

- OpenSpec 变更校验通过；SQL migration 能保留已有 MySQL 数据源与资源外键。
- 静态诊断与前后端构建通过；覆盖导入接口 schema、来源类型分派、查询方言和 UI 滚动边界的代码由现有门禁扫描。
- 手工验收按规格场景执行：无 MySQL 时导入 CSV/XLS/XLSX、识别误标扩展名、切换工作表和查看预览、创建草稿后配置并发布、自然语言问数仅读当前导入表、非法/超限文件不留残余数据。
