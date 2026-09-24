# 技术设计：修复 Vite CSS 导入的 TypeScript 诊断

## 文档状态

纯工程类型配置修复，不改变用户可见行为。通过 `.openspec.yaml` 声明 `skip_specs: true`；保留提案、设计、任务和 OpenSpec 校验。

## 根因

- `apps/web/src/main.tsx` 使用副作用导入加载 `styles.css`。
- 工作区 TypeScript 为 5.9.3；其 `noUncheckedSideEffectImports` 默认关闭，所以当前构建未报告问题。
- VS Code 使用 TypeScript 6.0.3；该版本默认开启 `noUncheckedSideEffectImports`，因项目没有 CSS 模块类型声明而报告 TS2882。
- 使用 TypeScript 6.0.3 对相同 `apps/web/tsconfig.json` 检查可复现 TS2882；为该命令临时加入 `vite/client` 类型后诊断消失。

## 技术方案

1. 新增 `apps/web/src/vite-env.d.ts`，仅包含 `/// <reference types="vite/client" />`。该声明由 Vite 提供，覆盖客户端静态资源导入和 Vite 客户端类型；保持声明文件没有普通 `import`，以确保 Vite 全局类型声明按预期生效。
2. 在 `apps/web/tsconfig.json` 中显式启用 `noUncheckedSideEffectImports`。这样锁定的 TypeScript 5.9.3 也会检查 CSS 导入，并能在 CI/本地构建时发现拼写错误，而不依赖开发者的编辑器版本。
3. 不改 VS Code TypeScript SDK 设置。补全资源类型后，VS Code 内置的较新 TypeScript 与工作区编译器都能正确处理 CSS 导入；强制编辑器降级会掩盖更严格的诊断。

## 验证

- 修复前基线：`pnpm dlx --package typescript@6.0.3 tsc --noEmit --project apps/web/tsconfig.json --pretty false` 报 `TS2882`。
- 修复后使用工作区 TypeScript 5.9.3 执行 `pnpm --filter @smartq/web build`。
- 修复后再次执行上述 TypeScript 6.0.3 定向命令。
- 对变更文件执行格式检查、前端 lint 和 OpenSpec 校验；不运行 Vitest，因为本改动没有运行时业务逻辑。
