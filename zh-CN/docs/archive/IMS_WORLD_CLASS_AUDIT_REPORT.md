<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页 (Home)</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引 (Docs Index)</b></a>
</div>
<br/>

# IMS — 世界级全系统审计报告 (World-Class Full-System Audit Report)

> **已归档 — 历史快照，日期：2026-08-05。** 非活动文档；以下数字（仪表板数量、迁移数量、面板数量等）反映了系统在当天的状态，且已知相对于当前系统已经过时。根据 docs/archive/README.md 作为历史记录保留。获取当前信息，请参阅 docs/architecture/ARCHITECTURE.md 和 docs/architecture/DASHBOARD_INVENTORY.md。

### 范围：包含本会话早先合并的 LDI-dashboard 审计未涵盖的所有内容 · 2026-08-05

---

## 方法论 (Methodology)

本次审计直接延续了 `IMS-FULL-SYSTEM-AUDIT.md`（所有 9 个 LDI Grafana 仪表板、Node-RED 模拟器/摄取流以及几个数据库视图 — 已在本会话的上一阶段完成审计、修复并合并到了 `main`）。重新审计那部分内容将是白费功夫，因此本次审计特意涵盖了上一次未覆盖的部分：

| 领域 (Area)                                                                                                                          | 涵盖分支 (Covered by) |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 监控/基础架构堆栈配置（Prometheus, Alertmanager, Blackbox, SNMP sim, PgBouncer, Grafana 供应/库面板） | Fork 1     |
| Node-RED 警报流，CI/CD 管道（`ci.yml` 之外），`scripts/` 目录，`db-migrate` 服务                          | Fork 2     |
| 完整的数据库迁移历史记录（23 个文件），`postgres/init/`，以及 `docs/` 文档集                                             | Fork 3     |

这三者并行以只读方式运行，对照实时系统状态（`docker logs`、只读 `psql` 查询、运行中的容器检查）来交叉检查文件内容，而不是仅仅依赖静态审查 — 这与推动上次审计获得最有价值发现的“C 层 (Layer C)”原则（即查询结果，不仅是语法）相同。

**这是一次纯审计的过程。** 没有更改代码，没有进行提交，也没有修复任何问题。以下所有内容都是为了后续分类处理而找出的发现，而非已完成的修复。

---

## P0 — 关键 (Critical)

### P0-1 · 一条生产警报规则目前在每个评估周期都处于主动失败状态

`ldi-machine-alarm-005`（通过 `monitoring/grafana/provisioning/alerting/ldi-rules.yml` 供应）在其查询中没有 `ORDER BY time` — 这是 Grafana 时间序列数据帧转换所必需的。在 `docker logs ims-grafana` 中已被实时证实：

```text
level=error msg="Failed to evaluate rule" ... error="...failed to convert long to wide series...not sorted in ascending order by time"
level=info msg="Sending alerts to local notifier" count=1
```

这在每隔约 5 分钟的评估周期重复一次。更糟糕的是：它似乎在每次评估 _错误 (error)_ 时触发通知，而不是在真正的机器条件下触发 — 这意味着此规则当前正在按计划生成与实际 LDI 机器状态无关的警报噪音。

**修复：** 在规则查询中添加 `ORDER BY time`（或等效的桶排序）。

### P0-2 · 三个不一致的迁移运行脚本 — 这就是 schema_migrations 发生漂移的 _原因_

有三个不同的脚本应用迁移，每个脚本的跟踪方式都不同：

- `scripts/migrate.sh`（手动/本地） — `schema_migrations(version, filename, applied_at, checksum)`。
- `scripts/migrate-entrypoint.sh` — **实际的自动运行路径**：docker-compose 的 `db-migrate` 服务运行此脚本，且 `node-red` 有 `depends_on: db-migrate: condition: service_completed_successfully` (`docker-compose.yaml:396-400`)。表相同，**没有 `checksum` 列**。
- `scripts/init-migrations.sh` — 根本没有跟踪表；在每次调用时盲目地重新运行每个 `.sql` 文件，并将任何非幂等 (non-idempotent) 迁移的第二次运行失败视为真正的“失败 (FAILED)”。

