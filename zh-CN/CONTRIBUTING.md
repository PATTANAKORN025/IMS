# 参与贡献 IMS

> **IMS 参与贡献指南 (Guidelines สำหรับการร่วมพัฒนา IMS)**

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **贡献:** 指南
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **许可证:** MIT

</div>

---

## 开发工作流

1. Fork 本仓库
2. 从 `main` 创建一个特性分支 (feature branch)
3. 遵循项目约定进行更改
4. 在提交 (commit) 前运行 `make verify`
5. 提交一个拉取请求 (Pull Request)

---

## 项目约定

### Node-RED 流程

- `nodered_data/flows/*.json` 是**事实来源 (source of truth)**，按关注点划分 (`ingestion.json`, `ldi_ingestion.json`, `ldi_simulator.json`, `ldi_alarm_simulator.json`, `alerting.json`) — 永远不要手动直接编辑 `nodered_data/flows.json`，它是一个**构建产物 (build artifact)**。
- 编辑完源流程文件后，运行 `node scripts/build-flows.js` 重新生成 `nodered_data/flows.json`，然后运行 `make restart` 应用更改。
- Function 节点使用 `global.get('parser')` / `global.get('circuit-breaker')`（来自 `nodered_data/lib/`）— Node-RED 的沙盒函数 VM 中无法使用 `require()` 引入任意的 npm 包。
- `flows.json` 中的 `func` 字段是单行 JSON 字符串 — 如果您需要手动检查构建的文件，请保留 `\n` 转义序列。

```bash
# Validate every source flow file is syntactically valid JSON
for f in nodered_data/flows/*.json; do
 node -e "const j=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('Valid:', j.length, 'nodes —', '$f')"
done
```

### 数据库

- 所有对象都位于 `public` 模式 (schema) 中。
- 当针对该用例已经存在连续聚合 (continuous aggregate) 或物化视图时，永远不要从仪表板直接查询原始超表 (`ldi_data`, `sys_metrics`, `net_metrics`) — 有关当前视图/连续聚合清单，请参阅 `docs/architecture/DATABASE_SCHEMA.md`。`tests/lint/query-budget-linter.js` 强制执行此规则。
- 每次迁移 (migration) 都是 `database/migrations/` 目录下一个按顺序编号的新文件（当前为 013–082，由 `db-migrate` 服务按顺序应用）。**迁移被合并后，切勿编辑或重新编号** — 修正应该始终是*下一个*数字。有关完整的版本控制策略，请参阅 `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §7。
- 对于任何到达 SQL 的用户提供字符串，必须使用 `sanitize()`（来自 `nodered_data/lib/parser.js`，通过 `global.get('parser')` 导出）— 对 SQL 注入零容忍。

### Grafana

- 编辑 `monitoring/grafana/dashboards/infrastructure/` (NOC, Capacity, Engineering Drill-Down, Meta-Monitoring) 或 `monitoring/grafana/dashboards/manufacturing/` (LDI 套件) 中的仪表板 JSON 文件 — 有关域边界，请参阅 `docs/architecture/OWNERSHIP.md`，有关完整清单，请参阅 `docs/architecture/DASHBOARD_INVENTORY.md`。
- 在面板 SQL 中使用 `ROUND(x::NUMERIC, N)` — PostgreSQL 的 `ROUND()` 仅接受 `NUMERIC`，不接受 `DOUBLE PRECISION`。
- 数据源 UID 必须是 `timescaledb`，而不是模板变量或其他名称。
- 仅使用批准的颜色标记集 (`docs/architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1) — `dashboard-linter.js` 检查 15 会在提交时强制执行此规则。
- 在提交任何仪表板 JSON 更改之前运行 `node tests/lint/dashboard-linter.js`；pre-commit 钩子会自动运行它。

### 安全

- 永远不要提交密钥、密码或 API 令牌。`.gitleaks.toml` 会在 CI 中扫描此类问题。
- 对敏感值使用 Docker secrets（位于 `secrets/` 目录中，已被 git 忽略）。
- 按照 `SECURITY.md` 的漏洞报告流程报告安全问题 — 不要公开创建 GitHub Issue。
- 所有 AI 工具（MCP 服务器、技能、插件）必须开源 (MIT/ISC/BSD/Apache-2.0) — 参阅 `SECURITY.md` 的 AI Tooling Security 部分。

