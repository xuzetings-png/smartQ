# 任务清单：zero-diagnostics-node24

## 复现与方案

- [x] 确认 `.nvmrc`、NVM 默认别名和登录 zsh 都指向 Node.js 24；确认命令宿主的直接 PATH 仍注入 Node.js 20。
- [x] 确认编辑器 TypeScript 6 与仓库 TypeScript 5.9 版本不一致的诊断来源。
- [x] 定义仓库支持的文件诊断范围，并为纯工程改动声明 `skip_specs: true`。

## 终端与编辑器

- [x] 配置 macOS 集成及自动化终端重新加载登录环境。
- [x] 配置工作区 TypeScript SDK、格式化和静态检查扩展建议。

## 静态诊断门禁

- [x] 让 Prettier 扫描全仓库受支持文件，并让 ESLint 覆盖根级工程配置且拒绝警告。
- [x] 增加 Stylelint、Shell 语法和 Docker Compose 配置检查。
- [x] 新增统一 `check:diagnostics` 命令并接入 `pnpm quality` 与 CI。
- [x] 在 `AGENTS.md`、工程质量说明中记录诊断清零和新增文件类型规则。

## 验收与归档

- [x] 使用 Node.js 24 执行格式、lint、样式、Shell、Compose、OpenSpec 和构建检查；完整 `pnpm quality` 通过。
- [x] 用 Node.js 20 定向确认运行时检查拒绝错误版本。
- [x] 检查 VS Code 工作区设置与依赖锁文件。
- [x] 将所有任务完成的变更归档。