无论哪个脚本首先创建 `schema_migrations` 都能决定该表的实际形状（之后执行 `CREATE TABLE IF NOT EXISTS` 将不产生任何效果/no-op）。在标准的 `docker compose up` 流程中，`migrate-entrypoint.sh` 总是先运行 — 因此 **每一个标准部署的实时 `schema_migrations` 表都完全没有 `checksum` 列**。这就是上次审计中发现并绕过的“预置 checksum”跟踪异常（迁移 038）的直接机械原因：它不是一次性的预置错误，这是三个脚本对“已应用 (applied)”的含义未能达成一致所造成的结构性后果。

**修复：** 折叠合并为一个规范的迁移运行程序，并在各处（手动、`db-migrate` 服务以及任何未来的初始化路径）使用它。

### P0-3 · 警报管道目前无法向任何人发送信息（跨基础架构和流程审计综合得出）

配置的每一个警报分发渠道都已经损坏，且各自的方式不同：

- **Slack**（`monitoring/alertmanager/alertmanager.yml`，接收者 `ims-slack-critical`）：Webhook URL 仍然是字面占位符 `https://hooks.slack.com/services/YOUR/WEBHOOK/URL`。
- **LINE Messaging API / MS Teams**（`nodered_data/flows/alerting.json`，连接到 Alertmanager 且正确布线到 `node-red:1880/alert-webhook` 的接收端）：两者的交付功能实现正确，但在生产 `.env` 中 `LINE_CHANNEL_ACCESS_TOKEN`，`LINE_USER_ID`，和 `TEAMS_WEBHOOK_URL` 存在却为空。在配置为空时两个函数都会执行 `node.warn(...); return null;` — 没有任何崩溃或错误被浮现出来，除了生产环境中无人关注的 Node-RED 调试侧边栏。
- **`line_notify` 接收者**（`alertmanager.yml`）：目标为 LINE 的 Notify API，而 LINE 已在 2025 年中止该服务。也没有任何实际路由指向它。死得很彻底。
- **`ims-deadman` 接收者**：已定义，从未被路由过（Watchdog 路由反而指向 `'null'`）。

单独来看，这些是 P1 级的错误配置。把它们结合在一起意味着：**如果当前系统出现严重错误，Grafana UI 之外的任何地方都不会有人收到通知。** 这是一个实际的操作风险，它的严重性足以使其成为一项独立的顶级发现，而不是让其淹没在四个独立的中等严重程度的条目中。

**修复：** 选定一个真实的通道（Slack webhook 是工作量最少的配置路径 — 只需要一个真实的 URL），让端到端实现顺利传递，并在将其视为完成之前利用真实测试警报来予以核实。同时，也要除掉已经死去的 LINE Notify / deadman 遗留代码。

---

## <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P1 — 高 (High)

### P1-1 · 本会话的 schema 调优对于新部署来说一上线即失效

迁移 020（本会话的 `DOUBLE PRECISION → REAL`，1 天 → 1 小时块间隔调优）和 `postgres/init/001-init-timescaledb.sql` 都在执行 `CREATE TABLE IF NOT EXISTS public.ldi_data`。在任何全新的引导中 `init/001` 会首先运行，且它仍保留有调优前的定义 — 从而导致迁移 020 在每次新部署时都会静默失效 (silently no-ops)。讽刺的是，这恰好是迁移 041/047 中明确评论并尊重的“保持 init/ 和 migrations/ 同步”原则；而 020 却没有这条注释，也没有保持同步。

**修复：** 对 `postgres/init/001-init-timescaledb.sql` 应用相同的列类型/块间隔 (column-type/chunk-interval) 更改。

### P1-2 · `../architecture/ARCHITECTURE.md` 严重过时且内部自相矛盾

