# SmartQ 的 SDD 工作流

本项目采用 OpenSpec 变更驱动开发。规格先描述用户能观察到的行为，设计文档记录技术实现，任务清单跟踪交付；OpenSpec CLI 在本地和持续集成中校验变更结构。

## 目录约定

```text
openspec/
├── config.yaml
├── specs/                         # 已实现并归档的稳定产品行为
└── changes/
    ├── <change-name>/             # 一个正在演进的独立变更
    │   ├── .openspec.yaml          # 纯工程变更声明 skip_specs: true
    │   ├── proposal.md            # 为什么做、范围是什么
    │   ├── specs/<capability>/spec.md  # 相对稳定规格的行为增量
    │   ├── design.md              # 技术方案、依赖和未决选择
    │   └── tasks.md               # 可执行任务与验收状态
    └── archive/                   # 已完成变更的记录
```

## 每次变更的流程

1. **提出变更**：建立 `changes/<change-name>/proposal.md`，使用 `## Why` 和 `## What Changes` 标题（正文使用中文）写清问题、目标、范围、明确不做的内容和成功标准。先检查有没有可继续扩展的活跃变更，避免重复建案。产品行为、工程结构、质量门禁的独立工作都需要自己的变更记录。
2. **写行为规格**：在 `specs/<capability>/spec.md` 写出新增、修改或移除的行为。需求要能从界面或系统结果观察，并用 `WHEN / THEN` 场景表达验收；变更现有行为时写完整的新行为和迁移影响。
3. **做技术设计**：在 `design.md` 记录组件边界、数据/API交互、状态流、错误处理、安全边界和技术选择。产品行为归规格，内部实现细节归设计。未知选项明确列出，不用猜测填空。
4. **拆任务**：在 `tasks.md` 将工作拆成能独立检查的产品、前端、数据/API和验证任务；每项任务都链接或指出对应的规格场景。
5. **实现与校验**：按任务实现；如果事实使行为规格发生变化，先更新 proposal/spec/design/tasks，再继续实现。结束前逐条检查相关场景，记录自动化或手工验证结果。
6. **归档**：变更完成后，将已实现的规格增量合并进 `openspec/specs/<capability>/spec.md`，把变更目录移至 `changes/archive/YYYY-MM-DD-<change-name>/`。后续工作从稳定规格提出新变更。

纯重构、工程工具或文档改动不改变可观察产品行为时，在变更目录的 `.openspec.yaml` 中声明 `skip_specs: true`；仍需保留提案、技术设计和任务清单。不要为了通过英文规范检查而把面向中国读者的需求翻译成英文。

## 开始实现的条件

- 目标和范围与用户请求一致，规格场景没有关键歧义。
- 影响实现的技术选择已经由用户给出，或在用户授权的范围内有明确决定。
- `design.md` 和 `tasks.md` 足以说明先做什么、如何检查完成。

需求可在实施过程中演进；更新规格是正常流程，不需要把早期草案当成不可更改的合同。小型纯重构若不改变可观察行为，应创建工程变更并设置 `skip_specs: true`，不必创建产品规格。

## 本地质量门禁

执行 `pnpm check:diagnostics` 检查格式、全仓库 ESLint、CSS Stylelint、Bash 语法、Docker Compose 配置和工作区构建。交付前执行 `pnpm quality`，它还会确认 Node 主版本、校验所有活跃与归档 OpenSpec 变更并运行 Vitest 回归用例。GitHub Actions 对推送和拉取请求运行同一命令，避免本地和 CI 使用不同验收标准。

OpenSpec 的 `--strict` 模式要求英文需求使用 RFC 2119 的 `SHALL/MUST` 关键字；本项目需求使用中文，因此门禁执行结构校验但不启用这条英文措辞规则。校验器可能保留提示型警告；若实际用户行为发生变化，仍要用中文更新对应场景。

回归用例优先覆盖稳定边界和已确认规则：共享请求结构、资源状态变更、查询计划校验、SQL 编译与行数限制、澄清和对话状态转换。当前只先为共享请求契约建立轻量用例；端到端测试等问数闭环完成后，再按实际 UI/API 验收风险补充。

## 本项目首个变更

`changes/learning-mvp/` 定义首个学习型问数闭环，包含精简范围、行为场景、技术设计和分阶段任务。技术选型已确认：Node 24、pnpm workspace、Vite/React、Express、MySQL 8.4（Docker Compose）、SQLite 和百炼/Qwen。整体设计评审通过后再进入实现。

OpenSpec 的概念与变更结构参考：[官方 concepts 文档](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)、[getting started](https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md)。
