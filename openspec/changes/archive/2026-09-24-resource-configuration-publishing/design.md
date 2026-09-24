# 技术设计：问数资源配置与发布

## 文档状态

本增量实现“资源草稿 → 配置 → 发布 → 结构复核”生命周期。模型配置、业务术语、调试计划和问数会话留给后续增量。

## 1. 资源状态与行为

| 状态           | 含义                                 | 可编辑                 | 可问数 |
| -------------- | ------------------------------------ | ---------------------- | ------ |
| `draft`        | 新建或已修改、尚未发布               | 是                     | 否     |
| `active`       | 配置通过发布校验                     | 是；保存修改后退回草稿 | 是     |
| `needs_review` | MySQL 表结构发生变化，等待管理员确认 | 先复核结构             | 否     |

状态转换：

```text
创建 → draft → 发布成功 → active
                  active 保存配置 → draft → 重新发布 → active
          draft/active 刷新发现变化 → needs_review
          needs_review 确认新结构 → draft → 配置并重新发布 → active
```

发布至少需要一个有效命名指标。启用字段必须有非空业务名称；命名指标引用已启用的数值字段，并设置兼容的聚合。数值字段允许 `sum`、`avg`、`min`、`max`、`count`；非数值维度只允许 `count`，默认聚合可留空。字段是否启用与指标/维度角色分开保存。管理员配置的命名指标规则是业务口径权威来源，后续模型规划不能移除其固定过滤条件；不引用命名指标的开放数值字段仍可由后续规划器使用受控聚合。

## 2. HTTP 接口

所有接口由 `/api` 代理到本地 Express API，错误沿用 `{ error: { code, message } }`。

### 2.1 资源列表与详情

- `GET /api/resources`：返回 `{ items: ResourceSummary[] }`。摘要包含 `id`、`displayName`、`tableName`、`dataSourceName`、`status`、`fieldCount`、`createdAt`。
- `GET /api/resources/:id`：返回资源元数据、完整字段配置、推荐问题；若状态为 `needs_review`，额外返回变更摘要和待复核字段。
- 列表与详情不得包含数据源密码、密文、初始化向量或认证标签。

### 2.2 保存配置

- `PUT /api/resources/:id`：保存 `displayName`、完整 `fields` 配置、完整 `metrics` 配置和 `recommendedQuestions`。
- 每个字段提交 `id`、`displayName`、`description`、`semanticRole`（`metric | dimension`）、`enabled`、`unit`、`defaultAggregation`、`synonyms`。
- `id` 与物理 `columnName`、数据库类型等结构信息不可由请求修改。字段 ID 集合必须与资源当前字段集合完全一致，不得重复、缺失或跨资源引用字段。
- `metrics` 为完整替换列表。每项保存 `id`（新建时可省略）、`displayName`、`description`、`fieldId`、`aggregation`、`synonyms`、`fixedFilters`。固定条件结构为 `{ fieldId, operator: 'eq', value }`；本阶段仅支持等值条件，枚举字段的 `value` 必须属于数据库枚举值。
- 指标名和同义词在同一资源内不得冲突；指标引用的字段必须启用、标记为 `metric` 且为数值类型；固定条件引用的字段必须启用、标记为 `dimension`。
- 保存完整配置成功后状态为 `draft`；`needs_review` 资源须先接受待复核结构。
- 同义词去空白、去重；推荐问题允许空列表，最多四条，问题去首尾空格后必须非空且唯一。

### 2.3 发布资源

- `POST /api/resources/:id/publish`：无请求体；通过服务端校验后将状态改为 `active`。
- 校验包括：至少一个有效命名指标、指标字段类型与聚合兼容、指标名和同义词唯一、固定过滤字段有效且枚举值存在、资源不存在待复核结构。
- 校验失败返回 `422 RESOURCE_CONFIGURATION_INVALID`，包含可定位到字段的错误；不改变资源状态。

### 2.4 刷新与接受结构

