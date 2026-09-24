# 提案：开发启动前校验 Node.js 版本

## 背景

仓库要求 Node.js 24，API 使用按当前 Node 主版本构建的 `better-sqlite3` 原生模块。使用 Node.js 20 启动时，API 在打开数据库阶段因模块 ABI 不匹配退出，但 Vite 仍可能正常启动，最终把 API 代理故障显示成页面请求 500。

## 变更

- `pnpm dev` 在并行启动 API 和 Web 之前先执行现有 `pnpm check:runtime`。
- Node.js 版本不匹配时，在启动任何开发服务前给出 `.nvmrc` 版本提示并以非零状态退出。
- Node.js 24 环境沿用现有并行启动行为。

## 验收标准

- 在 Node.js 20 下执行 `pnpm dev`，API 和 Vite 都不会被启动；终端显示项目要求的 Node.js 版本。
- 在 Node.js 24 下执行 `pnpm dev`，API 和 Vite 按现有配置并行启动。

这是开发工具护栏，不改变产品运行时或页面行为，因此本变更不新增产品规格。
