# 提案：修复 Vite CSS 导入的 TypeScript 诊断

## Why（背景）

VS Code 在 `apps/web/src/main.tsx` 的 `import './styles.css'` 上报告 TS2882。项目构建使用 TypeScript 5.9.3，默认不会校验无法解析的副作用导入；VS Code 当前使用 TypeScript 6.0.3，默认开启该校验，因此同一份代码在编辑器中报错、在构建中通过。

前端尚未引用 Vite 客户端类型，TypeScript 无法识别 CSS 资源导入。这是工程类型配置缺失，不是 CSS 文件不存在，也不会影响 Vite 的实际打包。

## What Changes（变更范围）

- 在前端加入 Vite 客户端类型入口，让 CSS 等资源副作用导入拥有明确类型声明。
- 在前端 TypeScript 配置中显式开启副作用导入校验，使 TypeScript 5.9 的构建检查与 TypeScript 6 的默认行为一致。
- 用 TypeScript 5.9 工作区构建和 TypeScript 6.0.3 定向检查验证修复。

## 明确不做

- 不修改页面功能、样式或产品行为。
- 不升级项目 TypeScript 依赖，也不强制开发者降级 VS Code 内置 TypeScript。
- 不调整 Node.js 运行时、依赖版本或其他质量门禁。

## 成功标准

- TypeScript 5.9 与 6.0.3 均能通过前端类型检查。
- VS Code 中 `main.tsx` 的 `./styles.css` TS2882 诊断消失。
- 未识别的副作用导入会被项目构建检查发现。
