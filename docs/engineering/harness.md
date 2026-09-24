# SmartQ 迭代护栏

Harness engineering 的重点是把工程师的判断转成仓库内清楚、可运行、可重复的约束。SmartQ 的目标是让每次需求迭代都能沿用同一条需求、实现和反馈闭环。

## 每次变更的工作流

1. 先检查 `openspec/changes/`，决定扩展现有变更还是新建独立变更。
2. 在 `proposal.md` 讲清目标和范围；在 `specs/` 用中文的 `WHEN/THEN` 场景记录可观察行为；在 `design.md` 记录模块/API/数据流和错误处理；在 `tasks.md` 拆分可验收工作。
3. 纯工具、重构或文档变更如果没有用户可观察行为增量，在 `.openspec.yaml` 声明 `skip_specs: true`，但仍保留提案、设计和任务。
4. 按任务实现；发现需求变化时，先改 OpenSpec 文档再改代码。
5. 执行 `pnpm quality`；提交前确保新行为有回归覆盖、规格场景与实现一致。
6. 所有任务和场景完成后，归档变更并把实现后的稳定行为合并到 `openspec/specs/`。

## 当前自动门禁

| 命令                 | 检查内容                             |
| -------------------- | ------------------------------------ |
| `pnpm check:runtime` | 当前 Node 主版本与 `.nvmrc` 一致     |
| `pnpm check:spec`    | 活跃变更和归档变更的 OpenSpec 结构   |
| `pnpm format:check`  | 源码、配置及本次工程文档格式         |
| `pnpm lint`          | 应用、共享包和回归用例的 ESLint 规则 |
| `pnpm test`          | Vitest 确定性回归用例                |
| `pnpm build`         | 工作区 TypeScript 检查及生产构建     |
| `pnpm quality`       | 以上检查按固定顺序执行               |

GitHub Actions 在推送和拉取请求上运行 `pnpm quality`。本地与 CI 使用 Node.js 24、pnpm 10.34.2 和提交的 `pnpm-lock.yaml`。

## 怎么扩展回归覆盖

- 改共享 HTTP 结构时，在 `tests/contracts/` 覆盖正常输入、无效输入和默认值。
- 加查询计划或 SQL 编译功能时，为白名单、聚合限制、参数绑定、行数上限和拒绝路径加不依赖外部服务的测试。
- 加数据库适配器后，才引入使用 Compose MySQL 的集成测试。
- 问数页面关键路径可运行后，再加入浏览器自动化，覆盖已评审的五个面试演示主场景。
- 只有当某条结构规则反复因人工约定而被违反时，才新增 ESLint 自定义规则或结构测试。

失败信息应指出具体文件或边界；不要通过关闭规则、降低运行时要求或删除失败用例让门禁变绿。
