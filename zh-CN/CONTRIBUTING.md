# 参与贡献 IMS

> **IMS 贡献指南**

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **贡献：** 指南
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **许可证：** MIT

</div>

---

## 开发流程

1. 维护者从最新的 `main` 创建分支；外部贡献者先复刻（fork）仓库。
2. 按下文的项目约定进行修改。
3. 提交。Husky 的 pre-commit 钩子会运行 `node scripts/pre-commit.js`（单元测试、`tests/lint/` 下的 linter、仪表板与 flow 的 JSON 校验）；若禁用了钩子，请手动运行。
4. 若改动涉及运行中的栈，请在打开 pull request 之前对本地栈运行 `make verify`。
5. 向 `main` 打开 pull request。`main` 的规则集要求：1 个批准（推送新提交后旧的批准会失效）、所有评审讨论已解决、分支为最新且 `validate-architecture` 状态检查通过，以及线性历史——只能使用 **squash** 或 **rebase** 合并，禁止合并提交。`main` 禁止强制推送与删除。

> [!NOTE]
> 目前 `.github/workflows/` 中没有任何作业会上报名为 `validate-architecture` 的检查，因此该必需检查永远无法通过，合并只能依靠管理员绕过。请将某个 CI 作业重命名为该名称，或将规则集改为实际的作业名称（`lint`、`unit-tests` 等）。

