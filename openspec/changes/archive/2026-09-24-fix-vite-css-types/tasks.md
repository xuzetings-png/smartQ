# 任务清单：fix-vite-css-types

## 诊断

- [x] 从 VS Code 问题面板确认 `main.tsx` 第 6 行的 TS2882 诊断。
- [x] 用 TypeScript 6.0.3 命令复现，并确认引入 `vite/client` 类型后诊断消失。
- [x] 确认当前前端只有一条副作用导入，避免遗漏同类导入。

## 修复

- [x] 记录根因、范围和验证方式，声明本工程修复不需要产品规格增量。
- [x] 为前端加入 Vite 客户端类型声明。
- [x] 在前端 TypeScript 配置中显式开启副作用导入校验。

## 验收

- [x] TypeScript 5.9.3 前端构建通过。
- [x] TypeScript 6.0.3 定向检查通过。
- [x] OpenSpec、格式和 lint 检查通过；变更归档到 `archive/2026-09-24-fix-vite-css-types/`。
