<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# LDI 系统验证与准备就绪协议 (LDI System Validation & Readiness Protocol)

> **目标：** 认证 LDI（激光直接成像）监控生态系统以进行生产环境部署。本协议验证数据完整性 (Data Integrity)、视觉准确性 (Visual Accuracy)、系统稳定性 (System Stability) 以及操作员准备就绪度 (Operator Readiness)。
>
> **出处：** 以下所有的参数和通过标准均在 2026-08-10 直接针对运行中的系统进行了核对（测试输出、仪表板 JSON、Makefile 目标、k6 脚本、`.env`），而不是假设得出的。本协议的早期草案中存在一些与实际实现不符的参数（错误的 Make 目标行为、早于当前设计系统合并的调色板、与代码库中任何脚本都不匹配的 k6 阈值、过时的 Andon 刷新间隔，以及使用本代码库随附的 `.env` 无法成功的警报通过标准）。此版本替换了该草案；此处没有任何凭空设定。

---

## <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 健康 (Healthy) 第 1 阶段：数据完整性与解析器验证（单元测试）

**目标：** 确保来自物理 LDI 机器的损坏的、缺失的或格式错误的 JSON 负载不会导致 Node-RED 管道崩溃或损坏数据库。

**方法：** 运行 `v2-parser.test.js` 测试套件（`node tests/unit/v2-parser.test.js`），它模拟了极端的边缘情况：

- 空负载（模拟网络中断）。
- 32 位计数器回绕（当机器正常运行时间超过 49 天时）。
- 负载值内部的 SQL 注入尝试。

**证据（于 2026-08-10 重新运行，确认在 `tests/unit/v2-parser.test.js` 中逐字存在的测试名称）：**

```text
TEST 1: Empty Payload Timeout Simulation
 LDI: empty payload preserves zero state
 parseAll skips null/undefined items gracefully
 parseAll throws on non-iterable payload (parser guard catches this)

TEST 2: 32-bit Counter Wraparound Math
 32-bit wrap: counter 4294967295 → 100 calculates correct positive delta
 Cold-start: first poll returns 0 Mbps (no prev data)

TEST 3: Boundary Validations & Sanity Caps
 Temperature clamped at max 150°C
 sanitize escapes SQL injection attempts

==================================================
RESULTS: 27 passed, 0 failed out of 27
==================================================
```

为了实现全面的管道覆盖率，此阶段还应考虑包含代码库的其他四个单元测试文件（均于 2026-08-10 独立重新运行并通过）：

| 文件                                     | 结果                |
| ---------------------------------------- | ------------------- |
| `tests/unit/parser.test.js`              | 22 passed, 0 failed |
| `tests/unit/v2-parser.test.js`           | 27 passed, 0 failed |
| `tests/unit/counter-wraparound.test.js`  | 14 passed, 0 failed |
| `tests/unit/boundary-validation.test.js` | 33 passed, 0 failed |
| `tests/unit/circuit-breaker.test.js`     | 3 passed, 0 failed  |

_状态：100% 通过（所有 5 个单元测试文件中 99/99）。_

---

## <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 健康 (Healthy) 第 2 阶段：仪表板完整性（视觉与 Schema Linter）

**目标：** 确保 5 个 LDI 套件仪表板（`ims-ldi-manufacturing`、`ims-ldi-operator-andon`、`ims-ldi-engineering-analytics`、`ims-ldi-machine-snapshot`、`ldi-data-readiness`）的渲染没有重叠的面板、不符合色板的颜色或损坏的 SQL 查询。

**方法：** 直接运行真正的 lint 套件（这才是实际强制执行以下清单的工具 -- `make validate-dashboards` 仅检查一种狭窄类别的损坏的十六进制代码文本，并且**不**调用任何 linter，因此不要依赖它来进行验证签收）：

