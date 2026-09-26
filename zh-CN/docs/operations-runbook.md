<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS 运维手册（Runbook）

**范围：** 生产环境 Docker Compose 栈的日常运维、故障排除与安全恢复参考。下方每条命令都标注了风险等级——运行前请先阅读。

**命令风险等级：**
- 🟢 **只读（READ-ONLY）**——仅检查状态，不做任何更改，随时可运行。
- 🟡 **安全操作（SAFE ACTION）**——可逆、范围受控、不丢失数据（例如重建一个无状态容器）。
- 🔴 **影响生产（PRODUCTION-IMPACTING）**——会导致服务中断、触及持久化数据，或不易逆转。需要审慎判断，不属于常规操作。

本文档不包含任何真实凭据值。真实密钥存放在哪里、以及如何在不打印密钥的前提下分析问题，见下方"凭据/密钥处理"。

---

## 1. 系统架构概览

数据流：`SNMP/HTTP → Node-RED → PgBouncer（事务连接池）→ TimescaleDB（hypertable/CAGG）→ Grafana`。指标同时沿 `Prometheus（抓取目标）→ Alertmanager` 流动。`nginx`（`ims-proxy`）位于 Grafana 与 Node-RED 的 HTTP 端点 `/ldi-telemetry` 之前。

完整架构细节：`docs/architecture/`（总参考见 `IMS_PLATFORM_BOOK.md`，信任边界见 `SECURITY_MODEL.md`，接入流水线见 `DATA_FLOW.md`）。

## 2. 容器 / 服务清单

| 容器 | 角色 | 有健康检查 |
|---|---|---|
| `ims-timescaledb` | 主数据库（PostgreSQL 16 + TimescaleDB） | 有 |
| `ims-pgbouncer` | TimescaleDB 前的连接池 | 有 |
| `ims-node-red` | 接入流水线（SNMP 轮询、HTTP `/ldi-telemetry`、批处理、写入） | 有 |
| `ims-proxy` | nginx——Grafana 与 Node-RED HTTP 端点的前端 | 有 |
| `ims-grafana` | 仪表板 | 有 |
| `ims-grafana-renderer` | 为 Grafana 图像导出与告警提供无头渲染 | 有 |
| `ims-prometheus` | 指标抓取与存储 | 无（通过 `/-/healthy` 检查） |
| `ims-alertmanager` | 告警路由 | 无（通过 API 检查） |
| `ims-blackbox` | Prometheus blackbox exporter（HTTP/TCP/ICMP 探测） | 无 |
| `ims-snmpsim` | SNMP 模拟器（非生产设备目标） | 无 |
| `ims-alarm-api` | 自研 Node.js 服务——告警相关 API | 有 |
| `ims-factory-twin-3d` | 自研 Node.js 服务——3D 工厂孪生 | 有 |
| `ims-observability-archiver` | 后台归档任务 | 无 |
| `ims-db-migrate` | 一次性迁移执行器（应用迁移后退出，不常驻） | 不适用 |
| `ims-pgadmin4` | pgAdmin——数据库管理界面（不在运行时数据路径上） | 生产运维通常不需要 |

## 3. 健康检查

🟢 **只读**

```bash
docker ps --format "{{.Names}}\t{{.Status}}"          # all containers, at a glance
docker inspect <container> --format "{{.State.Health.Status}}"
```

或使用仓库自带的检查脚本：

```bash
make verify                                                      # picks the right script for the OS
./scripts/verify-deployment.sh                                   # Linux / Git Bash — full deployment sanity check
powershell -ExecutionPolicy Bypass -File scripts\verify-deployment.ps1   # Windows — same
./scripts/verify-db-health.sh                                    # TimescaleDB-specific
powershell -ExecutionPolicy Bypass -File scripts\verify-db-health.ps1
```

如需基于证据的完整就绪度评估（而不仅是"是否在运行"），请使用 `scripts/production-assurance.js`——见下文第 15 节。

## 4. Grafana 故障排除

