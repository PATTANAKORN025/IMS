<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Documentation Audit — Gap Report

> **范围：** 所有当前（非 `docs/archive/`）文档，针对代码库的实际状态进行了审计——`docker-compose.yaml`、`docker-compose.prod.yaml`、`database/migrations/`（53 个文件，直到 078）、`scripts/`、`monitoring/` 配置以及 12 个生产仪表板 JSON 文件。只读审计；未编辑任何文件来生成此报告。
>
> **免于重新标记（已在本会话的先前审查中审计和修复）：** `docs/architecture/ARCHITECTURE.md`、`docs/architecture/SECURITY_MODEL.md`、`docs/user/USER_MANUAL.md`、`docs/operations/ALARM_PLAYBOOK.md`、`docs/architecture/IMS_PLATFORM_BOOK.md`、`docs/architecture/DASHBOARD_INVENTORY.md` 和 `DATABASE_SCHEMA.md`（两者均为自动生成且为最新）。
>
> **使用的基本事实：** 14 个 Grafana 仪表板（6 个基础设施 + 8 个制造，包括新的 `ims-ldi-alarm-console` 和现有的 `ims-ldi-alarm-dictionary`）；13 个 docker-compose 服务（12 个长期运行 + 1 个一次性的 `db-migrate`），包括新的 `alarm-api` 和 `proxy`；迁移 013–078（53 个文件）；Grafana 现在没有自己的主机端口（前置为 `proxy`）；`scripts/dr-test.sh` 实现了行数 _区间匹配 (bracketing)_，而不是精确匹配。

---

## P0 — Actively misleading (security/safety/data-integrity, or a broken procedure)

**`docs/admin/ADMIN_MANUAL.md:35-46`** — 容器概述表完全遗漏了 `alarm-api` 和 `proxy`，并列出了 `ims-grafana | Grafana | 3000`，就好像 Grafana 仍然直接向主机发布 3000 端口一样。
当前文本：一个 9 行的表格，没有 `proxy`/`alarm-api` 行，包含 `ims-grafana | Grafana | 3000 | Dashboard`。
应反映为：Grafana 没有自己的主机端口——`proxy`（nginx）现在是唯一向主机发布的入口点（3000），位于 Grafana 和 `alarm-api` 前端，并将后者置于针对 Grafana 自身会话的 `auth_request` 检查之后。遵循此表格的 IT 管理员将误判对安全性敏感的组件（警报写入路径）的实际网络信任边界。

**`docs/operations/DR_TEST_PLAN.md:9`** — Drill 1 的既定通过标准与实际实现以及该代码库自己的其他文档相矛盾。
当前文本：“比较实时和恢复后 `devices`/`ldi_data`/`ldi_alarm_log` 之间的行数... 通过标准：**精确的行数匹配 (exact row-count match)**。”
应反映为：`scripts/dr-test.sh`（第 46-96 行）明确实现并标记了 _区间匹配 (bracketing)_ ——`VERDICT: PASS -- restored row counts fall within the [before-dump, after-dump] live bracket`，而不是精确匹配。`docs/operations/BACKUP_RESTORE.md`（不在本次审计的标记列表中，但进行了交叉检查）明确记录了“精确匹配”是该系统自身 DR 测试期间发现的一个实际错误，因为这是一个实时提取系统，在转储和恢复之间数量总是会发生漂移。在真实演习中，遵循 `DR_TEST_PLAN.md` 字面规定的操作员可能会将真正通过的恢复误判为失败 (FAIL)。

**`docs/operations/TROUBLESHOOTING.md:107-403`** — 此文件在自身的故障排除内容之后（第 107 行：`# Incident Response Runbook`）拼接了第二个、结构完全不同的“事件响应手册 (Incident Response Runbook)”，并且使用了与真实的 `docs/operations/INCIDENT_RESPONSE.md` 文件**不同的严重性分类系统**。
当前文本：`TROUBLESHOOTING.md` 第 136-142 行将严重性定义为 **Critical / Warning / Info**（响应时间 <15 分钟/<1 小时/<4 小时）；而实际的 `docs/operations/INCIDENT_RESPONSE.md`（一个独立的、真实的、有来源支持的、带有该系统真实操作历史实例的文件）将严重性定义为 **SEV-1 / SEV-2 / SEV-3 / SEV-4**。两者不能完全对应，并为同一事件给出了相互冲突的升级建议。
应反映为：`TROUBLESHOOTING.md` 根本不应包含第二个事件响应框架——它应该指向 `docs/operations/INCIDENT_RESPONSE.md`（实际上，在 `INCIDENT_RESPONSE.md` 自身的“相关文档”部分中已经正确指向了 `TROUBLESHOOTING.md` 用于“常规 SRE 调试命令”——这种职责分工很明确，但 `TROUBLESHOOTING.md` 并未遵守；它反而造成了重复和矛盾）。在真实事件中这是一个真正的风险，响应者可能会查阅其中任何一个文件并得到不同的严重性/响应时间答案。这并非由本次会话的更改引起——而是一个预先存在的结构性缺陷，但真实且已得到证实。

