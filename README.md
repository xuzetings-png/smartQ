# SmartQ

SmartQ 是用于学习和演示自然语言问数链路的本地项目。当前实现从数据源管理页开始：连接 MySQL、浏览数据表、预览样例行，并创建待配置的问数资源。

## 运行要求

- Node.js 24
- pnpm 10.34.2
- Docker Desktop 或支持 Docker Compose 的环境

## 首次启动

```bash
cp .env.example .env.local
```

编辑 `.env.local`，设置本机演示用的数据库密码和 64 位十六进制加密密钥。可通过 `openssl rand -hex 32` 生成加密密钥。`SMARTQ_DEMO_DATE` 可选，格式为 `YYYY-MM-DD`；未设置时合成数据以运行种子命令当天为基准。

```bash
pnpm install
pnpm db:up
pnpm db:seed
pnpm dev
```

浏览器打开 <http://127.0.0.1:5173>。第一次使用时，在“数据源管理”页使用 Compose 演示库的连接参数：主机 `127.0.0.1`、端口 `3306`、数据库 `smartq_demo`、用户 `smartq_reader`、密码为 `.env.local` 中的 `MYSQL_READER_PASSWORD`。

## 常用命令

- `pnpm db:up`：启动 MySQL。
- `pnpm db:down`：停止 MySQL 并保留演示数据卷。
- `pnpm db:seed`：清空并重灌可重复生成的 304 条合成订单；日期以 `SMARTQ_DEMO_DATE` 或当天为基准。
- `pnpm build`：构建工作区中的前端和 API。
- `pnpm lint`：运行 ESLint 代码检查。
- `pnpm test`：运行 Vitest 回归用例。
- `pnpm format`：用 Prettier 格式化源码和配置文件。
- `pnpm format:check`：检查格式，不修改文件。
- `pnpm quality`：运行环境、OpenSpec、格式、lint、回归用例和构建的统一门禁。

代码结构、组件拆分、类型、错误处理和质量门禁约定见 [编码规范](docs/engineering/code-guidelines.md)。持续迭代流程见 [迭代护栏](docs/engineering/harness.md) 和 [SDD 工作流](openspec/README.md)。

首次创建只读数据库用户后，如需修改 `MYSQL_READER_PASSWORD`，需重建本地演示数据卷后再启动：`docker compose --env-file .env.local -f demo/mysql/compose.yaml down -v`。此操作会清除本地 MySQL 演示数据。

SmartQ 在本地 SQLite 中保存配置；数据源密码使用 AES-256-GCM 加密，加密密钥从 `.env.local` 读取。不要提交 `.env.local`、`data/` 或本地 SQLite 文件。