🟢 检查：`curl -o /dev/null -w "%{http_code}" http://127.0.0.1:${GRAFANA_PORT:-3000}/login`（预期 `200`）。
🟢 查看日志：`docker logs ims-grafana --tail 100`。
🟢 检查数据源连通性：Grafana 界面 → Connections → Data sources → Test。

常见现象：在其他容器（通常是 `ims-timescaledb`）被重建后，经 nginx 访问 Grafana 返回 `502`。nginx 会缓存上游解析出的 IP，且不会自动重新解析。

🟡 **安全操作**——修复：`docker compose -p ims restart proxy`（仅 nginx，无状态，不影响数据；`-p ims` 与 `.env.example` 中的 `COMPOSE_PROJECT_NAME` 一致）。`docker exec ims-proxy nginx -s reload` 可在不重启进程的情况下达到同样效果。

## 5. Node-RED 故障排除

🟢 查看启动/flow 日志：`docker logs ims-node-red --tail 100`——关注 `Started flows` 以及任何 `[error]` 行。
🟢 检查 flow 完整性（无重复节点 ID）：仓库的一次性栈回归测试 `tests/fleet/runner.js` 会端到端验证这一点（见第 11 节）。
🟢 检查认证：若携带正确密钥访问 `/ldi-telemetry` 仍返回 `401 Unauthorized`，说明 `.env` 与调用方的 `INGEST_API_KEY` 不一致——切勿通过打印密钥值来诊断。

🔴 **影响生产**——重建 `ims-node-red` 会在 flow 引擎冷启动期间造成数据接入空档（实际观察约 2 分钟）。仅在确需修复时（例如 flow 或镜像变更）执行，不要用于常规排障：

```bash
docker compose -p ims up -d --no-deps node-red
```

## 6. PostgreSQL / TimescaleDB 故障排除

🟢 连通性：`docker exec ims-timescaledb pg_isready -U $POSTGRES_USER -d $POSTGRES_DB`。
🟢 活动连接：`docker exec ims-timescaledb psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT count(*) FROM pg_stat_activity;"`。
🟢 扩展版本（每次更换 TimescaleDB 镜像后）：`SELECT extversion FROM pg_extension WHERE extname='timescaledb';`。
🟢 迁移状态：`SELECT count(*) FROM public.schema_migrations;`。

🔴 **影响生产**——重建 `ims-timescaledb` 会中断所有依赖服务（pgbouncer、Node-RED、Grafana、alarm-api）的连接，直到它们重新连接——实践中通常会在数秒至约 30 秒内自行恢复，但事后务必确认遥测已恢复（第 10 节）。**每次更换 TimescaleDB 镜像版本后，都必须手动执行 `ALTER EXTENSION timescaledb UPDATE;`**——仅替换镜像不会更新已安装扩展的目录版本。

🔴 应用新迁移：`./scripts/migrate.sh`——请先审阅迁移文件；这会更改数据库结构，若没有对应的回退迁移则不易撤销。

## 7. Prometheus 故障排除

🟢 健康：`curl http://127.0.0.1:${PROMETHEUS_PORT:-9090}/-/healthy`。
🟢 目标状态：`curl http://127.0.0.1:${PROMETHEUS_PORT:-9090}/api/v1/targets`——查找 `"health":"down"` 条目。
🟢 与 Alertmanager 的连接：`curl http://127.0.0.1:${PROMETHEUS_PORT:-9090}/api/v1/alertmanagers`。

🟡 重建（无状态替换，例如修改配置后）：`docker compose -p ims up -d --no-deps prometheus`。抓取状态会重置，目标需要一个抓取周期才会重新报告健康——这是预期行为，并非故障。

## 8. Alertmanager 故障排除

🟢 健康：`curl http://127.0.0.1:${ALERTMANAGER_PORT:-9093}/-/healthy`。
🟢 活动告警：`curl http://127.0.0.1:${ALERTMANAGER_PORT:-9093}/api/v2/alerts`。

