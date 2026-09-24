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
- 每次代码或配置改动完成后运行 `pnpm check:diagnostics`；交付前运行 `pnpm quality`。新增文件类型时，先为它配置编辑器诊断，再把相同检查接入 `check:diagnostics` 和 CI。
- 项目命令必须在 `.nvmrc` 指定的 Node.js 版本下运行。若 Codex 外层 `node -v` 与 `.nvmrc` 不符，先用 `zsh -lic 'node -v'` 核对登录 shell，再用 `zsh -lic 'pnpm quality'` 执行门禁。
- 修改 TypeScript 前端文件时，编辑器选用工作区 TypeScript 版本。可读取编辑器问题面板时，交付前确认工作区错误为零；无法读取时，以 Node.js 24 下 `pnpm quality` 通过作为仓库可复现的验收，并说明未检查的编辑器专属诊断。
- 修复诊断本身，不通过忽略文件、降低规则或无理由禁用检查来清零。