> [!IMPORTANT]
> 本仓库是公开的。每次推送前，请检查 diff 中是否含有密钥、生产数据、源自 CAD 的厂房数据、真实设备/产线编号、批号、内部主机名以及个人数据——见 [SECURITY.md](SECURITY.md#本仓库为公开仓库)。在存有本地数据导出文件的工作区中，切勿使用 `git add .`。

---

## 项目约定

### Node-RED Flows

- `nodered_data/flows/*.json` 是**唯一事实来源**，按职责拆分（`ingestion.json`、`ldi_ingestion.json`、`ldi_simulator.json`、`ldi_alarm_simulator.json`、`alerting.json`）——切勿手动编辑 `nodered_data/flows.json`，它是**构建产物**。
- 修改源 flow 文件后，运行 `node scripts/build-flows.js`（或 `make build-flows`）重新生成 `nodered_data/flows.json`，然后运行 `make restart` 使其生效。
- function 节点使用 `global.get('parser')` / `global.get('circuitBreaker')`（来自 `nodered_data/lib/`，在 `settings.js` 的 `functionGlobalContext` 中注册）——在 Node-RED 沙箱化的 function VM 中无法 `require()` 任意 npm 包。其他沙箱限制见 `AGENTS.md` 第 3 节。
- `flows.json` 中的 `func` 字段是单行 JSON 字符串——如需手动查看构建后的文件，请保留 `\n` 转义序列。在 Windows 上请用 Node 或 Python 编辑 flow JSON，切勿使用 PowerShell 字符串替换。

```bash
# Validate every source flow file is syntactically valid JSON
for f in nodered_data/flows/*.json; do
 node -e "const j=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('Valid:', j.length, 'nodes —', '$f')"
done
```

### 数据库

- 所有对象都位于 `public` schema。
- 若某个用例已有连续聚合或物化视图，切勿在仪表板中直接查询原始 hypertable（`ldi_data`、`sys_metrics`、`net_metrics`）——当前视图/CAGG 清单见 `docs/architecture/DATABASE_SCHEMA.md`。`tests/lint/query-budget-linter.js` 会强制执行此规则。
- 每个迁移都是 `database/migrations/` 中按序编号的新文件（目前编号至 `082`，由 `db-migrate` 服务按顺序应用）。**迁移一旦合并，切勿修改或重新编号**——更正永远使用_下一个_编号。完整的版本策略见 `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §7。
- 在 function 节点中，凡是进入 SQL 的用户输入字符串，都要使用 `sanitize()`（来自 `nodered_data/lib/parser.js`，通过 `global.get('parser')` 导出）——对 SQL 注入零容忍。Node 服务使用参数化查询。

### Grafana

- 在 `monitoring/grafana/dashboards/infrastructure/`（NOC Overview、Engineering Drill-Down、AIOps & Capacity、Meta-Monitoring、Ingestion Latency）或 `monitoring/grafana/dashboards/manufacturing/`（LDI 套件）中编辑仪表板 JSON 文件——领域边界见 `docs/architecture/OWNERSHIP.md`，完整清单见 `docs/architecture/DASHBOARD_INVENTORY.md`。
- 面板 SQL 中使用 `ROUND(x::NUMERIC, N)`——PostgreSQL 的双参数 `ROUND()` 只接受 `NUMERIC`，不接受 `DOUBLE PRECISION`。
- 数据源 UID 必须是 `timescaledb`，不能是模板变量或其他名称。
- 只使用已批准的颜色 token 集（`docs/architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1）——`dashboard-linter.js` 的 Check 15 会在提交时强制检查。
- 每次修改仪表板 JSON 前运行 `node tests/lint/dashboard-linter.js`（pre-commit 钩子会自动运行）；新增、重命名仪表板或面板数量变化时，用 `node scripts/generate-dashboard-inventory.js` 重新生成清单。

### 安全

- 切勿提交密钥、密码或 API 令牌。真实值只存放在 `.env`（已被 gitignore 忽略）中；`.env.example` 只保存公开的占位值。
- `.gitleaks.toml` 用于配置 CI 的密钥扫描，但目前该扫描不阻断构建且只扫描工作区——推送敏感改动前，请在本地对完整历史运行 `gitleaks detect`。
- 按 `SECURITY.md` 的漏洞报告流程报告安全问题——不要使用公开的 GitHub issue。
- 所有 AI 工具（MCP 服务器、skill、插件）都必须是开源的（MIT/ISC/BSD/Apache-2.0）——见 `SECURITY.md` 的 AI 工具安全一节。

### 文档

- `docs/` 下的文档为英文，`th/` 与 `zh-CN/` 为其镜像。修改现行文档（README、手册、运维手册、架构）时，请在同一个 pull request 中同步更新两个镜像。带日期的证据与审计记录保持以英文原文为准。
- 不要手写仪表板、服务或迁移的总数；`tests/lint/doc-overclaim-linter.js` 会拒绝这类内容。请改用生成器。

---

## 提交信息

提交信息由 commitlint 按 `@commitlint/config-conventional`（[Conventional Commits](https://www.conventionalcommits.org/)）检查。允许的类型：`build`、`chore`、`ci`、`docs`、`feat`、`fix`、`perf`、`refactor`、`revert`、`style`、`test`。

| 类型 | 用途 | 示例 |
| --- | --- | --- |
| `feat:` | 新功能 | `feat(snmp): add LDI walker for manufacturing metrics` |
| `fix:` | 缺陷修复（包括安全修复，使用 `security` 作用域） | `fix(security): remove hardcoded credentials` |
| `perf:` | 性能改进 | `perf(factory-twin): cache private geometry file reads` |
| `docs:` | 仅文档 | `docs(runbook): correct nginx reload command` |
| `refactor:` | 代码重构 | `refactor(flows): split ingestion and alerting` |
| `test:` | 新增测试 | `test(k6): add database write stress test` |
| `ci:` / `build:` | CI 流水线 / 构建与镜像 | `ci: make gitleaks blocking` |
| `chore:` | 维护 | `chore(repo): update .gitignore` |

### 分支命名

```text
feat/<topic>      # New features
fix/<topic>       # Bug fixes
perf/<topic>      # Performance work
chore/<topic>     # Maintenance
docs/<topic>      # Documentation
refactor/<topic>  # Code restructuring
test/<topic>      # Tests
security/<topic>  # Security fixes (commit type is still fix)
```

---

## 测试

```bash
# Full pre-commit suite: every wired unit test, the tests/lint linters, dashboard + flow JSON validation
node scripts/pre-commit.js

# Only the 4 core parser/boundary unit tests
make test-unit

# Individual linters
node tests/lint/dashboard-linter.js
node tests/lint/alarm-sync-linter.js
node tests/lint/query-budget-linter.js
node tests/lint/rca-mapping-coverage.js
node tests/lint/private-data-leak-scanner.js

# Need a running stack
make verify
make test-load
node tests/lint/orphan-object-linter.js
node tests/e2e/golden-dataset-spc.js
```

`tests/unit/` 中的新文件不会被自动纳入：需要同时加入 `scripts/pre-commit.js` 与 `.github/workflows/ci.yml`。

---

## 项目结构

```text
IMS/
├── docker-compose.yaml        # Main orchestration (16 services)
├── proxy/nginx.conf           # The single front door
├── nodered_data/
│ ├── flows/                   # Node-RED flows, split by concern (source of truth)
│ ├── lib/                     # circuit-breaker.js, parser.js, snmp-normalize.js, units.js
│ ├── flows.json               # Built by scripts/build-flows.js from flows/*.json -- don't hand-edit
│ ├── Dockerfile               # Custom build: installs npm dependencies
│ └── settings.js              # Runtime settings (adminAuth, functionGlobalContext)
├── postgres/init/             # DB schema bootstrap (fresh-deploy path)
├── database/migrations/       # TimescaleDB migrations, applied by the db-migrate service
├── services/
│ ├── alarm-api/               # Acknowledge/Resolve write path
│ └── factory-twin-3d/         # Floor 1 digital twin
├── monitoring/
│ ├── grafana/dashboards/
│ │ ├── infrastructure/        # NOC Overview, Engineering Drill-Down, AIOps & Capacity,
│ │ │                          # Meta-Monitoring, Ingestion Latency
│ │ └── manufacturing/         # Easy Overview, Manufacturing Command Center, Operator Andon,
│ │                            # Alarm Console/Response/Dictionary, Engineering Analytics,
│ │                            # Machine Snapshot, Factory Digital Twin, Data Readiness
│ ├── grafana/library-panels/  # Shared Grafana library panels
│ ├── grafana/provisioning/    # Datasources, dashboard providers, Grafana-managed alert rules
│ └── prometheus/rules/        # Prometheus alert rules
├── scripts/                   # Utility scripts
├── tests/
│ ├── lint/                    # Dashboard/alarm/query-budget/RCA/leak/orphan linters
│ ├── unit/                    # Parser, boundary and factory-twin contract tests
│ ├── e2e/                     # Panel data, query timing, golden-dataset checks
│ ├── k6/                      # Load tests
│ └── playwright/              # Visual/layout and factory-twin browser regression
└── docs/                      # Documentation -- start at docs/README.md; th/ and zh-CN/ mirror it
```

---

## 代码评审检查清单

- [ ] diff 中没有密钥、凭据、生产数据、源自 CAD 的尺寸、真实设备编号或个人数据
- [ ] function 节点中的 SQL 对用户输入使用 `sanitize()`（来自 `nodered_data/lib/parser.js`）
- [ ] 在 `nodered_data/flows/*.json` 中编辑 flow JSON，然后通过 `node scripts/build-flows.js` 重新构建
- [ ] Grafana 数据源 UID 为 `timescaledb`
- [ ] 仪表板 JSON 通过 `node tests/lint/dashboard-linter.js`
- [ ] `node scripts/pre-commit.js` 通过（涉及运行中栈的改动还需通过 `make verify`）
- [ ] 现行文档变更时，已同步更新英文、泰文与简体中文——包括自动生成的 `docs/architecture/DASHBOARD_INVENTORY.md` / `DATABASE_SCHEMA.md`（`node scripts/generate-dashboard-inventory.js` / `node scripts/generate-schema-inventory.js`，经 CI 检查）

---

<div align="center">

**IMS 贡献指南 — 版本 2.1，2026-09-26 对照 `main` 核实**

</div>