---

## 提交信息

遵循 [约定式提交 (Conventional Commits)](https://www.conventionalcommits.org/)：

| 类型 (Type) | 用法 (Usage) | 示例 (Example)                                         |
| ----------- | ------------ | ------------------------------------------------------ |
| `feat:`     | 新功能       | `feat(snmp): add LDI walker for manufacturing metrics` |
| `fix:`      | Bug 修复     | `fix(parser): correct counter wraparound detection`    |
| `docs:`     | 仅限文档     | `docs: upgrade enterprise documentation suite`         |
| `refactor:` | 代码重构     | `refactor(flows): split ingestion and alerting`        |
| `chore:`    | 维护工作     | `chore(ci): add Gitleaks security scanning`            |
| `test:`     | 添加测试     | `test(k6): add database write stress test`             |
| `security:` | 安全修复     | `security: remove hardcoded credentials`               |

### 分支命名

```text
feat/<topic>  # 新功能
fix/<topic>  # Bug 修复
chore/<topic>  # 维护工作
docs/<topic>  # 文档
refactor/<topic> # 代码重构
test/<topic>  # 测试
security/<topic> # 安全修复
```

---

## 测试

```bash
# Unit tests (5 files, 99 assertions)
make test-unit

# K6 load tests
make test-load

# Full deployment verification
make verify

# Dashboard/alarm/query-budget/RCA-coverage linters
node tests/lint/dashboard-linter.js
node tests/lint/alarm-sync-linter.js
node tests/lint/query-budget-linter.js
node tests/lint/rca-mapping-coverage.js
node tests/lint/orphan-object-linter.js

# Golden-dataset SPC formula check
node tests/e2e/golden-dataset-spc.js
```

---

## 项目结构

```text
IMS/
├── docker-compose.yaml   # Main orchestration
├── nodered_data/
│ ├── flows/     # Node-RED flows, split by concern (Source of Truth)
│ ├── lib/      # circuit-breaker.js, parser.js, snmp-normalize.js, units.js
│ ├── flows.json    # Built by scripts/build-flows.js from flows/*.json -- don't hand-edit
│ ├── Dockerfile    # Custom build: installs npm dependencies
│ └── settings.js    # Runtime settings
├── postgres/init/    # DB schema bootstrap (fresh-deploy path)
├── database/migrations/   # TimescaleDB migrations, applied by the db-migrate service
├── monitoring/
│ ├── grafana/dashboards/
│ │ ├── infrastructure/  # NOC, Capacity, Engineering Drill-Down, Meta-Monitoring (4)
│ │ └── manufacturing/  # LDI Manufacturing, Andon, Engineering Analytics, Machine
│ │       # Snapshot, Data Readiness, Fleet at a Glance (6)
│ ├── grafana/library-panels/ # Shared Grafana Library Panels
│ └── prometheus/rules/  # Alert rules
├── scripts/      # Utility scripts
├── tests/
│ ├── lint/     # Dashboard/alarm/query-budget/RCA/orphan linters
│ ├── unit/     # Parser & counter unit tests
│ ├── e2e/      # Panel data, query timing, golden-dataset checks
│ ├── k6/      # Load tests
│ └── playwright/    # Visual/layout regression
└── docs/      # Documentation -- start at docs/architecture/IMS_PLATFORM_BOOK.md
```

---

## 代码审查清单

- [ ] 代码中没有密钥或凭据
- [ ] SQL 使用 `sanitize()`（来自 `nodered_data/lib/parser.js`）处理用户输入
- [ ] Flow JSON 在 `nodered_data/flows/*.json` 中编辑，然后通过 `node scripts/build-flows.js` 重新构建
- [ ] Grafana 数据源 UID 为 `timescaledb`
- [ ] 仪表板 JSON 通过 `node tests/lint/dashboard-linter.js` 检查
- [ ] 测试通过 (`make verify`)
- [ ] 必要时已更新文档 — 包括 `docs/architecture/DASHBOARD_INVENTORY.md` / `DATABASE_SCHEMA.md` (两者均自动生成：`node scripts/generate-dashboard-inventory.js` / `node scripts/generate-schema-inventory.js`，CI 会检查)

---

<div align="center">

**IMS 参与贡献指南 — 版本 2.0，更新于 2026-08-10**

</div>