按 `docker-compose.yaml` 的设计仅绑定在 `127.0.0.1`——有意不允许从主机外部访问。

## 9. nginx / 代理故障排除

🟢 确认配置加载无误：`docker logs ims-proxy --tail 50`。
🟡 修改配置文件后重载：先用 `docker exec ims-proxy nginx -t` 校验，再执行 `docker exec ims-proxy nginx -s reload`（无状态；`proxy/nginx.conf` 以绑定挂载方式提供）。

上游 IP 过期问题是本栈最常见的 nginx 问题，见第 4 节。

## 10. 遥测接入故障排除

🟢 近期行数（用于合理性检查，而非严格判定）：

```sql
SELECT 'ldi_data', count(*) FROM public.ldi_data WHERE ingest_ts > now() - interval '5 minutes'
UNION ALL SELECT 'sys_metrics', count(*) FROM public.sys_metrics WHERE time > now() - interval '5 minutes'
UNION ALL SELECT 'net_metrics', count(*) FROM public.net_metrics WHERE time > now() - interval '5 minutes';
```

🟢 重复检测：`SELECT log_id, count(*) FROM public.ldi_data WHERE ingest_ts > now() - interval '30 minutes' GROUP BY log_id HAVING count(*) > 1;`——预期零行。
🟢 **IMS Pipeline Health & Meta-Monitoring** 仪表板（`ims-meta-monitoring`）以可视化方式展示写入速率、批次成功率、重试队列深度与熔断器状态——手动查询前请先查看它。

## 常见故障现象 → 可能原因

| 现象 | 可能原因 | 查看位置 |
|---|---|---|
| 经 nginx 访问 Grafana 返回 `502` | 依赖容器重建后，nginx 的上游 IP 过期 | 第 4 节 |
| `/ldi-telemetry` 返回 `401` | `INGEST_API_KEY` 不一致 | 第 5 节 |
| 真实批次访问 `/ldi-telemetry` 返回 `502` | 外键冲突——设备未在 `public.devices` 中登记 | 查看 `docker logs ims-node-red` 中的具体约束名 |
| `/ldi-telemetry` 返回 `503` | 暂存写入失败——无法访问 TimescaleDB/pgbouncer | 第 6 节，然后第 9 节 |
| 遥测行数不再增长 | 接入流水线停滞，或 TimescaleDB/pgbouncer 宕机 | 第 10 节，然后第 5–6 节 |
| 出现重复的 `log_id` 行 | 真正的回归——绝不应发生；一次性栈的设备群回归测试（第 11 节）专门防范此问题 | 升级处理——见第 16 节 |

## 11. 安全的重启顺序

当多个服务都需要处理时，请按依赖顺序重启，避免连锁的重连风暴：

1. `ims-timescaledb`（确有必要时——见第 6 节，影响生产）
2. `ims-pgbouncer`
3. `ims-node-red`
4. `ims-proxy`（最后执行，以便获取上述所有服务的新上游 IP）

**切勿在一次操作中重启多个不相关的服务**——每次只重建一个容器（使用 `--no-deps`），确认健康后再处理下一个。

每次生产变更后，重新运行真实回归测试：

```bash
node tests/fleet/runner.js
```

该命令会构建一个完全隔离、可丢弃的栈（独立的项目名、端口与容器——绝不触及生产数据），并要求 9/9 项检查全部通过：设备接纳、完整性、重复、序列连续性、数据损坏、错误率、认证强制、密钥轮换，以及失败路径的 HTTP 状态码。

## 12. 回滚指南

镜像标签变更（Node-RED、TimescaleDB、Prometheus 等）：将 `docker-compose.yaml` 中的标签改回上一个已知良好的值，然后只重建该容器（`--no-deps`）。对于 TimescaleDB，切勿通过 `ALTER EXTENSION` 降级扩展版本——扩展降级不是受支持、可可靠回退的操作；若 TimescaleDB 镜像变更确实引发问题，应从备份恢复（第 13 节），而不是尝试原地回退扩展版本。