```bash
node tests/lint/dashboard-linter.js  # grid overlap, color tokens, contrast, panel structure
node tests/lint/alarm-sync-linter.js  # simulator alarm codes resolve against the live Alarm Master
node tests/lint/orphan-object-linter.js # every DB object is referenced by something
node tests/lint/query-budget-linter.js # no raw-table range scans
node tests/lint/rca-mapping-coverage.js # every alarm category maps to an RCA bucket
node scripts/generate-dashboard-inventory.js --check # panel counts match the dashboard JSON
node scripts/generate-schema-inventory.js --check  # schema doc matches the live database
```

**清单：**

- [x] **Grid-24 验证：** 所有面板的宽度总和为 24 列，无重叠（`dashboard-linter.js` Check 9）。
- [x] **颜色标记检查 (Color Token Check)：** 所有硬编码的颜色都匹配批准的 8 标记调色板（`dashboard-linter.js` Check 15） -- `#22c55e`（正常）、`#f59e0b`（警告）、`#ef4444`（严重）、`#00f2fe`（信息）、`#3b82f6`（重点）、`#64748b`（无数据）、`#4a5568`（预测）、`#eab308`（次要严重性）。而不是早期草案中的 4 色集，该集合早于“单一通用调色板”合并，并包含 `#10B981`，这是一种在当前强制集合中完全不存在的颜色。
- [x] **查询性能：** `v_machine_spc_fleet` 是一个物化视图（migration 064），通过 TimescaleDB 后台作业每 60 秒刷新一次。测得的 LDI 套件 P95：**5.30ms**（不仅仅是“低于 100ms” -- 于 2026-08-10 通过针对实时数据库的 `EXPLAIN ANALYZE` 验证）。

_状态：100% 通过（所有 5 个 linter + 两个清单检查中 0 错误）。_

---

## <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 警告 (Warning) 第 3 阶段：高负载压力测试（K6 管道模拟）

**目标：** 验证 Node-RED 摄取层和 PgBouncer 是否能够处理持续的并发负载，而不会丢失数据或超出可接受的延迟。

**方法：** `make test-load`，它专门运行 `tests/k6/pipeline-stress.js`（代码库有 7 个 k6 脚本；这是此 Make 目标实际调用的脚本）。

**实际参数（直接从脚本中读取，不是假设得出的）：**

- 虚拟用户 (Virtual users)：提升 `20 → 50 → TARGET_SERVERS`（环境变量，**默认为 100**，而不是固定的“从 50 逐步增加到 200”）。
- 阈值 (Thresholds)：`pipeline_success rate > 0.95`（高达 5% 的失败是可接受的通过标准，而不是“0% 丢包率”）和 `e2e_duration p(95) < 10000ms`（**10 秒**，而不是 500ms）。
- 目标 (Target)：具有合成 `E2E-SERVER-*` ID 的旧版 `/inject` 端点 -- 这一操作测试了 LDI 管道也运行其上的**共享** Node-RED / PgBouncer / TimescaleDB 基础设施，而不是直接测试 LDI 特定的 `/ldi-telemetry` 端点。**本代码库中当前没有脚本专门对 `/ldi-telemetry` 进行负载测试** -- 这是一个真实存在的差距，而不是可以掩盖的问题。
- PgBouncer：`DEFAULT_POOL_SIZE=20` (docker-compose.yaml) -- 早期草案中的这一细节是准确的。

对于更具对抗性的运行（在 CI 中使用，`.github/workflows/ci.yml`），`tests/k6/chaos-stress.js` 攀升至 1000 个 VU，故意注入 5% 的故障和 10% 的格式错误负载，阈值为 `pipeline_success rate > 0.90` 且 `pipeline_duration p(95) < 200ms`。

_状态：两个脚本都是真实的、可运行的，并且根据它们自己的（而不是早期草案的）阈值通过了测试。建议在签收之前运行 `make test-load` 并附上真实输出，并且将“没有专用的 `/ldi-telemetry` 负载测试”视为一个待解决项，而不是隐含的通过。_

---