- 在三个不同的地方宣称有“3-4 个仪表板”；实时系统实际上有 9 个。完全没有提及整个 LDI 制造仪表板系列（Manufacturing, Andon, Engineering Analytics & SPC, Machine Snapshot, Data Readiness）。
- 这个文件是 **两个不同的架构文档连接在一起** — 第 159 行开始了一个拥有不同格式风格的第二部分“详细系统架构 (Detailed System Architecture)”，包含自己重复的 Mermaid 图，重复的警报流图，以及重复的组件表。读起来像是一个未解决的糟糕的合并 (bad merge)。
- 在 SNMP 轮询间隔上自相矛盾：文字叙述中是 10 秒（第 48 行），而在间隔表（第 467 行）和 walker 表（第 322-326 行）中是 30 秒。
- 描述 LDI 遥测数据通过 SNMP walker 到达 — 实际上它是通过来自 `ldi_simulator.json` 到 `/ldi-telemetry` 的 HTTP POST 到达的。根本不是 SNMP。

**修复：** 这需要重写，而不是修补 — 建议在上述代码级别的修复落实后，将其作为一个从零开始的文档编写工作来对待，以免它再次立刻过时。

### P1-3 · 基于 `ldi_metrics.vibration` 的关键警报在结构上永远无法触发

`ims-ldi-vibration-critical`（阈值 `vibration > 12`） — 在所有 10 台 LDI 机器的约 2,300 行数据中，`vibration` 完全为 0。与 LDI-dashboard 审计发现的 `ldi_metrics.throughput`/`power_watt` 差距的根本原因相同（k6 综合摄取管道从不为 LDI 类设备填充这些字段） — 这将该发现延伸到了警报领域，不仅限于仪表板。一个永远不会触发的“关键 (critical)”警报比没有警报更糟糕：它造成了对振动正被监控的错误信心。

### P1-4 · `ci-flows.yml` 在结构上无法通过

在向 `main` 分支进行每次推送/PR (push/PR) 时运行。它通过 `node scripts/build-flows.js`（2 空格 JSON 缩进）构建 `flows.json`，然后针对已提交的 `flows.json`（4 空格缩进，已确认）执行 `git diff --exit-code`。无论内容如何，此差异永远不会干净 — 在考虑到制表符源文件 (per-tab source files) 和可能也会触发它的实时编辑的 (live-edited) `flows.json` 之间的画布位置（`x`/`y`/`g`）漂移之前，每一行的前导空格都已经存在差异。

### P1-5 · 两个存在分歧的“合并 flows.json”实现；README 记录了 CI 不运行的那一个

`scripts/build-flows.js`（具有重复 ID 验证，实际由 `ci-flows.yml` 使用）对比 `scripts/build-flows.sh`（`jq -s 'add'`，无验证） — `README.md` 和 `.agents/skills/deploy-node-red-flow/SKILL.md` 都将 `build-flows.sh` 记录为规范的。与 P0-2 的迁移运行程序属于相同的“单项操作的并行漂移实现 (parallel drifting implementations of one operation)”模式 — 这看起来像是此代码库中值得明确指出的一个反复出现的习惯，而不仅仅是逐案 (case-by-case) 修复。

---

## <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 — 中 (Medium)

