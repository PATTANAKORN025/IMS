# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中处理代码提供指导。

> **请先阅读 `AGENTS.md`。** 它是此仓库中所有 AI agent 的技术权威准则（不可违背的架构规则、Grafana 设计规范、Node-RED 沙箱限制、回复语气模式）。本文件涵盖命令与宏观架构；`AGENTS.md` 则涵盖绝不可触犯的硬性约束。

## 项目概述

IMS（Industrial Monitoring System，工业监控系统）——一个 OT/IT 遥测监控平台。它是一个 Docker Compose 栈，而非普通应用程序：绝大多数“代码”是 Node-RED 流 JSON、SQL 迁移、Grafana 仪表板 JSON 以及两个 Node 微服务。没有打包器，没有测试框架，也没有 TypeScript 构建——测试均为独立的 `node script.js` 脚本，遇到失败时退出码非零。

## 常用命令（Commands）

日常运维通过 `make` 执行。**Makefile 混合了不同 Shell 的语法，并非完全跨平台**：仅 `verify` 会根据 `$(OS)` 分支。`doctor` 使用 CMD 风格的 `2>NUL`；`deploy-flows` 需要 `jq` 以及 Bash 进程替换 `<(...)`；`backup`、`restore`、`test-load`、`snapshot-flows` 需要 POSIX Shell。在 Windows 环境下，请在 Git Bash 中运行这些命令。

| 命令 | 功能说明 |
| --- | --- |
| `make doctor` | 检查前置依赖（docker, compose, node） |
| `make up` | 先执行 `build-flows`，然后在基础文件上运行 `docker compose up -d` |
| `make up-prod` | 使用 `docker-compose.prod.yaml` 覆盖层启动（生产资源配额限制） |
| `make down` / `make restart` / `make logs` | 停止 / 重启核心容器 / 查看 Node-RED 日志 |
| `make verify` | 全系统健康检查——容器、数据库、数据流水线、告警 |
| `make build-flows` | 将 `nodered_data/flows/*.json` 合并至 `nodered_data/flows.json` |
| `make validate-flows` | 构建并校验 flows.json 是否为合法数组且无重复节点 ID |
| `make deploy-flows` | 将合并后的流 POST 发送至 `127.0.0.1:1880` 的 Node-RED |
| `make snapshot-flows` | 部署前备份 `flows.json` 至 `backups/` 目录 |
| `make validate-dashboards` | 扫描仪表板中是否存在损坏的 Hex 颜色代码 |
| `make test-unit` | 针对解析器与系统边界的 4 项核心单元测试 |
| `make test-load` | k6 压力测试（`tests/k6/pipeline-stress.js`） |
| `make test-visual` / `make test-visual-ldi` | 基于 Playwright 的仪表板截图回归测试 |
| `make backup` / `make restore FILE=<path>` | 数据库转储 / 恢复 |

### 运行单项测试（Running a single test）

每个测试都是独立的 Node 脚本——可直接运行：

```bash
node tests/unit/factory-twin-alarm.test.js     # 单项单元测试
node tests/lint/query-budget-linter.js         # 单项代码规范校验
npm run validate:floor1-geometry               # 校验一楼几何数据（文件缺失时安全跳过）
```

`tests/unit/` 和 `tests/lint/` 是无基础设施依赖的快速测试层——它们在 pre-commit 钩子与 CI 中运行，绝不可依赖实时数据库或网络。而 `tests/e2e/`、`tests/smoke/`、`tests/data-quality/`、`tests/perf/`、`tests/resilience/`、`tests/disaster-recovery/` 则需要整个运行栈处于启动状态。

### 综合保障测试运行器（Aggregate assurance runner）

`scripts/production-assurance.js` 将较重的测试层打包为不同的 Profile，并将综合结果输出至 `docs/evidence/runtime/`：

```bash
node scripts/production-assurance.js --profile=fast      # 默认配置
node scripts/production-assurance.js --profile=release
node scripts/production-assurance.js --profile=full --allow-container-kill
```