- `POST /api/resources/:id/schema/refresh`：重新 introspect 对应 MySQL 表并计算结构摘要。摘要由列名、类型、可空性和顺序组成，不把注释改动视为结构变化。
- 无变化返回 `{ changed: false, status }`，不改写字段配置。
- 有变化时在 SQLite 保存当前观察到的结构快照、摘要和发现时间，将资源改为 `needs_review`，返回新增/删除/类型变化清单。MySQL 不可达时返回可读错误，资源状态不变。
- `POST /api/resources/:id/schema/accept`：仅 `needs_review` 资源可调用。同步待复核快照：新增列默认禁用；删除列移出字段清单；已有列按物理列名保留展示名、描述、角色、单位和同义词；类型变化列保留描述和角色但禁用，并清除不兼容默认聚合。接受后清除待复核快照并回到 `draft`。
- 未确认的快照不覆盖已确认结构，资源不能发布。后续问数轮次必须在执行前调用相同结构检查服务；问数 API 尚未在本增量实现。

## 3. SQLite 数据

沿用 `resources` 和 `resource_fields`。迁移 `002-resource-configuration.sql` 保存推荐问题和待复核结构；新增迁移 `003-resource-metrics.sql`：

- `resource_metrics`：`id`、`resource_id` 外键、`display_name`、`description`、`field_id` 外键、`aggregation`、`synonyms_json`、`fixed_filters_json`、`position`；资源删除时级联删除。
- `resource_recommended_questions`：`id`、`resource_id` 外键、`position`、`question`，按资源和顺序唯一。
- `resource_schema_reviews`：`resource_id` 主键/外键、`observed_schema_hash`、`observed_schema_json`、`detected_at`，每个资源只保留最新待复核快照。

把当前仅在启动时执行固定 `001` 文件的逻辑换成按文件名排序的 SQL 迁移器。`schema_migrations` 记录已执行文件；启动时在 SQLite 事务中应用未执行迁移并记录时间。对已有本地库，`001` 的 `CREATE TABLE IF NOT EXISTS` 可安全重跑，再应用 `002`；不得清库或删除已保存的资源草稿。

## 4. 后端模块

- `contracts`：使用 Zod 描述字段配置保存和资源输出的请求/响应类型；共享包不依赖数据库或 Express。
- `resourceRoutes`：只解析参数、调用用例并映射响应状态码。
- `resourceService`：编排读取、保存、发布、检查和接受结构变更；集中业务校验及状态转换。
- `resourceRepository`：以 SQLite 事务保存资源、字段、命名指标、问题列表和结构复核快照；只接受通过业务校验的配置。
- `mysqlAdapter`：读取选定表结构并生成结构摘要；仅接受数据源 ID 对应的既有凭据，不接收任意 SQL。
- 错误码：`RESOURCE_NOT_FOUND` 404、`RESOURCE_CONFIGURATION_INVALID` 422、`RESOURCE_SCHEMA_UNAVAILABLE` 503、`RESOURCE_SCHEMA_REVIEW_REQUIRED` 409。

## 5. 管理端页面

- 左侧“问数资源”展示资源名、来源表和状态，包含首次无资源、加载中和错误状态。
- 选择资源进入配置页：基本信息区编辑资源名称；字段语义表格按数据库顺序显示物理列/类型、业务名称、角色、单位、默认聚合、同义词和“允许问数”开关；命名指标区编辑名称、指标字段、聚合、同义词和固定等值过滤；推荐问题编辑区最多四条。
- 页面动作：保存草稿、发布、刷新结构。发布按钮显示字段级校验错误；待复核时先显示差异摘要，提供“接受新结构”动作，接受后管理员检查新字段和受影响字段再保存并重新发布。
- 组件拆分为页面编排、字段表格、推荐问题编辑器、结构差异提示；API 请求和加载/错误/脏状态放在资源 feature Hook/API 模块。
- 成功创建草稿后导航到该资源配置页；手动从侧栏进入“问数资源”显示完整列表，不依赖只存在内存中的新建资源信息。

## 6. 验证

- 通过公开 HTTP API 覆盖列表/详情、配置保存、发布成功与拒绝、无结构变化、结构变化进入复核、接受结构后字段合并等场景。
- 使用纯函数或稳定的服务边界验证聚合和字段类型规则；MySQL schema refresh 使用当前 Compose 演示库进行一次端到端验证。
- `pnpm quality` 作为交付门禁。已有活跃 OpenSpec 增量保持可校验。
