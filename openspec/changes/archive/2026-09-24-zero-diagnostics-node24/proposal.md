# 提案：统一编辑器与质量门禁诊断

## Why（背景）

仓库已要求 Node.js 24，但命令宿主注入的 Node.js 20 路径可能覆盖登录 shell 的 NVM 设置；编辑器使用的 TypeScript 版本也可能与仓库版本不同。现有质量命令没有覆盖所有受支持源码和样式文件，导致本地编辑器可能出现 CI 不会发现的项目诊断。

## What Changes（变更范围）

- 为 macOS 集成终端和自动化终端选择登录 zsh，从项目 shell 配置加载 Node.js 24。
- 将编辑器 TypeScript SDK 指向工作区已安装的 TypeScript 版本。
- 扩大 Prettier 和 ESLint 覆盖范围，增加 CSS lint、Shell 语法和 Docker Compose 配置检查。
- 增加统一静态诊断命令，并把它纳入 `pnpm quality`。
- 明确项目新增文件类型时，必须同时提供可在本地和 CI 运行的诊断检查。

## 明确不做

- 不承诺拦截未安装或未配置的第三方编辑器扩展诊断。
- 不改变 SmartQ 的用户可见行为，也不放宽现有 Node.js 版本要求。
- 不为了通过检查而批量重写与本次覆盖无关的产品代码。

## 成功标准

- 新开的 macOS 集成终端与自动化终端解析到 Node.js 24；`pnpm check:runtime` 能阻止 Node.js 20 下的工程命令。
- 编辑器可使用 `apps/web` 锁定的 TypeScript SDK，避免由编辑器内置版本产生不一致诊断。
- `pnpm check:diagnostics` 检查全仓库受支持的格式、脚本、样式、Compose 配置、TypeScript 和生产构建；任一检查失败都会以非零状态退出。
- `pnpm quality` 和 GitHub Actions 执行相同诊断门禁。