---

## P1 — Materially wrong technical claims

**`docs/admin/ADMIN_MANUAL.md:33`** — “系统在 Docker Compose 上运行，共有 10 个服务（9 个长期运行 + 1 个一次性迁移运行器...）”
实际情况：总共 12 个服务（11 个长期运行 + 1 个一次性的 `db-migrate`）：`timescaledb, pgbouncer, prometheus, alertmanager, grafana, proxy, renderer, snmpsim, blackbox-exporter, alarm-api, node-red` + `db-migrate`。

**`docs/admin/ADMIN_MANUAL.md:100-102`** — “`database/migrations/` 目前有 40 个按顺序排列的文件（从 `013` 到 `064`...）”
实际情况：53 个文件，`013` 到 `078`（其中跳过/归档了一些编号）。

**`docs/admin/ADMIN_MANUAL.md:314`** — SRE 验证协议步骤 3：“验证容器（9 个长期运行 + ims-db-migrate，其状态应为 Exited (0)）”
与上述 `:33` 发现的错误计数相同——应为 11 个长期运行 + 1 个一次性。

**`docs/admin/ADMIN_MANUAL.md:122-147`** — 预生产安全检查表（“必须更改所有默认凭据”）仅列出了 `INGEST_API_KEY`、`POSTGRES_PASSWORD`、`GRAFANA_ADMIN_PASSWORD`。
遗漏：`ALARM_API_DB_PASSWORD`——`alarm_api_writer` 数据库角色的凭据（迁移 `078-alarm-api-writer-role.sql`），它遵循了与已列出的三个相同的 `.env.example` 中的 `change-me-please` 默认模式。轮换脚本（第 135-150 行）也没有像轮换 `grafana_reader` 密码那样轮换这个新角色的密码。

**`README.md:180`** — “跨越 2 个领域的 12 个仪表板：4 个基础设施... + 6 个制造（LDI 制造、操作员 Andon、工程分析与 SPC、机器快照、数据就绪性、车队概览）。”
内部算术错误：4+6=10，不是 12。制造业列表也缺少 `IMS LDI - Alarm Console` 和 `IMS LDI - Alarm Dictionary`（两者均为真实的、当前已配置的仪表板）——实际的制造业数量是 8 个。

**`README.md:188`** — “12 个仪表板——4 个基础设施，6 个制造...”
相同的 4+6=10≠12 错误。与**同一文件的第 220 行直接矛盾**：“12 个仪表板（4 个基础设施 + 8 个制造）”——这才是正确的。`README.md` 目前陈述了两种截然不同、相互矛盾的仪表板明细。

**`CONTRIBUTING.md:46`** — “每一个迁移都是 `database/migrations/` 中一个新的按顺序编号的文件（目前是 013–068...）”
当前的实际范围：013–078。

**`docs/product/PRODUCT.md:17`** — “...通过 6 个仪表板（制造指挥中心、操作员 Andon 板、工程分析与 SPC、机器快照、数据就绪性、车队概览）进行可视化...”
缺少 `Alarm Console` 和 `Alarm Dictionary`；实际的制造业仪表板数量是 8 个，而不是 6 个。

---

## P2 — Stale but not actively harmful

**`docs/operations/TROUBLESHOOTING.md:31-50`** — 故障模式表和“重启单个服务”命令块涵盖了 `node-red`、`grafana`、`prometheus`、`pgbouncer`、`blackbox`/`snmpsim`——该文件中没有任何关于 `alarm-api` 或 `proxy` 故障模式的条目，尽管这是“用于凌晨 3 点运行 IMS 监控堆栈的主要 SRE 操作手册”。如果这两个新服务中的任何一个宕机，该文档都没有提供指导。

**`SECURITY.md:33`** 和 **`docs/operations/DEPLOYMENT_READINESS.md:115`** — 均声称“仅将 Grafana 绑定到 localhost（已在生产 compose 中完成）”/“已在生产 compose 中”。
已针对完整的 `docker-compose.prod.yaml`（43 行）进行验证：该文件中根本没有关于 `grafana` 的端口覆盖——这种说法似乎在本次会话之前就已存在，且很可能早已不准确。它现在已被进一步取代：Grafana 在基础的 `docker-compose.yaml` 中没有任何主机端口（前置为 `proxy`）——这比“绑定 localhost”的缓解措施更强，但这并非两个检查表实际描述的内容。两者都应进行更新以描述当前的实际缓解措施（代理 + `auth_request` 门控），而不是它们所引用文件中从未实现过的“localhost 绑定”。

