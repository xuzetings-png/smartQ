# 数据接入与问数资源配置

## ADDED Requirements

### Requirement: 配置本地演示数据库端口

系统应允许用户通过 `MYSQL_HOST_PORT` 配置 Compose 演示 MySQL 的本机访问端口；未设置时应使用 3306。演示数据灌入脚本必须使用相同端口。API 和灌数脚本必须能够从仓库根目录读取 `.env.local`。`SMARTQ_DEMO_DATE` 留空时，灌数脚本应使用当天日期。

#### 场景：使用默认端口

- WHEN 用户没有设置 `MYSQL_HOST_PORT`
- THEN 演示数据库通过本机 3306 端口访问
- AND 样例数据脚本连接本机 3306 端口
- AND API 与灌数脚本均读取仓库根目录 `.env.local`

#### 场景：默认端口已被占用

- WHEN 用户将 `MYSQL_HOST_PORT` 设置为其他可用端口，例如 3307
- THEN Compose 将该本机端口映射到容器 MySQL 的 3306 端口
- AND 样例数据脚本通过配置的本机端口连接数据库
- AND 用户可在数据源管理页填写相同端口完成连接
- AND API 与灌数脚本均读取仓库根目录 `.env.local`