| 编号 | 领域 (Area)                                                           | 发现 (Finding)                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `postgres/init/003-grafana-password.sh`                               | 如果未设置 `GRAFANA_DB_PASSWORD`，则为 `grafana_reader` 数据库角色硬编码了后备密码 `grafana_secure` — 本会话中已在 `nodered_data/settings.js` 里修复了相同的反模式 (anti-pattern)，但这里没有被清扫到。                                                                                                                                       |
| 2   | `database/migrations/038-rename-ldi-metrics-columns.sql`              | 没有存在性守卫 (existence guard) 的非幂等 `ALTER TABLE ... RENAME COLUMN`，这与此代码库中的所有其他重命名不同（例如迁移 013 封装在 `DO $$ ... IF EXISTS ...` 中）。直接与 P0-2 相连 — 这正是在 `init-migrations.sh` 盲目重跑行为下会崩溃的迁移类型。                                                                                             |
| 3   | `monitoring/grafana/provisioning/libraries/libraries.yml`             | 库面板供应 (Library-panel provisioning) 完全无法发挥作用：面板定义存在于 `monitoring/grafana/library-panels/` 中，这是一个根本没有挂载到 Grafana 容器的目录（在运行的容器内已确认 — 仅存在 `libraries.yml`）。无论哪种方式目前它的消费者数量都为零。                                                                                      |
| 4   | 连接池大小调整 (Connection pool sizing)                               | Node-RED 的 PG 池在本会话中加宽至 `max: 50`；Grafana 的数据源添加了 `maxOpenConns: 20`；两者共享 PgBouncer 单一的 `DEFAULT_POOL_SIZE: 20`。事务模式连接池可以缓解这个问题，但它是值得在实际负载下重新审视的容量规划不匹配。                                                                                                               |
| 5   | SNMP 模拟器覆盖差距 (SNMP simulator coverage gap)                     | 摄取流的“漫游温度 (Walk Temperature)”节点会对 `device_type='network_switch'` 分支到特定于 Juniper 的 OID，但没有 `.snmprec` 文件模拟任何以 `2636` 为前缀的 OID。目前处于休眠状态（未注册任何交换机）— 一旦注册了交换机就会成为陷阱。                                                                                                        |
| 6   | `verify-db-health.sh`                                                 | 检查 `sys_metrics`/`net_metrics`/`ldi_metrics` 及其每小时 CAGG — 从不检查 `ldi_data` 或其 `_1m/_15m/_1h` 层级，这是每个 LDI Grafana 仪表板所依赖的实际真实遥测数据路径。这是一个无视主要数据路径的“数据库健康检查”。                                                                                                                            |
| 7   | `scripts/analyze_dashboard.py`, `fix_dashboard.py`, `fix_validate.py` | 处于通用 `scripts/` 目录中的一次性历史补丁脚本（包含硬编码的文件名，引用了已经应用的特定历史修复集的文档字符串）。对着当前经历过诸多改变的仪表板重新运行任何一个，充其量也就是产生静默无用功（no-op）。它会误导那些以为 `scripts/` 全是得到妥善维护、可重复使用的工具集的人们。 |

---

## <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P3 — 低 (Low)

- Prometheus, Alertmanager, Blackbox exporter, SNMP simulator 和 Grafana renderer 都没有 `healthcheck:` 块（PgBouncer 和 Grafana 本身有）— 这在可观测性堆栈中显得不一致，并且阻碍了未来针对它们的任何 `depends_on: condition: service_healthy` 门控操作。
- `contactpoints.yml` 注释引用了一个不存在的 `flows-ubuntu.json`（当前文件是 `alerting.json`）— 仅是过时的注释，实际的 webhook 布线是正确的。
- `blackbox.yml` 的 `dns_resolution` 模块已定义，但从未被 `prometheus.yml` 抓取 (scraped) — 无害的孤儿代码。
- 现在存在三份名称相似、不相互引用的审计报告（`docs/IMS-audit-report-2026-08-04.md`, `docs/world-class-audit-report.md`, 根目录 `IMS-FULL-SYSTEM-AUDIT.md`）— 已确认它们是真正的不同范围，不是重复件，但读者如果不把它们三个都打开，就无法判断哪个是当前版本。
- `database/migrations/archive/README.md` 宣称已归档的迁移文件已被“永久删除”；但该目录实际仍包含 8 个 SQL 文件 + 3 个表转储 (table dumps)。已确认无害（migrate.sh 的 glob 查找是非递归的，永远不会获取它们）— 只是一个误导性的 README。
- `database/migrations/013-normalized-schema.sql` 的标题注释说“Migration 011” — 重新编号留下的遗迹。
- 两个独立的编号序列（`database/migrations/032-*` 和 `postgres/init/032-*`）为了不相关的对象共享数字“032” — 在按数字执行 grep 时会引起混乱。
- `scripts/migrate.sh` 在失败时检查退出代码之前将 stdout/stderr 重定向到了 `/dev/null` — 操作员只能看到“FAILED”而看不到明显的可见原因。
- `k6-test.yml` 创建了 `secrets/postgres_password.txt`/`secrets/grafana_admin_password.txt`，而 `docker-compose.yaml` 中的任何内容都未曾引用它们 — 这是之前 Docker-secrets 设计留下的死残留。
- `release.yml` 安装了 2 个 semantic-release 插件（`changelog`, `git`），而 `package.json` 的 `release.plugins` 从未列出；同时还使用 `--no-save` 安装了 `semantic-release` 并且没有固定版本，忽略了已提交的锁文件 (lockfile)。
- `scripts/snmp-discover.js` 硬编码了一个真实的内部 IP 以及 `SECURITY.md` 已经将其作为已知中等发现进行追踪的同一个 SNMP community string — 将该发现的影响范围又扩大到了多一个文件。
- `scripts/migrate.sh` 没有将“应用迁移”+“记录到跟踪表中”进行事务包装 (transaction-wrap) — 这两者之间的崩溃会导致下次执行重跑。一种狭窄的边缘情况。