**`docker-compose.prod.yaml`**（不是文档，但因“部署偏差 (deployment drift)”审计维度而被标记）——具有用于 `node-red`、`grafana`、`timescaledb`、`prometheus` 的资源限制覆盖，但对于新的 `alarm-api` 或 `proxy` 服务则没有。使用此覆盖配置文件的生产部署不会获得对这两项新服务的优化。

---

## P3 — Cosmetic / minor

**`docs/admin/ADMIN_MANUAL.md:373-386`** — “配置备份”部分列出了 `docker-compose.yaml`、`docker-compose.prod.yaml`、Prometheus 配置和 Grafana 仪表板，以进行基于 `cp` 的备份操作，但没有提到 `proxy/nginx.conf`——这是同一类别中的新配置文件（很小，被 git 跟踪，而且文档为了保持一致性/完整性已经列出了此处同样被 git 跟踪的其他文件）。

---

## Explicitly checked and found clean (no drift)

- `docs/architecture/GRAFANA_DESIGN_SYSTEM.md` 中关于悬挂式信息亭的“3 个仪表板”声明（NOC、简易概览、Andon）——根据 `tests/lint/dashboard-linter.js` 的 `MAX_HEIGHT` 对象进行了验证；准确无误。
- `docs/architecture/DATA_FLOW.md`，`docs/product/CONTEXT.md` —— 两者都已正确表述“12 个仪表板”。
- 所有在 `SOP_OPERATOR.md`、`ONBOARDING_SCRIPT.md`、`LDI_VALIDATION_PROTOCOL.md`、`README.md` 中的 `http://localhost:3000/d/...` 链接 —— 都没有损坏；`proxy` 透明地将 `GET` 流量转发到同一端口上的 Grafana，因此这些 URL 仍然能为浏览器中的终端用户正确解析。
- `docs/architecture/FUTURE_ANALYTICS.md` 中提及的“AI-Assisted” —— 具有正确的上下文（解释了该面板是 _从_ 何重命名的），而非当前状态的声明。
- `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md:19` 的“10 Grafana dashboards” —— 位于明确标记为“基线（于 2026-08-10 验证）”的部分内，根据该文件的惯例，这是一个带有日期的时间点快照（与 `docs/archive/` 和 `docs/audit/` 属于同一类别）——它被正确地保留为历史记录，而不是当前的偏差。
- 在 `EAP_ARCHITECTURE.md` (067)、`MANUFACTURING_DOMAIN.md` (013, 064, 067)、`DATA_RETENTION.md` (016)、`DATA_FLOW.md` (065) 中抽查了引用的迁移编号 —— 所有引用均存在且符合其描述的内容。
- `docs/operations/BACKUP_RESTORE.md`, `docs/operations/RELEASE_CHECKLIST.md`, `docs/operations/SCALING_PLAN.md`, `docs/operations/LDI_VALIDATION_PROTOCOL.md`, `docs/architecture/EAP_ARCHITECTURE.md`, `docs/architecture/MANUFACTURING_DOMAIN.md`, `docs/architecture/OWNERSHIP.md`, `docs/architecture/DATA_RETENTION.md`, `docs/architecture/ALARM_DETAIL_STYLE_GUIDE.md`, `docs/architecture/ARCHITECTURE_DIAGRAM.md`, `docs/architecture/LDI_RCA_GUIDE.md`, `docs/architecture/LDI_SPC_GUIDE.md`, `docs/architecture/PANEL_TOKENS.md`, `docs/business/BUSINESS_VALUE_ROI.md`（已通过先前的 commit 纠正了仪表板计数）, `docs/DOCUMENTATION_QUALITY_REPORT.md`, `docs/product/ONBOARDING_SCRIPT.md`, `docs/REAL-DATA-IMPORT.md`, `CHANGELOG.md`, `ABOUT-ME.md`, `START.md`, `AGENTS.md` —— 根据审计中已知的变更事实（alarm-api、proxy、仪表板/迁移/服务数量、OEE-as-live、Andon 交互性声明）进行了阅读/grep；未发现与当前代码库状态有差异。

---

## Summary

| Severity | Count |
| -------- | ----- |
| P0       | 3     |
| P1       | 7     |
| P2       | 3     |
| P3       | 1     |

**状态：本报告中所有 P0/P1/P2/P3 的发现在 2026-08-13 均已修复**（commit `docs: reconcile runtime architecture and DR guidance`），除了 `TROUBLESHOOTING.md`/`INCIDENT_RESPONSE.md` 预先存在的重复问题是通过从 `TROUBLESHOOTING.md` 中删除重复内容并替换为指针来解决的，而不是通过编辑 `INCIDENT_RESPONSE.md`（它本来就是正确的）。保留此报告作为发现和修复内容的记录，不会事后删除。
