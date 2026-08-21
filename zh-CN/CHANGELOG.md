# Changelog

> **IMS (Infrastructure Monitoring System) 变更日志**
> 格式参考 [Keep a Changelog](https://keepachangelog.com/)

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Version:** 1.0.1
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Release:** Production
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Date:** 2026-08-21

</div>

---

## [1.0.1] - 2026-08-21 (World-Class Open Source Edition)

### 亮点 (Highlights)
- **100% 安全合规 (Security Compliance)**：对外科手术般的 Git 历史清理（超过 1,100 次提交），彻底消除了所有真实的 IP、硬件标签和供应商错误代码。
- **V2 规范化架构 (V2 Normalized Architecture)**：将 Node-RED 摄取迁移到规范化的 JSON 结构和绑定 Schema 的 SQL 插入。
- **全面的 Pre-commit 检查 (Pre-commit Suite)**：添加了强大的 Husky 钩子，强制执行单元测试、E2E 测试、Dashboard Linter、安全例外和文档同步。
- **跨平台兼容 (Cross-Platform)**：解决了严重的 Windows/Linux CRLF 节点崩溃错误并规范了路径。
- **多语言卓越 (Multilingual Excellence)**：所有文档和 README 实现了英语、泰语和简体中文的全面同步和精美翻译。
- **赛博朋克 NOC UI (Cyberpunk NOC UI)**：将静态 UI 资产替换为动画 60 FPS 的赛博朋克扫描仪 GIF，用于 NOC 演示。

### 安全 (Security)
- **CVE 例外引擎 (CVE Exceptions Engine)**：为高严重性但不可达的漏洞（例如 Grafana Go stdlib DoS）创建了程序化的、严格过期的网关。
- **物理数据清理 (Physical Data Scrub)**：从本地机器中删除了所有旧的数据转储和日志，防止绕过 `.gitignore` 的泄漏。
- **Nginx 加固 (Nginx Hardening)**：在反向代理上实施了严格的速率限制（`limit_req_zone 100r/s`）和请求头大小上限（`large_client_header_buffers 4 16k`）。

### 修复 (Fixed)
- 修复了 `verify-deployment.ps1` 期间 Windows 上的 E2E IPv6 `localhost` 解析超时。
- 修复了 Grafana 仪表板布局网格重叠（强制执行 Grid-24 规则）。
- 修复了 AIOps 解析器内部的 Node-RED 屏障超时竞争条件。
- 修复了缺失的 `sys_hourly` 连续聚合刷新策略。
- 将孤立的 `as` 类型断言迁移到 `@total-typescript/shoehorn`。

## [1.0.0] — 2026-06-29 (Production Release)

### Highlights

- **5-Thread Parallel Walker** — CPU, Storage, Network, Temperature, LDI
- **Device Registry** — 数据库驱动的机器管理 (1-1000+ 台机器)
- **4 Grafana Dashboards** — NOC, System, Engineering, Capacity Planning
- **38 Alert Rules** — AIOps, Predictive, SRE 标准
- **K6 Load Test** — 1,000 VUs, 0% 故障率, p95 < 80ms
- **CI/CD Pipeline** — 包含安全扫描的 GitHub Actions

### Fixed

- LDI 企业级 OID 不匹配 (9999 vs 99999)
- `bypass_error` 节点连线未连接 (导致屏障超时)
- `walk_ldi` 缺失于 `catch_walker` 范围
- `ldiTemp` 已计算但未保存到数据库
- 64 位计数器的计数器循环启发式算法不正确
- 警报消息中的表情符号转义序列错误
- Docker 主机端口冲突 (snmpsim 1161, pgbouncer 6432)
- TimescaleDB 迁移事务不兼容
- `docker compose down -v` 后陈旧凭证文件的持久化问题

### Added

- **Device Registry Pattern** — `public.machines` 表与 SNMP walker 集成
- **LINE Notify / MS Teams Webhooks** — 真实警报通知
- **Database Migration System** — `database/migrations/` 带有幂等 SQL
- **23 Unit Tests** — 全部通过，覆盖解析逻辑
- **CI/CD Secret Stubs** — 无需真实凭证即可验证 Compose
- **Gitleaks Allowlist** — `.env`, `.playwright-mcp/`, `nodered_data/`
- **Backup/Restore Scripts** — `scripts/backup-db.sh`, `scripts/restore-db.sh`
- **SECURITY.md** — 已知限制和强化检查清单
- **CHANGELOG.md** — 本文件
- **CONTRIBUTING.md** — 开发指南
- **LICENSE** — MIT 许可证
- **Makefile** — 8 个目标 (up, down, restart, verify, backup, restore, logs, test)
- **docker-compose.override.yaml** — 开发覆盖 (snmpsim)
- **docker-compose.prod.yaml** — 生产覆盖
- **Incident Response Runbook** — `docs/runbooks/incident-response.md`
- **Deployment Readiness Assessment** — `docs/deployment-readiness.md`
- **Scaling Plan** — `docs/scaling-plan.md`
- **Prometheus Exporter** — Node-RED 自监控配置

### Changed

- 将 `docker-compose.yaml` 拆分为 base/dev/prod
- Flow 的真实数据源：`node-red/flows/ingestion.json` + `alerting.json`
- 所有 walkers 使用 `msg.host`/`msg.community` 而不是硬编码值
- `walk_storage` 升级为双引擎 (生产环境中为 subtree，开发环境中为 GET)
- 将 `sysUpTime` OID 添加到 `walk_net_get` 用于检测计数器循环
- LDI 列类型从 INT 更改为 DOUBLE PRECISION
- 架构升级为 5 线程并行 Walker
- 所有服务仅限内部使用 (无主机端口绑定)

### Security

- 取消对 `.mimocode/` 和 `.playwright-mcp/` 的 git 跟踪
- 从跟踪文件中删除了 GitHub PAT
- Node-RED adminAuth 配置就绪
- PgBouncer 端口不再暴露在主机上

---

## [0.9.0] — 2026-06-24 (Pre-Refactor Baseline)

### Added

- 5 线程防弹 AIOps 解析器 v7
- 双引擎 SNMP Walker (仅限网络)
- Alertmanager 抑制规则

---

<div align="center">

**IMS Changelog — Version 1.0**

_遵循 [Keep a Changelog](https://keepachangelog.com/) 格式_

</div>