迁移：只有在存在对应回退迁移时才通过它回退；切勿手动编辑已应用的数据库结构状态。

## 13. 备份 / 恢复参考

完整流程：`docs/operations/BACKUP_RESTORE.md`。脚本：`scripts/backup-db.sh`、`scripts/restore-db.sh`、`scripts/dr-test.sh`、`scripts/dr-verify-restore.sh`。

🔴 恢复操作本质上**影响生产**，并可能覆盖当前数据——对运行中的环境执行 `restore-db.sh` 之前，务必先阅读 `BACKUP_RESTORE.md` 的验证部分（前后行数核对）。

## 14. 凭据 / 密钥处理

所有真实密钥都存放在 `.env` 中（已被 gitignore 忽略，从未提交），并通过 Docker Compose 环境变量注入。**切勿打印、记录或提交任何真实凭据值**——诊断认证问题时，应检查某个值是否*已设置*（`grep -c "^KEY_NAME="  .env`），而不是*打印*该值。

PostgreSQL、Grafana 管理员、Node-RED 凭据密钥与 pgAdmin 凭据均已在 P10（R7/R8）中完成轮换——轮换记录见 `docs/evidence/CREDENTIAL_ROTATION_P10R.md` 与 `docs/evidence/CREDENTIAL_ROTATION_P10R8.md`（仅含元数据，不含任何值）。

`nodered_data/flows.json` 中的 `pg_config` 节点必须始终显示 `userFieldType: "env"` / `passwordFieldType: "env"`——若出现 `"str"`，说明明文凭据重新混入，应按安全事件处理，而非普通漂移。

## 15. 安全闸门结果解读

运行：`node scripts/production-assurance.js --profile=security`。请对照 `docs/evidence/FINAL_SECURITY_GATE_P12.md` 解读结果，该文档记录了本项目基于实际证据的解读策略：**该配置文件给出的原始 NO-GO 并不自动等同于线上事件**——Trivy 仅按严重级别判断，并不考虑可达性。任何新的 CRITICAL/HIGH 发现，在视为紧急之前，都应先与该报告中的处置表比对。只有在本部署的实际配置中可通过真实的运行时/网络/认证路径触达时，发现才需要处理——升级之前请先阅读该报告的方法论。

## 16. 升级标准

完整的严重级别框架与案例：`docs/operations/INCIDENT_RESPONSE.md`。概括而言：凡符合该文档 P0/P1 定义的情况都应立即升级——正在发生的数据丢失、长时间的生产中断，或已确认（而非仅被 Trivy 标记）的安全暴露。常规重启、缓存过期现象（第 4 节）以及已确认不可达的 CVE 发现（第 15 节），本身不需要升级。

## 17. Factory Twin（3D）故障排除

设计背景：`docs/architecture/FACTORY_TWIN_ARCHITECTURE.md`。安全边界：`docs/architecture/FACTORY_TWIN_SECURITY_MODEL.md`。

🟢 可安全分享的整体健康信息：`docker exec ims-factory-twin-3d wget -qO- http://localhost:4100/api/diagnostics`。只输出计数、布尔值与固定枚举——不含坐标、标识符、路径、工艺或厂商名称——因此可以直接贴到工单中。关注 `requestsFailed`、`geometryParseFailures` 与 `geometryLoadMs`。
🟢 含数据库往返的存活检查：`docker exec ims-factory-twin-3d wget -qO- http://localhost:4100/healthz`。

> **此容器按设计没有主机端口。** 请按上述方式通过 `docker exec` 访问，或携带有效的 Grafana 会话经代理访问 `/factory-twin-3d/`。切勿为了方便排查而发布主机端口——那会绕过孪生信息披露模型所依赖的 `auth_request` 闸门。