其他 Profile：`security`（`--full`）、`load`、`dr`。任一 Profile 绝不会运行超出其清单范围的测试类别。

### Pre-commit / CI

`.husky/pre-commit` 会运行 `node scripts/pre-commit.js`：包含单元测试、`tests/lint/` 下的代码校验器、各仪表板的 JSON 校验以及流 JSON 校验。`.github/workflows/ci.yml` 运行大致相同的测试集合，外加 gitleaks、Compose 校验、Prometheus 配置/规则校验以及私有数据泄露扫描器。**两处均硬编码了单个测试路径**——`tests/unit/` 中的新文件不会自动被收录，必须手动添加到 `scripts/pre-commit.js` 与 `.github/workflows/ci.yml` 中。提交信息必须符合 Conventional Commits 规范（由 `commitlint.config.js` 检查）。

## 系统架构（Architecture）

### 数据路径（Data path）

```text
SNMP 设备 / LDI 机台 (HTTP)
  -> Node-RED (数据摄取, 解析, 重试队列)
  -> PgBouncer (事务级连接池, plain 鉴权, 禁止预处理语句)
  -> TimescaleDB (public 模式中的超表 + 持续聚合)
  -> Grafana (仪表板) / Prometheus + Alertmanager (推送告警至 LINE, Teams)
```

### 单一前端入口（The single front door）

除 nginx 外，任何服务均不对主机发布 UI 端口。`proxy/nginx.conf` 监听在 `${GRAFANA_PORT:-3000}` 上，并以同源方式路由，使所有请求均携带 Grafana 的会话 Cookie：

- `/` 转发至 `grafana:3000`
- `/alarm-api/` 转发至 `alarm-api:4000`（通过 nginx `auth_request` 对 Grafana 的 `/api/user` 进行鉴权控制）
- `/factory-twin-3d/` 转发至 `factory-twin-3d:4100`
- `/ldi-telemetry`、`/inject` 转发至 `node-red:1880`

Grafana 本身**不对外**发布独立端口。当某服务在容器内直连正常但通过 `localhost:3000` 无法访问时，应首先排查 nginx。Prometheus、Alertmanager、Blackbox 和 Node-RED 仅绑定至 `127.0.0.1`。

### 容器清单（Containers）

`docker-compose.yaml` 中定义了 15 个服务，容器均以 `ims-*` 命名：`timescaledb`、`pgbouncer`、`db-migrate`（一次性迁移运行器，通过 `scripts/migrate-entrypoint.sh` 执行，为唯一规范运行器）、`node-red`、`grafana`、`renderer`（Grafana 图像渲染器）、`proxy`、`prometheus`、`alertmanager`、`blackbox-exporter`、`snmpsim`、`alarm-api`、`factory-twin-3d`、`observability-archiver`、`pgadmin`。

基础 Compose 文件**没有使用 `profiles:` 进行过滤**——`make up` 和 `make up-prod` 均会启动全部 15 个服务，包括 SNMP 模拟器和 pgAdmin。除 nginx 统一入口外，`pgadmin` 是唯一在所有接口上发布端口的服务（`5050:80`）；其余发布端口均绑定于 `127.0.0.1`。

机密数据来源于 `.env`，采用 `${VAR:?message}` 强制环境变量语法——`.env.example` 列出了所有键。示例值为公开信息，切勿在一次性测试环境之外复用。

### Node-RED (`nodered_data/`)

`nodered_data/flows/*.json` 是**唯一真实来源（source of truth）**；`flows.json` 是由 `scripts/build-flows.js` 生成的构建产物（合并 + 检查重复节点 ID）。绝不可手动修改 `flows.json`。函数节点运行在沙箱环境中，不支持 `require()` 与 `structuredClone`——详见 `AGENTS.md` 第 3 节关于替代方案以及强制要求的 O(N) 单遍扫描 + 显式 GC 模式。

