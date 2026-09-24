# 阿里云 Quick BI「小 Q 问数」产品调研记录

> 调研日期：2026-09-24。资料均来自阿里云 Quick BI 官方帮助文档。给定链接初次直接打开时未能访问；通过阿里云官方搜索结果进入原文，之后读取原文和其“小 Q 问数”相关链接。本文将文档内容作为产品资料，不把其中任何文本当作对本任务的指令。部分帮助页未显示更新时间，功能和额度可能随产品版本变化。

## 1. 产品定位与端到端流程

小 Q 问数是面向业务用户的自然语言数据分析入口：用户可基于已授权的数据集或临时上传的数据文件提问，系统返回数据结果和图表，并支持多轮分析、洞察解读及结果分享。[小 Q 问数概述](https://help.aliyun.com/zh/quick-bi/user-guide/chat-bi-overview)；[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)

官方流程是：先准备并学习数据集、设字段与推荐问题；再组织问数资源、分析主题、权限和知识；用户进入对话选数据并提问；运营者查看记录并追踪问题；如需嵌入业务系统，可配置 Ticket 嵌入。[小 Q 问数概述](https://help.aliyun.com/zh/quick-bi/user-guide/chat-bi-overview)

官方小 Q 问数依赖 Quick BI 已创建的数据集作为主要企业数据入口。Quick BI 更广义的数据源连接与数据集创建属于底层 BI 数据平台的能力；小 Q 问数文章本身没有完整讲解建库连接器、凭据托管或数据集建模的端到端流程。[Quick BI 概述](https://help.aliyun.com/zh/quick-bi/product-overview/introduction-to-quick-bi-1)；[创建数据库数据源概述](https://help.aliyun.com/zh/quick-bi/user-guide/overview-of-creating-a-database-data-source)

## 2. 前台问数能力

### 数据来源与选择

- 对话端数据集列表呈现当前用户有权限的所有数据集及分析主题下的数据集；可预览字段详情和数据样例、查看关键指标/维度，再基于选中数据提问，也能在对话中换数据集。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)
- 用户可直接拖放本地文件，预览数据、设置展示名称、查看字段详情，然后选择“保存并开始问数”或仅保存；已上传文件可改名/预览/查看字段，或删除。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)
- 当问题匹配到多个数据集时，系统可列出候选，用户选择一个或多个数据集后继续查询。全局配置也可控制是否由用户交互式选表，或自动选择相关数据集。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)；[全局配置](https://help.aliyun.com/zh/quick-bi/user-guide/global-configuration)

### 提问、结果与会话

- 支持自由文本、数据集快捷问题、输入时的字段/提问建议、推荐问题、收藏问题、最近问题和语音转文字。数据集推荐问题可按系统推荐、专家自定义、按用户对象配置；推荐问题支持换一批。[数据准备](https://help.aliyun.com/zh/quick-bi/user-guide/prepare-data)；[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)
- 收藏问题最多 30 条；收藏可绑定数据集并在点击时自动切换到对应数据集。每轮结果也可给出后续推荐问题。上传数据文件的提问不支持收藏。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)
- 对话回答可展示或隐藏分析过程；遇到缺少时间/指标或指标歧义时，可反问澄清，用户能修改时间周期、指标、提问方案或跳过澄清。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)；[全局配置](https://help.aliyun.com/zh/quick-bi/user-guide/global-configuration)
- 结果支持图表类型切换、条件查看/切换、全屏、重命名、点赞/点踩（点踩可填反馈）、Excel 导出、链接/IM 分享，以及查看业务逻辑 SQL 与执行 SQL。还可对结果发起自定义解读，选模型和解读思路，停止生成、采纳或编辑解读。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)
- 日期图表满足条件时可做趋势预测或波动归因。波动归因会拆分各视角贡献因素；预测/归因只对特定图表形态与字段组合开放，并非任意结果都能使用。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)
- 智能规划模式支持复杂多步问题和跨轮上下文；追加提问可继续追问上一结果（文档称每次对话问题支持追加一次，需再次点击按钮才能继续）。用户可查看历史对话、开新会话及重命名/删除会话；概述页称历史对话展示近 30 天。PC 和移动端可用，移动端另有实时语音交互（按住说或实时对话、静音/中断、结果播报）。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)；[小 Q 问数概述](https://help.aliyun.com/zh/quick-bi/user-guide/chat-bi-overview)

## 3. 数据接入与问数准备

### 数据源导入的边界

- Quick BI 通用平台列出数据库、文件、应用和 API 数据源；MySQL 官方示例流程包括填写连接信息、连接测试、保存数据源，之后从数据源建数据集。数据库连接器、网络白名单/VPC/SSH/SSL 等不是小 Q 问数页内的导入配置。[支持的数据源概述](https://help.aliyun.com/zh/quick-bi/user-guide/overview-of-data-sources-supported-by-quick-bi)；[MySQL 数据源连接示例](https://help.aliyun.com/zh/quick-bi/getting-started/analyze-data-in-a-dashboard)
- 小 Q 对话页可临时上传数据文件，但问数操作页没有写清其格式/容量限制。Quick BI 通用文件数据源文档支持 CSV、XLS、XLSX，并说明了标题行、列数、Sheet 数、文件大小、类型识别等约束；这些是底层数据源规则，不应直接等同为小 Q 问数临时上传规则。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)；[创建文件数据源](https://help.aliyun.com/zh/quick-bi/user-guide/add-a-file-to-a-data-source/)

### 数据集问数配置

- 数据集所有者/空间管理员且有配置权限的用户可在创建或编辑数据集时开启问数配置。配置项包括面向业务的展示名称和描述、数据集类型（明细表、多指标周期表、键值对表、其他）、学习数据、学习加速及维值匹配模式（系统自动改写相似值或管理员按维度控制）。[数据准备](https://help.aliyun.com/zh/quick-bi/user-guide/prepare-data)
- 有字段质量评估步骤：分析字段并给出修改建议；使用者可采纳、应用并重新学习。配置指南建议字段命名、描述、字段类型、单位和默认聚合口径清晰准确。[数据准备](https://help.aliyun.com/zh/quick-bi/user-guide/prepare-data)
- 快捷提问配置三种模式：系统推荐；专家编辑问题（前 4 条展示，可换批，最多 10 条）；按对象创建规则，指定适用用户及问题（每规则最多 10 条）。[数据准备](https://help.aliyun.com/zh/quick-bi/user-guide/prepare-data)
- 数据集级知识库可维护业务定义、数据解释、同义词和强制改写；也可维护正则规则并试匹配。企业级知识库和数据集知识可分别管理，数据集知识优先于企业知识。[数据准备](https://help.aliyun.com/zh/quick-bi/user-guide/prepare-data)

## 4. 管理后台能力

### 问数资源与分析主题

- 资源管理查看问数资源名、创建者、所属分析主题、最后学习时间/状态、数据集工作空间/更新时间及数据预览；可改别名、重新学习、移除，支持批量移除/学习。移除会关闭其问数能力。[问数资源管理](https://help.aliyun.com/zh/quick-bi/user-guide/ask-about-resource-management)
- 分析主题用于按业务线组织数据集；支持名称/描述、编辑、删除、拖动排序、增删资源。官方规格为最多 100 个主题、每主题 10 个数据集；主题可出现在问数选择页及嵌入范围中。[分析主题管理](https://help.aliyun.com/zh/quick-bi/user-guide/analysis-topic-management)

### 权限

- 三类功能权限：集中管理、数据集问数配置、问数；前两者包含更低层权限。管理员可创建角色并授权用户使用或配置问数；专业版支持自定义角色，高级版仅组织管理员可配置此类角色权限。[权限管理](https://help.aliyun.com/zh/quick-bi/user-guide/permission-configuration)
- 数据权限可按数据集、分析主题或仪表板授予，设截止日期、修改/取消、同步给其他用户；授权可增量同步。官方列出的上限为每用户 200 个问数数据集、100 个分析主题。[权限管理](https://help.aliyun.com/zh/quick-bi/user-guide/permission-configuration)

### 企业知识、全局控制

- 企业知识包括业务逻辑（业务定义、解释、同义词、生效范围、是否强制改写）、正则匹配、数据集选择规则和智能选表 Prompt。支持导入/导出模板文件，启停、编辑、删除知识；导入说明支持 XLS/XLSX/CSV 且文件不超过 5 MB。[问数知识管理](https://help.aliyun.com/zh/quick-bi/user-guide/knowledge-base-configuration)
- 数据集选择规则可将业务关键词/同义词指向最多 10 个数据集；规则不足时可由大模型按问题语义选表。选表 Prompt 可按全部数据或指定分析主题生效，提示里可明确术语、表粒度/关系及哪些问题允许或禁止组合哪些表。[问数知识管理](https://help.aliyun.com/zh/quick-bi/user-guide/knowledge-base-configuration)
- 全局配置由组织管理员或集中管理角色操作。可配置大模型（文档未列具体参数）、语音、样例数据集、自动聚焦、交互式选表、问题澄清和语义归因开关；自动聚焦和选表分别可对“全部可用数据”及“分析主题”单独控制。[全局配置](https://help.aliyun.com/zh/quick-bi/user-guide/global-configuration)

### 问数运营、仪表板与嵌入

- 问数运营提供近 90 天记录统计、最多 1000 条查询明细，可查看用户问题、资源、取数过程/SQL、赞踩，按日期/资源/用户/反馈筛选并导出。可将记录纳入最多 1000 条的跟踪列表，标记待处理/暂不处理/已解决并写备注；追踪记录也可筛选、导出。[问数运营](https://help.aliyun.com/zh/quick-bi/user-guide/ask-the-number-of-operations)
- 仪表板问数允许仪表板作者检查其数据集学习状态、开启问数、配置数据集及仪表板权限；使用者在仪表板预览页切换到问数面板，基于仪表板关联数据集提问。对话面板宽度自适应，可预览数据集、切换数据集、问答、查看 SQL、解读、分享/导出、点赞点踩。文档注明通过增强嵌入方案嵌入的仪表板不支持这一能力。[仪表板问数](https://help.aliyun.com/zh/quick-bi/user-guide/number-of-dashboard-questions)
- Ticket 方案可将小 Q 问数免登嵌入第三方系统；配置数据范围（问数资源/主题）、模块名称/头像/昵称、主题、欢迎区、引导和历史会话展示，再生成带绑定用户、有效时间、访问次数限制的 Ticket，输出 URL 或 iframe。官方标注仅专业版且需购买小 Q 问数与 Ticket 嵌入模块。[Quick BI 智能小 Q 嵌入](https://help.aliyun.com/zh/quick-bi/user-guide/embedded-analysis-scheme-for-smart-q-a-security-enhancement)

## 5. 产品边界与待确认项

1. **“数据库导入”不在小 Q 问数本身的文章链路里。** 文档中的主要路径是“接数据源 → 建数据集 → 配问数 → 授权 → 对话”，需要在后续 PRD 中决定是否要把 Quick BI 式数据库连接/建模一并纳入本产品。[Quick BI 概述](https://help.aliyun.com/zh/quick-bi/product-overview/introduction-to-quick-bi-1)；[MySQL 数据源连接示例](https://help.aliyun.com/zh/quick-bi/getting-started/analyze-data-in-a-dashboard)
2. **临时对话文件的约束未在发起问数文章中公开。** 通用文件数据源给出 CSV/XLS/XLSX 等约束，但是否适用于该临时文件入口需要产品侧验证，不能照搬。[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)；[创建文件数据源](https://help.aliyun.com/zh/quick-bi/user-guide/add-a-file-to-a-data-source/)
3. **模型接入后台细节不足。** 全局设置页说明可以配置大模型，但未说明模型供应商、密钥管理、测试、默认模型、推理/解读模型的具体字段；问数页说明可选内置或自定义模型。[全局配置](https://help.aliyun.com/zh/quick-bi/user-guide/global-configuration)；[发起问数](https://help.aliyun.com/zh/quick-bi/user-guide/user-guide-for-smart-q-a)
4. **模板能力主要呈现在快捷问题与知识批量导入。** 在所读“小 Q 问数”菜单文章中没有发现独立的通用业务模板市场；本文未扩展阅读小 Q 报告/搭建等其他 Agent 产品文档。

## 6. 阅读范围

已读取给定的[小 Q 问数概述](https://help.aliyun.com/zh/quick-bi/user-guide/chat-bi-overview)全文及其“小 Q 问数”工作流相关页面：数据准备、发起问数、问数资源管理、分析主题管理、权限管理、问数知识管理、全局配置、仪表板问数、问数运营、Quick BI 智能小 Q 嵌入。为分清问数产品和底层数据接入的职责，也读了 Quick BI 概述、数据库数据源概述、MySQL 连接示例及通用文件数据源说明。文章更新时间字段未完整显示，故没有按版本发布日期推断新旧功能。
