# 提案：建立可重复的迭代质量护栏

## Why（背景）

SmartQ 计划持续按 OpenSpec 演进。现有仓库有格式、lint 和构建命令，但没有自动检查 OpenSpec 变更的工具、没有回归用例入口，也没有在干净环境中重复执行门禁的持续集成。

## 目标

- 让需求提案、规格、设计和任务清单能由 OpenSpec CLI 结构化校验。
- 提供轻量的自动回归用例入口，先覆盖前后端共享请求契约。
- 让本地和 CI 使用同一组版本检查和质量命令。
- 保持工程流程可理解，按产品真实风险逐步扩展验证范围。

## What Changes（变更范围）

- 固定 OpenSpec CLI 和 Vitest 版本。
- 建立 Node 主版本检查、OpenSpec 校验、Vitest、统一 `quality` 命令和 GitHub Actions 工作流。
- 补充中文 SDD/harness 使用说明和项目指引。

## 明确不做

- 不改变 SmartQ 的用户可见产品行为。
- 不加入浏览器端到端测试、数据库容器验收或模型供应商调用测试。
- 不建设复杂的自定义架构扫描器或覆盖率阈值。

## 成功标准

- 新增工程改动可以声明不需要产品规格增量，同时仍接受 proposal/design/tasks 校验。
- 一条 `pnpm quality` 命令串起环境、OpenSpec、格式、lint、回归用例和构建检查。
- GitHub Actions 使用锁文件安装依赖并运行同一条质量命令。