---

## 检查并发现确无大碍 (Checked and found genuinely fine)

- **迁移的幂等性 (Migration idempotency)**，整体上：在 23 个迁移中，约有 19 个正确使用了 `IF NOT EXISTS`/`CREATE OR REPLACE`/`ON CONFLICT DO NOTHING`/ 吞没异常的 `DO $$` 块。那些非幂等的是例外，而不是规则（见 P2-2）。
- **`archive/` 是安全惰性的** — `migrate.sh` 的 glob 查找是非递归的，永远不会触及它。
- **抽查超出已知的 038 案例的预置 `schema_migrations` 行**：已确认迁移 041 的 `v_machine_spc_ranking` 在 `postgres/init/001` 和迁移文件之间正确同步 — 未发生漂移。所有 16 个预置行共享一个完全相同的批量插入时间戳 (identical bulk-insert timestamp)，这证实了 P0-2 的根本原因，而不是 16 个独立的预置错误。
- **`docs/TROUBLESHOOTING.md`** 抽查确认准确 — 它的指导意见甚至准确预测了本会话关于仪表板刷新率的修复。
- **`nodered_data/flows/alerting.json`** 本身很稳固：处理 Alertmanager webhook schema 表现正确，仅使用环境变量凭证（无硬编码密钥），并在两个投递路径上都有适当的错误处理。问题出在空的环境变量以及失效的上游 Slack 配置上，而不是此流程本身的代码。
- **两条 Z-score 异常警报规则**（`ims-cpu-zscore-anomaly`, `ims-temp-zscore-anomaly`）都正确地防范了除以零的错误（`WHERE sigma > 0`）— 实现了故障安全 (fail safe)，没坏，只是在模拟数据为零方差服务器温度的情况下目前处于惰性状态。
- **`datasources.yml`**：`timescaledb` UID 精确匹配每一个仪表板引用；密码是正确的环境变量引用，没有硬编码。
- **没有硬编码密钥** 在范围内的任何地方被找到，除了那个已被知悉的 SNMP community-string 问题外（现在已在第二个文件中确认，见 P3）。
- `backup-db.sh`/`restore-db.sh`/`enable-stress-test.sql` 都短小精干、正确无误，并且名副其实。
- `k6-test.yml` 实际的负载测试逻辑及失败阈值（>5% HTTP 错误率）是合理的。
- 多个工作流文件基于同一个 push/PR 事件被触发，这是正常的 GitHub Actions 实践，不是冗余的 bug。

**未经过深度审查 (Not deeply reviewed)**（标记为未审查，不代表宣称它们是干净的）：`docs/admin/`, `docs/business/`, `docs/user/`, `GRAFANA_DESIGN_SYSTEM.md`, `PANEL_TOKENS.md`, `phase2-baseline-metrics.md`, `phase2-benchmark-report.md`, `scaling-plan.md`, `deployment-readiness.md`, `IMS-master-development-plan.md`，以及 5 个 LDI 专用警报规则（`ldi-quality-drift-001`, `ldi-process-capability-002`, `ldi-je-drift-003`, `ldi-je-capability-004`, `ldi-temp-high-006` — 浏览了结构，没有明显的危险信号，但没有像对 `ldi-machine-alarm-005` 那样针对实时数据进行逐行核实）。