| 现象 | 可能原因 |
|---|---|
| 访问 `/factory-twin-3d/` 返回 401 | 没有有效 Grafana 会话时属正常现象，说明闸门在工作。请先登录；不要修改中间件。 |
| 重新构建后 `/factory-twin-3d/` 返回 502 | nginx 缓存了旧的上游 IP。执行一次 `docker exec ims-proxy nginx -s reload`（见第 4 节）。 |
| 场景能渲染但没有建筑结构 | 缺少私有几何数据。全新克隆时属正常现象；API 会返回空但有效的结构而非错误。请确认本主机上 `private/` 绑定挂载中有数据。 |
| Building / Overview 视图按钮被禁用 | 同一原因：实测的建筑外轮廓尚未加载。 |
| `geometryParseFailures` 持续增加 | 某个私有文件格式错误。按设计会将其视为不存在，因此服务保持运行；需要在源头修正数据。 |
| 修改 `public/` 后看不到变化 | 应用代码已打包进镜像，只有 `private/` 是实时挂载。请重新构建并重建该服务，然后重载 nginx。 |
| 区域计数发生变化 | 只有通过验证的层级才会渲染。此处的变化意味着出现了新证据或发生了回归——两者都需要检查，且都不能通过调整几何来"修复"。 |

🟢 以直方图而非计时日志呈现的延迟：diagnostics 响应中的 `runtime.latency_buckets` 统计落在 10 ms / 50 ms / 100 ms / 500 ms 以下以及 500 ms 及以上的请求数。桶名称在代码中固定，调用方发送的任何内容都无法新增字段。每个 diagnostics 字段的披露等级都列在 `docs/architecture/FACTORY_TWIN_SECURITY_MODEL.md` 的表格中——新增字段前必须先在那里完成分类。

### 发布标准

发布孪生相关变更前，以下各项必须全部满足，且不得通过放宽断言来豁免任何一项。

| 闸门 | 检查位置 |
|---|---|
| Factory twin 契约测试全部通过（mapping、telemetry overlay、alarm/RCA、analytics、MES boundary、geometry mutation、diagnostics、evidence、wire、schematic、floor registry、operational status） | pre-commit 钩子与 CI 的 `unit-tests` 作业 |
| 几何校验器 0 错误 / 0 警告，或在无私有数据时干净地跳过 | CI 的 `lint` 作业 |
| 私有数据泄露扫描 0 命中（扫描器只匹配文件路径，因此还需人工审阅 diff，排查源自 CAD 的数字、设备编号与批号） | CI 的 `lint` 作业第一步 |
| 五种视口下的浏览器回归全部通过，并报告和阅读每一个 SKIP | CI 的 `factory-twin-regression` 作业 |
| 故障模式回归通过 | CI 的 `factory-twin-regression` 作业 |
| 未认证边界：所有孪生路由均返回 401 | 浏览器回归（代理模式） |
| 已确认的物理映射仍为 0，除非收到权威记录 | 回归测试的证据语义部分 |

SKIP 不等于 PASS。若运行报告存在跳过的检查，发布前必须阅读原因：常见原因是环境中没有私有几何数据或没有受监控设备，两者都是合理的——但也都意味着该次运行没有验证这些属性。

### 回滚

🟡 孪生服务无状态且只读：它不向数据库或磁盘写入任何内容。因此回滚只是容器镜像操作，不涉及数据后果。

1. 重新部署上一个镜像，并只重建该服务。
2. 重载一次代理——nginx 在启动时缓存上游地址，否则重建后的容器会返回 502。
3. 先确认 `/healthz`，再确认 diagnostics 计数。

🔴 **切勿**通过编辑 `private/` 下的文件来回滚。那些文件是证据而非配置；几何变更属于数据变更，应由源数据负责人处理，而不是由部署处理。

🔴 切勿把孪生中显示的值当作物理设备的运营事实。设备**状态**是实时遥测；设备**位置**来自 CAD 图纸，但尚无任何受监控设备与其中任何位置建立映射（已确认映射为 0），因此平面图上没有任何信息能告诉你某台设备在哪里。依据该视图采取行动前，请先阅读操作员指南：`docs/architecture/FACTORY_TWIN_OPERATOR_GUIDE.md`。