## <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 警告 (Warning) 第 4 阶段：生产部署（端到端实时测试）

**目标：** 在工厂车间进行的最终的“人在回路 (human-in-the-loop)”验证。

**方法（标准操作程序 - Standard Operating Procedure）：**

1. **操作员 Andon 测试：** 拔下非生产 LDI 机器（例如 `LDI-01` -- 真实机器 ID 为 `LDI-01` 到 `LDI-10`，两位数，而不是 `LDI-001`）的网线。

- _通过标准：_ [LDI Operator Andon](http://localhost:3000/d/ims-ldi-operator-andon/set2-operator-andon) 看板必须在大概一个刷新周期加上处理时间内将该机器显示为 `NO_DATA`（灰色） -- 看板的刷新间隔为 **5 秒**（不是 10 秒），并且状态磁贴读取 `v_ldi_machine_latest_full` 的 `is_stale` 标志（过去 5 分钟内没有读数 = `NO_DATA`），因此实际的通过时间窗口接近 **~7-10 秒**，而不是 12 秒。

1. **产量异常测试：** 向测试 LDI 单元注入一个虚构的高温值。

- _通过标准：_ [LDI Engineering Analytics](http://localhost:3000/d/ims-ldi-engineering-analytics/set2-engineering-analytics) 的温度面板必须显示此偏移。**不要在这里测试“Z-Score 异常峰值”** -- 在此仪表板上没有 Z-Score/统计异常面板（已检查实时 JSON；Z-Score 面板仅存在于以基础设施为中心的容量规划和工程钻取仪表板中，用于 CPU/温度，而不是针对 LDI 特定指标）。真正的 LDI 温度警报是一个**固定阈值 (fixed threshold)** 的 Grafana 本地规则，“LDI Temperature High — above 24°C spec limit”（`monitoring/grafana/provisioning/alerting/ldi-rules.yml`） -- 请确认触发的是_该_规则。
- _通过标准（警报传递）：_ 确认 Alertmanager 路由了该警报，并且 Node-RED 的 `alerting.json` 流程格式化了一个 LINE Messaging API / MS Teams 负载（在流的调试输出 / Node-RED 日志中检查格式化的消息）。**不要将签收卡在实际的 LINE/Teams 消息到达上** -- 此代码库的 `.env` 中故意省略了 `LINE_CHANNEL_ACCESS_TOKEN` 和 `TEAMS_WEBHOOK_URL`（真实的凭据无法在代码库中提供），因此，除非操作员根据 `docs/admin/ADMIN_MANUAL.md` 的 Pre-Production Security Checklist 配置了真实凭据，否则端到端交付在架构上是不可能的。将“正确格式化负载，正确尝试并记录交付”作为此代码库默认状态的实际通过标准。

1. **数据准备就绪同步 (Data Readiness Sync)：** 打开 [LDI Data Readiness](http://localhost:3000/d/ldi-data-readiness/ldi-data-readiness)。

- _通过标准：_ 没有单一的“数据完整率 (Data Completeness Ratio)”指标 -- 请检查实际的面板：**遥测年龄 (Telemetry Age)**、**警报年龄 (Alarm Age)**、**机器 ID 匹配 (Machine ID Match)**、**Alarm Master 匹配 (Alarm Master Match)**、**板卡 ID 完整性 (Board ID Completeness)**、**PE / JE4 覆盖率 (PE / JE4 Coverage)**，以及机器数据覆盖矩阵和两个“映射差距（全局）(Mapping Gaps (Global))”表。所有这些都应显示为绿色 / 零差距 (zero-gap) 才能进行完整的签收 (clean sign-off)。

_状态：程序已更正并准备执行。截至本文档发布之日，尚未在真实硬件上端到端运行。_

---

**签收 (Sign-off)：** SRE 团队 / IMS 首席架构师
**日期：** 2026年8月10日
**修订：** 针对 2026-08-10 实时系统验证进行更正（请参阅上方的出处说明）
