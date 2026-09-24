# 技术设计：迭代质量护栏

## 文档状态

工程流程与验证基础设施变更，不改变 SmartQ 产品行为。无需新增产品规格；`.openspec.yaml` 中的 `skip_specs: true` 只跳过产品规格增量，提案、设计、任务和 OpenSpec 校验仍然保留。

## Technical Approach（技术方案）

- 在根工作区固定安装 `@fission-ai/openspec` 和 `vitest`，版本与 pnpm 锁文件一起提交。
- 用 `openspec validate --all --no-interactive` 检查活跃变更和稳定规格，用 `openspec validate --archived --no-interactive` 检查归档任务是否全部完成。
- 不启用 OpenSpec `--strict`：其 SHALL/MUST 建议针对英文需求，本项目需求文档使用中文；结构和场景校验仍由 CLI 执行。
- 使用 Vitest 在 Node 环境中运行 `tests/**/*.test.ts`。首批用例锁定共享 Zod 请求结构的关键输入、默认值和校验边界。
- 使用 `scripts/check-runtime.mjs` 从 `.nvmrc` 读取要求的 Node 主版本，避免质量命令在不支持的 Node 版本上给出误导结果。
- `pnpm quality` 串行执行环境检查、规格校验、格式、lint、回归用例和构建；GitHub Actions 安装 Node.js 24、pnpm 10.34.2 后运行同一命令。

## 依赖边界与后续扩展

- 测试只依赖共享 contracts 包，不连接 MySQL、不调用百炼，也不依赖浏览器或本地密钥。
- 未来查询计划、SQL 编译、资源状态和对话状态等纯规则应优先加入确定性单元测试。
- 待问数关键链路可运行后，再评估接入 MySQL 集成测试和浏览器验收；不为当前尚未实现的流程伪造测试。
- 若未来规则反复被违反，再把架构原则编码为 ESLint 约束或结构测试；当前目录和功能尚在形成，不预设额外扫描器。

## 验收

- `pnpm check:runtime` 在 Node 24 下通过，并在其他 Node 主版本下给出可操作的失败提示。
- `pnpm check:spec` 校验所有活跃变更和归档变更。
- `pnpm test` 运行共享请求契约回归用例。
- `pnpm quality` 在 CI 中按同一顺序运行全部门禁。
