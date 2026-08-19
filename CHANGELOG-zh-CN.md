# 更新日志 (Changelog)

> **IMS (Infrastructure Monitoring System) 更新日志**
> 格式参考 [Keep a Changelog](https://keepachangelog.com/)

---

<div align="center">

<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **版本 (Version):** 1.0.0
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **发布 (Release):** 生产版 (Production)
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **日期 (Date):** 2026-06-29

</div>

---

## [1.0.0] — 2026-06-29 (生产版本)

### 亮点 (Highlights)

- **5-Thread Parallel Walker** — CPU、存储、网络、温度、LDI
- **Device Registry** — 数据驱动的设备管理（支持 1-1000+ 台机器）
- **4 个 Grafana 仪表板** — NOC、系统、工程、容量规划
- **38 条告警规则** — AIOps、预测性告警、SRE 标准
- **K6 负载测试** — 1,000 VUs，0% 失败率，p95 < 80ms
- **CI/CD 管道** — 包含安全扫描的 GitHub Actions

### 修复 (Fixed)

- LDI 企业级 OID 不匹配问题（9999 与 99999）
- `bypass_error` 节点连线未连接（导致 barrier 超时）
- `catch_walker` 作用域中缺少 `walk_ldi`
- `ldiTemp` 已计算但未保存到数据库
- 64位计数器的溢出翻转（wraparound）启发式算法不正确
- 告警消息中的表情符号转义序列错误
- Docker 主机端口冲突问题（snmpsim 1161, pgbouncer 6432）
- TimescaleDB 数据库迁移的事务不兼容问题
- 凭据文件持久化导致的遗留问题（即使执行 `docker compose down -v` 之后依然存在）

### 新增 (Added)

- **Device Registry Pattern** — `public.machines` 表与 SNMP walker 的集成
- **LINE Notify / MS Teams Webhooks** — 真实的告警通知
- **数据库迁移系统** — `database/migrations/`，使用幂等 (idempotent) 的 SQL 脚本
- **23 个单元测试** — 全部通过，涵盖解析逻辑
- **CI/CD Secret Stubs** — 无需真实凭据即可进行 Compose 验证
- **Gitleaks 允许名单** — `.env`, `.playwright-mcp/`, `nodered_data/`
- **备份/恢复脚本** — `scripts/backup-db.sh`, `scripts/restore-db.sh`
- **SECURITY.md** — 已知限制和安全加固清单
- **CHANGELOG.md** — 此文件
- **CONTRIBUTING.md** — 开发指南
- **LICENSE** — MIT 许可证
- **Makefile** — 提供 8 个执行目标 (up, down, restart, verify, backup, restore, logs, test)
- **docker-compose.override.yaml** — 适用于开发的重写配置 (snmpsim)
- **docker-compose.prod.yaml** — 适用于生产的重写配置
- **事件响应手册** — `docs/runbooks/incident-response.md`
- **部署准备就绪评估** — `docs/deployment-readiness.md`
- **扩展计划** — `docs/scaling-plan.md`
- **Prometheus Exporter** — Node-RED 自我监控配置

### 变更 (Changed)

- 将 `docker-compose.yaml` 拆分为 base/dev/prod（基础/开发/生产）
- 流程统一事实源：`node-red/flows/ingestion.json` 和 `alerting.json`
- 所有的 walker 都使用 `msg.host`/`msg.community` 来替代硬编码的值
- 将 `walk_storage` 升级为双引擎（生产环境使用 subtree，开发环境使用 GET）
- 将 `sysUpTime` OID 添加至 `walk_net_get` 用于检测计数器溢出翻转
- LDI 列类型从 INT 更改为 DOUBLE PRECISION
- 将架构升级为 5-Thread Parallel Walker
- 所有服务仅限内部网络使用（不绑定主机端口）

### 安全 (Security)

- 取消对 `.mimocode/` 和 `.playwright-mcp/` 在 git 中的跟踪
- 从跟踪的文件中移除了 GitHub PAT
- 就绪 Node-RED 的 adminAuth 认证配置
- 不再将 PgBouncer 端口暴露在主机上

---

## [0.9.0] — 2026-06-24 (重构前基线)

### 新增 (Added)

- 5-Thread Bulletproof AIOps 解析器 v7
- 双引擎 SNMP Walker（仅限网络部分）
- Alertmanager 抑制规则 (inhibition rules)

---

<div align="center">

**IMS 更新日志 — 1.0 版本**

_遵循 [Keep a Changelog](https://keepachangelog.com/) 格式_

</div>