---

## 建议的操作顺序 (Recommended action order)

| 编号 | 项目 (Item)                                                                                  | 严重性 (Severity)                                                                               | 为何优先 (Why first)                                                                            |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | 修复 `ldi-machine-alarm-005` 丢失的 `ORDER BY time`                                          | P0                                                                                              | 目前正主动地每约 5 分钟生成警报噪音                                                             |
| 2   | 将 3 个迁移运行程序折叠成 1 个规范的脚本                                                     | P0                                                                                              | schema 跟踪发生漂移的根本原因，它已经在这个项目中“咬”过大家一次了（迁移 038）                   |
| 3   | 获得端到端均起作用的真实的警报分发渠道（选定一个渠道，利用真实警报做一次核实验证）           | P0                                                                                              | 如果发生系统崩溃，目前没有任何信息能传达到人类的手里                                            |
| 4   | 将迁移 020 的 schema 调优同步到 `postgres/init/001`                                          | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P1 | 本次会话自带的修复目前对于新部署而言一上线即失效                                                |
| 5   | 修复或淘汰 `ci-flows.yml`                                                                    | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P1 | 一个在结构上永远无法通过的 CI 检查，会训练人们去无视 CI 失败                                    |
| 6   | 从零开始重写 `../architecture/ARCHITECTURE.md`                                               | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P1 | 目前具有主动的误导性（仪表板数量错误、摄取路径错误、自相矛盾）                                  |
| 7   | 移除或修复针对振动的关键警报                                                                 | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P1 | 一个永远不会触发的“关键”警报比没有警报更糟糕                                                    |
| 8   | 位于 P2/P3 的所有其它项目                                                                    | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" />    | 真实的，但不紧急                                                                                |

---

## 依据受众总结 (Summary by audience)

**管理层 (Management)：** 三项关键发现，没有一项是关于在本会话早些时候被修复的 LDI 制造仪表板的 — 它们是关于系统 _外围 (around)_ 的运维脚手架的。最需要关注的一项是：**如果现在出现严重故障，没有人会收到寻呼 (paged)。** 这个系统中配置的每一个警报投递通道要么是占位符，要么存在空的凭据，要么目标是一个停止服务的 API。这是目前能够进行的具有最高杠杆率的修复动作。

**SRE / IT 运营：** 迁移运行程序的不一致（P0-2）是本次审计真正的“大奖” — 它是跟踪漂移（此前只是进行逐案绕过处理）的机械学解释。正确修复它（统一为一个规范的运行程序）可防止此类错误再次发生。同样值得立即关注的是：`ci-flows.yml` 目前在任何情况下都无法通过，这意味着它要么已经被忽视了（坏事），要么正在无缘无故地阻止合并操作（同样是坏事）— 值得去查查到底是哪种情况。

**QA 工程：** 一个在结构上永远无法触发的“关键”振动警报，以及一份与 Cpk 相邻过时的架构文档，这两种情况都属于该项目现在已经多次触及的同一种底层模式：事物 _看起来 (look)_ 像是在检查某样东西，但结构上却做不到。每当添加新的警报或仪表板面板时，值得针对这一特定模式（阈值底层的数据究竟有没有改变过？）设立一项常设检查。

**工艺工程 (Process Engineer)：** 在本次审计中没有任何内容直接触及 LDI 工艺/质量逻辑 — 那是之前审计的内容。唯一一项具有工艺相关性的是振动警报 (P1-3)：如果人们期望对振动进行实时监控，那么目前实际上并没有，其原因与在先前的审计中发现 LDI 机器的 PE/JE 吞吐量报告被破坏的原因相同（k6 综合摄取管道差距）。
