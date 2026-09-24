# 项目指引

<!-- CODEGRAPH_START -->

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), use it before grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — relevant symbols' source and call paths, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If the tool is listed but deferred, load it by name via tool search.
- **Shell**: `codegraph explore "<symbol names or question>"`.

If `.codegraph/` is absent, skip CodeGraph; indexing is the user's decision.
<!-- CODEGRAPH_END -->

- 面向中国读者的项目文档默认使用简体中文。仅在技术名词、代码标识、命令、路径或工具语法需要时保留英文。
- 产品边界以 [docs/PRD.md](docs/PRD.md) 为准。所有功能、工程结构和质量门禁改动都先阅读 [openspec/README.md](openspec/README.md)，遵循其中的变更流程和文档格式。
- 每个独立改动写入 `openspec/changes/<change-name>/`。首个纵向切片继续使用现有的 `learning-mvp` 变更；后续独立改动新建变更。纯工具、重构或文档变更在 `.openspec.yaml` 标记 `skip_specs: true`，不可因此跳过提案、设计和任务清单。
- 开始实现前，确保提案、可观察的需求/场景、技术设计和任务清单与用户要求一致。尚未确定的技术选型记录在 `design.md`，并根据用户意见解决后再实施。
- 实施过程中更新任务状态；若新事实改变了预期行为，同步修订相应变更文档。不要超出当前提案扩展范围。
- 只有在验收场景已检查、规格增量已合并到 `openspec/specs/`、变更已归档后，才算完成一个变更。
- 修改或新增代码前先读 [docs/engineering/code-guidelines.md](docs/engineering/code-guidelines.md)；按功能组织模块，保持页面、业务逻辑和基础设施各司其职。
- 交付前执行 `pnpm quality`；该命令检查 Node 版本、OpenSpec 文档、格式、lint、回归用例和构建。修复检查发现的问题，不以禁用规则代替修复。
