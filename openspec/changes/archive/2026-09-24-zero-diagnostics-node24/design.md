# 技术设计：统一编辑器与质量门禁诊断

## 文档状态

纯工程护栏变更，不改变产品行为。`.openspec.yaml` 声明 `skip_specs: true`；仍保留本提案、设计和任务，并由 OpenSpec 校验。

## 技术方案

### Node.js 24 终端

- `.nvmrc` 继续作为仓库 Node.js 主版本的唯一来源，`package.json` `engines` 与 `scripts/check-runtime.mjs` 继续约束 24.x。
- VS Code 工作区配置为 macOS 集成终端使用 `/bin/zsh` 登录模式，并关闭宿主环境继承；自动化终端也使用登录 zsh。登录配置已初始化 NVM，并将默认别名设置为已安装的 Node.js 24.9.0。
- 配置仅影响新建的集成终端。现有终端需关闭后新建；Codex 工具运行器的直接子进程可能独立注入 Node.js 20，因此项目命令仍以 `pnpm check:runtime` 为强制失败保护，并在该环境下通过登录 zsh 执行。

### 编辑器诊断版本

- `.vscode/settings.json` 使用 `js/ts.tsdk.path` 指向 `apps/web/node_modules/typescript/lib`，并开启工作区版本切换提示。
- VS Code 首次打开时提示选择工作区版本；若状态栏没有显示 `apps/web/package.json` 中的版本，执行 `TypeScript: Select TypeScript Version` 并选择工作区版本。
- 推荐安装 ESLint、Prettier 和 Stylelint 扩展；扩展用于即时反馈，命令行门禁仍是最终验收依据。

### 静态诊断闭环

- `pnpm format:check` 使用 Prettier 扫描全仓库支持的 JavaScript、TypeScript、JSON、CSS、HTML、Markdown 和 YAML 文件；生成物和锁文件由 `.prettierignore` 排除。
- ESLint 从仓库根目录扫描 JavaScript / TypeScript 文件，包含应用、共享包、测试和工程配置；以 `--max-warnings 0` 将警告也视为门禁失败。
- Stylelint 使用官方标准 CSS 配置检查仓库 CSS；Vite 生产构建继续检查样式解析与打包。
- `bash -n` 检查演示数据库初始化脚本的 Bash 语法；`docker compose config --quiet` 检查 Compose 文件结构和环境变量替换，不启动容器。
- 工作区构建执行 TypeScript 项目检查和 Vite 生产构建；OpenSpec 检查变更文档结构。
- `check:diagnostics` 串联格式、ESLint、Stylelint、Shell、Compose 与构建；`quality` 继续额外执行运行时、OpenSpec 和回归用例检查。

### 扩展规则

- 新增源码或配置文件类型时，先确定编辑器诊断来源，再将对应可执行检查加入 `check:diagnostics` 并同步 CI。
- 修复原始诊断，不用忽略文件、降低规则或无理由禁用检查来清零。
- “零诊断”范围指仓库声明并可重现的项目错误与警告。个人安装的扩展、远程服务或编辑器缓存产生的诊断不属于仓库可保证的结果；若怀疑此类差异，先确认所用语言服务与本地工具版本。

## 验收

- 在 Node.js 24 下，静态诊断命令和完整 `pnpm quality` 通过。
- 在 Node.js 20 下，`pnpm check:runtime` 给出要求 24.x 的明确失败信息。
- 对新增 CSS、Shell、TypeScript、配置和 Markdown 文件的覆盖范围可从对应命令与 Prettier 扫描 glob 确认。