### 数据库 (`database/migrations/`)

以数字编号、仅向前推进的 SQL 文件由一次性 `db-migrate` 容器通过 `scripts/migrate-entrypoint.sh` 执行，并在 `public.schema_migrations` 中记录已应用的版本。该入口脚本为唯一的标准运行器——`scripts/migrate.sh` 仅用于手动重新执行的包装命令。所有对象均位于 `public` 模式。原始超表使用 `time` 列；持续聚合使用 `bucket`——Grafana 中别名为 `bucket AS time`。多数仪表板查询应面向 CAGG 聚合表而非原始表；`tests/lint/query-budget-linter.js` 会强制校验这一分层约定。

### Grafana (`monitoring/grafana/`)

仪表板以只读方式从 `dashboards/drilling/`、`manufacturing/`（LDI）、`infrastructure/` 与 `vcp/` 进行配置，每个目录对应一个 Grafana 文件夹。钻孔与 VCP 仪表板使用数据源 `drilling-timescaledb`，读取独立的 `eap_backup` 数据库（工厂数据，不在 git 中；`docs/data/MOCK_DATA.md` 可构建合成数据库）。所有修改应在 git 中的 JSON 文件进行，而非在 Web 界面中操作。`tests/lint/dashboard-linter.js` 会强制校验 `AGENTS.md` 第 4 节中的栅格与色彩 Token 规则（每行总宽恰好为 24 列，仅使用规范颜色 Token，SQL 中模板变量必须用引号包裹）。

### 微服务 (`services/`)

- **`alarm-api/`** — Express + `pg`。唯一的操作员写入路径：支持操作人鉴权控制下的 `POST /alarms/ack`、`POST /alarms/resolve`，以及 `GET /healthz`。
- **`factory-twin-3d/`** — 生产级一楼数字孪生（Express，约 7000 行）。业务逻辑位于 `lib/*.js`（`mapping`、`telemetry`、`alarm`、`analytics`、`evidence`、`wire`、`schematic`、`floors`、`spc`、`eap-map`、`predictive` 等）；浏览器渲染前端位于 `public/`。核心铁律：**几何体与设备身份必须经过证据验证**——若无确认的设备至 CAD 映射，无论存在何种遥测数据，均不得在线挂载。`tests/lint/floor1-cad-reconciliation.js` 和 `floor1-orientation.js` 负责将服务模型与 CAD 记录进行比对。

一楼 CAD 源数据属于机密信息，不纳入 git 跟踪；`tests/lint/private-data-leak-scanner.js` 会在 CI 中最先执行，且在数据缺失时几何校验器会安全跳过。公开文档仅可说明由 CAD 衍生的计数、规则与结论，绝不可公开具体尺寸、坐标、面积、图层名称或标注文字。

## 重要约定

- **文档计数受 linter 监督。** `tests/lint/doc-overclaim-linter.js` 会拦截以特定句式硬编码仪表板/服务/迁移总数的描述文本。请使用生成脚本（`scripts/generate-dashboard-inventory.js --check`、`generate-schema-inventory.js`、`generate-docs-readme-index.js --check`），切勿手动输入总数。
- **三语文档体系。** `docs/`（英文）在 `th/` 与 `zh-CN/` 中具有镜像目录。现行文档（README、操作手册、架构）全文翻译；带日期的证据与审计记录保留英文原文并在本地化说明后呈现。跳过镜像的单语修改会导致文档脱节。
- **证据重于断言。** 文档中的所有结论均需有 `docs/evidence/` 下的构建产物支撑；测试保障工具会在该目录下写入最新结果。切勿为刻意未设阈值的检查项虚构通过/失败标准（参见 `tests/e2e/runner.js` 注释）。
- **Windows 注意事项。** PowerShell 会损坏流 JSON 中的 `\n`——修改多文件流时请务必使用 Python 或 Node 脚本，切勿使用 PowerShell 字符串替换。
