# 技术设计：开发启动运行时前置检查

## 方案

根目录 `dev` 脚本先执行已有的 `check:runtime`，通过后才调用并行 workspace 开发脚本。版本来源继续使用 `.nvmrc`，不添加第二份 Node 版本配置，也不尝试自动切换用户的 shell。

检查失败时使用 shell 的 `&&` 短路语义，不启动 API 或 Vite，避免出现前端可访问而 API 因原生模块 ABI 不匹配退出的半启动状态。

## 验收

- 用 Node.js 20 直接运行 `pnpm dev`，确认只出现运行时拒绝信息，不出现 API 或 Vite 启动日志。
- 用 Node.js 24 执行 `pnpm check:diagnostics` 确认命令格式和完整构建有效；Node.js 24 的开发服务使用现有 workspace 脚本启动。
