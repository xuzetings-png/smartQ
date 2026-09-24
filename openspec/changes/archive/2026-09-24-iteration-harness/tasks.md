# 任务清单：iteration-harness

## SDD 与工具

- [x] 确认这是工程流程变更，不改变产品行为；OpenSpec manifest 声明 `skip_specs: true`。
- [x] 固定 OpenSpec CLI 与 Vitest 版本。
- [x] 将 OpenSpec 活跃变更和归档检查接入根脚本。

## 回归与环境

- [x] 添加共享请求契约的 Vitest 用例和测试配置。
- [x] 添加从 `.nvmrc` 读取要求版本的 Node 检查。
- [x] 把环境、规格、格式、lint、测试和构建接入统一 `pnpm quality` 命令。

## 持续集成与说明

- [x] 添加 GitHub Actions 工作流，在推送和拉取请求中执行统一质量门禁。
- [x] 更新 AGENTS.md、OpenSpec 工作流和编码规范入口，说明如何持续扩展护栏。
- [x] 执行 `pnpm quality`；OpenSpec、格式、lint、4 个契约用例和工作区构建均通过。
