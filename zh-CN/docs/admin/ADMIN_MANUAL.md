<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 系统管理与 SRE 指南

> **IMS 维护用 IT 团队（MIS-G）管理手册**
> 涵盖 Docker 管理、设备注册、告警管理与故障排除。

---

<div align="center">

<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **管理：** SRE 指南
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **版本：** 1.2
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **读者：** IT 团队

</div>

---

## 目录

1. [系统管理](#系统管理)
2. [添加新设备](#添加新设备)
3. [告警管理](#告警管理)
4. [故障排除](#故障排除)
5. [备份与恢复](#备份与恢复)
6. [性能监控](#性能监控)

---

## 系统管理

### 容器概览

系统完全运行在 Docker Compose 上：`docker-compose.yaml` 定义了 16 个服务（15 个常驻服务，以及 1 个完成后即退出的一次性迁移执行器）。由于没有 `profiles:` 分组，`make up` 与 `make up-prod` 会启动全部服务，包括 SNMP 模拟器与 pgAdmin：

| 容器 | 服务 | 端口 | 用途 |
| --- | --- | --- | --- |
| `ims-timescaledb` | TimescaleDB | 5432（仅内部，在 compose 中注释） | 时序数据库 |
| `ims-pgbouncer` | PgBouncer | 5432（内部） | 连接池 |
| `ims-db-migrate` | 迁移执行器 | —（一次性） | 应用 `database/migrations/*.sql`，并在完成前阻止 `node-red` 与 `alarm-api` 启动 |
| `ims-node-red` | Node-RED | 1880（仅回环） | 数据流水线 |
| `ims-proxy` | nginx 反向代理 | **3000** | 唯一的 UI 入口：`/` 转发至 Grafana，另有 `/alarm-api/`、`/factory-twin-3d/`，并将 `/ldi-telemetry` 与 `/inject` 转发至 Node-RED。`/alarm-api/` 需先通过基于 Grafana 会话的 `auth_request` 检查。 |
| `ims-grafana` | Grafana | 仅内部，无主机端口 | 仪表板——只能经 `ims-proxy` 访问 |
| `ims-alarm-api` | alarm-api | 仅内部，无主机端口 | `public.ldi_alarm_lifecycle` 的写入路径（来自 `IMS LDI - Alarm Console` 的确认/解决）。只能经 `ims-proxy` 访问。 |
| `ims-grafana-renderer` | Grafana Image Renderer | 8081（内部） | 为面板导出与告警渲染 PNG |
| `ims-prometheus` | Prometheus | 9090（仅回环） | 指标与告警 |
| `ims-alertmanager` | Alertmanager | 9093（仅回环） | 告警路由 |
| `ims-blackbox` | Blackbox Exporter | 9115（仅回环） | SLA 探测 |
| `ims-snmpsim` | SNMP 模拟器 | 161/udp（内部） | 用于开发与演示的模拟 SNMP 设备 |
| `ims-factory-twin-3d` | Factory Twin 3D | 4100（内部） | 一楼数字孪生，经 `ims-proxy` 在 `/factory-twin-3d/` 提供 |
| `ims-observability-archiver` | 日志/指标归档器 | —（无端口） | 定期将容器与数据库的可观测性快照归档到 `./ops-logs`。通过 `ims-docker-socket-proxy` 安全通信。 |
| `ims-docker-socket-proxy` | Docker Socket Proxy | —（仅内部） | 在隔离网络上限制 Docker daemon socket 仅允许只读端点。 |
| `ims-pgadmin4` | pgAdmin 4 | **5050（仅回环：127.0.0.1:5050）** | 数据库管理界面。严格绑定到本地回环地址以确保安全。 |

> `ims-db-migrate` 在应用完待执行迁移后以状态 0 退出——在 `docker compose ps` 中看到 `Exited (0)` 属正常现象，并非故障。在其成功完成之前，`node-red` 与 `alarm-api` 不会启动。

### 常用操作

```bash
# 查看所有容器状态
docker compose ps

# 启动全部系统
docker compose up -d

# 关闭全部系统
docker compose down

# 彻底重启 -- 删除所有数据（全部卷），仅限可丢弃的环境
docker compose down -v && docker compose up -d

# 重启出现问题的特定服务
docker compose restart node-red
docker compose restart pgbouncer
docker compose restart grafana
docker compose restart proxy
docker compose restart alarm-api
docker compose restart prometheus alertmanager

# 实时查看日志（最后 50 行）
docker compose logs -f --tail 50 node-red
docker compose logs -f --tail 50 pgbouncer

# 查看资源使用情况
docker stats --no-stream
```

> [!NOTE]
>
> > 执行 `docker compose down -v` 后，需等待约 40 秒，待所有服务完全启动后再进行检查。

### 服务健康检查

```bash
# 数据库
docker compose exec timescaledb pg_isready -U ims_admin -d ims

# Node-RED
curl -s http://localhost:1880/

# Grafana
curl -s http://localhost:3000/api/health

# Prometheus
curl -s http://localhost:9090/-/healthy

# Alertmanager
curl -s http://localhost:9093/-/healthy
```

### 数据库迁移

`database/migrations/` 目前有 66 个按序编号的文件（`013` 至 `091`，部分编号已跳过或归档——更早的 `001-012` 已并入全新部署的引导路径 `postgres/init/001-init-timescaledb.sql`）。一次性服务 `ims-db-migrate` 会在每次 `docker compose up` 时自动应用；在其成功退出之前，`node-red` 与 `alarm-api` 不会启动。

迁移 084–086 作用于单独的 `eap_backup` 数据库（存放钻孔与 VCP 数据）。该库不存在时，它们会输出 `IMS_MIGRATION_DEFERRED`，运行器**不会**将其记为已执行；`eap_backup` 建立后，下一次运行 `db-migrate`（`docker compose run --rm db-migrate`）会自动应用它们。运行器也会在第一个失败的迁移处停止，不会在只应用了一半的 schema 上继续执行后续迁移。在此行为之前完成迁移的环境可能已将 084–086 记为已执行但并未生效，请按[钻孔与 VCP 合成数据](../data/MOCK_DATA.md)中的步骤手动执行这三个文件；它们可以安全地重复执行。

```bash
# 不启动栈的其他部分，手动重新运行迁移
bash scripts/migrate.sh

# 健康且为最新状态的数据库应输出与下行完全一致的内容：
# Pending: 0 Applied: 0 Failed: 0
# "Pending: N" 表示有 N 个迁移文件在 schema_migrations 中尚无记录
# -- scripts/migrate.sh 会按顺序应用它们。

# 查看实际已应用的迁移
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT version, filename, applied_at FROM public.schema_migrations ORDER BY version DESC LIMIT 10;"
```

所有迁移都按可重复执行的方式编写（`CREATE ... IF NOT EXISTS`、带条件保护的 `DO $$ ... $$` 块），因此对已是最新状态的数据库重新运行 `scripts/migrate.sh` 始终是安全的空操作。有意只保留一个迁移执行器（而不是三个）的原因，见 `docs/architecture/ARCHITECTURE.md` 的 "Migration Governance" 一节。

---

## 投产前安全检查清单

> [!CAUTION]
> 投产前必须更改所有默认凭据，否则系统将面临未授权访问风险。

| 凭据 | 默认值 | 位置 | 所需操作 |
| --- | --- | --- | --- |
| `INGEST_API_KEY` | 公开的示例值 | `.env` → `ims-node-red` 环境变量 | **必须更改**——任何能访问 `/ldi-telemetry` 或 `/inject` 的人（经 nginx 的主机端口 3000，或回环上的 1880）都能注入伪造遥测 |
| `POSTGRES_PASSWORD` | 公开的示例值 | `.env` | **必须更改**——数据库超级用户（`POSTGRES_USER`） |
| `GRAFANA_DB_PASSWORD` | 公开的示例值 | `.env` → `grafana_reader` 角色、PgBouncer userlist | **必须更改**——可读取 Grafana 能查询的所有表 |
| `ALARM_API_DB_PASSWORD` | 公开的示例值 | `.env` → `alarm_api_writer` 角色（迁移 `078-alarm-api-writer-role.sql`） | **必须更改**——权限仅限 `ldi_alarm_lifecycle` 上的 `SELECT`+`UPDATE`，但仍是真实的数据库凭据 |
| `NODERED_DB_PASSWORD` | 公开的示例值 | `.env` → `nodered_writer` 角色（迁移 `087-service-writer-roles.sql`）、PgBouncer userlist | **必须更改**——必填；Node-RED 写入采集数据所用（非超级用户）。未设置时 compose 拒绝启动 |
| `ARCHIVER_DB_PASSWORD` | 公开的示例值 | `.env` → `observability_archiver` 角色（迁移 `087-service-writer-roles.sql`） | **必须更改**——必填；仅有 `container_restart_audit` 的 `INSERT` 权限 |
| `GRAFANA_ADMIN_PASSWORD` | 公开的示例值 | `.env` → Grafana 管理员 | **必须更改**——可编辑仪表板与数据源 |
| `ALERT_WEBHOOK_TOKEN`、`GRAFANA_RENDERER_TOKEN` | 公开的示例值 | `.env` | **必须更改**——webhook 与 renderer 的共享密钥。`ALERT_WEBHOOK_TOKEN` 为必填：缺少 `Authorization: Bearer <token>` 时 `/alert-webhook` 返回 401，未设置时返回 503；Alertmanager（compose secret）与 Grafana 联络点会发送该令牌 |
| `NODE_RED_CREDENTIAL_SECRET`、`NODE_RED_ADMIN_PASSWORD_HASH` | 公开的示例值 / 空 | `.env` → Node-RED | 在任何 flow 中保存凭据之前**必须更改**；哈希为空时 `nodered_data/settings.js` 会拒绝启动 Node-RED |
| `PGADMIN_DEFAULT_PASSWORD` | 公开的示例值 | `.env` → pgAdmin | **必须更改**——pgAdmin 在所有接口上发布端口 |

`.env.example` 中的每个值都是公开的（仓库为公开仓库）。应将其全部视为已泄露，切勿用于部署。

首次 `docker compose up` 之后，锁定 provision 的仪表板文件夹，使 Editor 只能查看、不能向其中添加仪表板（Admin 保留全部权限，General 文件夹仍对 Editor 开放）。脚本会列出差异，不加 `--apply` 时不做任何更改；更改约 30 秒内生效：

```bash
node scripts/grafana-folder-permissions.js
node scripts/grafana-folder-permissions.js --apply
```

### 如何轮换凭据

```bash
# 1. 生成新密钥（不要在共享的终端日志中回显）
gen() { python -c "import secrets; print(secrets.token_urlsafe($1))"; }
NEW_API_KEY=$(gen 32); NEW_PG_PASS=$(gen 24); NEW_GRAFANA_DB_PASS=$(gen 24)
NEW_ALARM_API_DB_PASS=$(gen 24); NEW_GRAFANA_ADMIN_PASS=$(gen 24)
NEW_NODERED_DB_PASS=$(gen 24); NEW_ARCHIVER_DB_PASS=$(gen 24); NEW_ALERT_WEBHOOK_TOKEN=$(gen 32)

# 2. 趁旧凭据仍然有效，"先"修改数据库角色密码。
#    修改 .env 不会更改现有数据卷中的超级用户密码。
#    本会话关闭语句日志，避免密码写入服务器日志。
docker compose exec -T timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL
SET log_statement = 'none';
ALTER ROLE CURRENT_USER WITH PASSWORD '$NEW_PG_PASS';
ALTER ROLE grafana_reader WITH PASSWORD '$NEW_GRAFANA_DB_PASS';
ALTER ROLE alarm_api_writer WITH PASSWORD '$NEW_ALARM_API_DB_PASS';
ALTER ROLE nodered_writer WITH PASSWORD '$NEW_NODERED_DB_PASS';
ALTER ROLE observability_archiver WITH PASSWORD '$NEW_ARCHIVER_DB_PASS';
SQL

# 3. 同步更新 .env
sed -i "s/^INGEST_API_KEY=.*/INGEST_API_KEY=$NEW_API_KEY/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_PG_PASS/" .env
sed -i "s/^GRAFANA_DB_PASSWORD=.*/GRAFANA_DB_PASSWORD=$NEW_GRAFANA_DB_PASS/" .env
sed -i "s/^ALARM_API_DB_PASSWORD=.*/ALARM_API_DB_PASSWORD=$NEW_ALARM_API_DB_PASS/" .env
sed -i "s/^GRAFANA_ADMIN_PASSWORD=.*/GRAFANA_ADMIN_PASSWORD=$NEW_GRAFANA_ADMIN_PASS/" .env
sed -i "s/^NODERED_DB_PASSWORD=.*/NODERED_DB_PASSWORD=$NEW_NODERED_DB_PASS/" .env
sed -i "s/^ARCHIVER_DB_PASSWORD=.*/ARCHIVER_DB_PASSWORD=$NEW_ARCHIVER_DB_PASS/" .env
sed -i "s/^ALERT_WEBHOOK_TOKEN=.*/ALERT_WEBHOOK_TOKEN=$NEW_ALERT_WEBHOOK_TOKEN/" .env

# 4. 重建容器以加载新的环境变量
#    （pgbouncer 启动时会根据 .env 重新生成 userlist.txt）
docker compose up -d --force-recreate pgbouncer node-red grafana alertmanager alarm-api factory-twin-3d observability-archiver

# 5. GF_SECURITY_ADMIN_PASSWORD 只对全新的 Grafana 数据库生效；
#    对已有数据库，需显式重置管理员密码：
docker compose exec grafana grafana cli admin reset-admin-password "$NEW_GRAFANA_ADMIN_PASS"

# 6. 验证
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
curl -s -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" \
 -H "x-api-key: $NEW_API_KEY" \
 -d '{"machine_id":"TEST"}'
```

### 验证命令

```bash
# 确认 INGEST_API_KEY 已生效（不带密钥应返回 401）
curl -s -w "\nHTTP: %{http_code}" -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" -d '{"machine_id":"TEST"}'
# 预期：HTTP 401

# 确认 Grafana 需要登录
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboards
# 预期：401（而非 200）
```

---

## 添加新设备

### 步骤 1：在数据库中注册

`public.devices` 表将 `device_type` 严格区分为 `'server'`（SNMP 监控的基础设施，默认值）与 `'ldi'`（LDI 生产设备）。务必指定正确的类型；否则会默认为 `'server'`，设备将不会出现在任何 LDI 仪表板上：

```sql
-- 添加新的基础设施服务器（SNMP 轮询）
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, snmp_community, snmp_port, enabled)
VALUES ('NEW-MACHINE-01', '192.168.1.100', '192.168.1.100', 'server', 'public', 161, true);

-- 添加新的 LDI 设备（不经 SNMP——数据经 ldi_ingestion.json / 模拟器写入）
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled)
VALUES ('LDI-11', 'LDI-11', '', 'ldi', true);

-- 验证
SELECT device_id, hostname, device_type, snmp_community, enabled FROM public.devices WHERE device_id IN ('NEW-MACHINE-01', 'LDI-11');
```

### 步骤 2：验证 SNMP 连通性

```bash
# 从 Node-RED 容器测试 SNMP
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('192.168.1.100', 'public', {port: 161, timeout: 5000});
session.get(['1.3.6.1.2.1.1.1.0'], (err, varbinds) => {
 if (err) console.error('ERROR:', err.message);
 else console.log('OK:', varbinds[0].value.toString());
 session.close();
});
"
```

### 步骤 3：验证数据流

```bash
# 等待 30 秒，让轮询周期执行
sleep 30

# 验证数据已写入
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
 FROM public.sys_metrics s
 WHERE device_id = 'NEW-MACHINE-01'
 GROUP BY device_id;"
```

### 步骤 4：添加仪表板面板（可选）

如需为新设备建立专用仪表板：

1. 打开 Grafana → Dashboard → Edit
2. 添加新面板
3. 使用查询：`SELECT time, cpu_load_percent FROM public.sys_metrics WHERE device_id IN (\${machine_id:sqlstring}) ORDER BY time DESC`
4. 保存仪表板

---

## 告警管理

### 告警规则位置

- Prometheus（平台与流水线）：`monitoring/prometheus/rules/ims-alerts.yml`
- Grafana 管理（设备与 LDI 条件）：`monitoring/grafana/provisioning/alerting/rules.yml` 与 `ldi-rules.yml`，联络点与路由位于 `contactpoints.yml` / `policies.yml`。预置规则在 Grafana 界面中为只读；请修改文件后重启 Grafana。

### 编辑告警规则

Prometheus 规则覆盖平台自身（Prometheus/Alertmanager/抓取目标、blackbox 的 `ServiceDown`/延迟/SLA/TLS、`Watchdog`，以及 Node-RED 流水线指标 `ims_pipeline_*` 与 `ims_circuit_breaker_state`）。设备级条件（CPU、温度、LDI 参数）由 Grafana 基于 TimescaleDB 的 SQL 告警规则与仪表板评估，而非 Prometheus。

**示例：收紧现有规则**（`PipelineHighErrorRate` 目前为连续 5 分钟 `> 0.1` 次失败/秒）：

```yaml
      - alert: PipelineHighErrorRate
        expr: rate(ims_pipeline_inserts_failed_total[5m]) > 0.05   # was 0.1
        for: 5m
        labels:
          severity: warning
          service: node-red
        annotations:
          summary: "High INSERT failure rate on Node-RED pipeline"
          description: "{{ $value | humanize }} failures/sec over 5 minutes."
```

每条新规则都必须带有 `severity` 与 `service` 标签（Alertmanager 的路由与抑制依赖这两个标签），并在重载前通过 `promtool check rules`。

### 重载配置

```bash
# 1. 先检查语法（rules 目录以只读方式挂载在 /etc/prometheus/rules）
docker compose exec prometheus promtool check rules /etc/prometheus/rules/ims-alerts.yml

# 2. 重载（Prometheus 以 --web.enable-lifecycle 运行，端口绑定在 127.0.0.1）
curl -X POST http://localhost:9090/-/reload
```

> [!WARNING]
> 重载会立即重新评估所有规则。若已配置 LINE/Teams 凭据，正在触发的规则会发出真实通知。

### 抑制规则（Inhibition Rules）

`monitoring/alertmanager/alertmanager.yml` 定义了 3 条抑制规则：

| 源告警 | 被抑制的告警 | 必须匹配的标签 |
| --- | --- | --- |
| `ServiceDown` | `ServiceHighLatency`、`SLABreachWarning` | `instance` |
| 任意 `severity="critical"` | 任意 `severity="warning"` | `device_id` |
| `InterfaceDown` | `BandwidthSaturation` | `device_id` |

---

## 故障排除

### 常见问题与解决方法

| 问题 | 根因 | 解决方法 |
| --- | --- | --- |
| Grafana 显示 "No Data" | PgBouncer 连接耗尽或数据库宕机 | 执行 `docker restart ims-pgbouncer` 并检查磁盘空间 |
| 告警未发送到 LINE/Teams | `.env` 中凭据为空，或 webhook 令牌不匹配 | 检查 `LINE_CHANNEL_ACCESS_TOKEN` / `TEAMS_WEBHOOK_URL` / `ALERT_WEBHOOK_TOKEN`，再查看 Node-RED 中 `POST /alert-webhook` 节点的日志 |
| 带宽曲线飙升到 Tbps 级 | 32 位计数器回绕 | 解析器已处理；若仍出现，请确认设备支持 64 位（HC）计数器 |
| Node-RED 无法启动 | flow JSON 语法错误 | 查看日志：`docker compose logs --tail=50 node-red` |
| 连续聚合缺少数据 | 需要手动刷新 | 执行 `CALL refresh_continuous_aggregate('sys_hourly', NULL, NULL);` |
| 容器卡在 "Restarting" | 配置不匹配或端口冲突 | 查看该容器的日志 |

### SRE 验证流程

> [!CAUTION]
> `docker compose down -v` 会删除所有命名卷，包括 TimescaleDB 数据。仅可在可丢弃的环境中使用，切勿用于存有真实数据的栈。

```bash
# 1. 启动（或收敛）栈
docker compose up -d

# 2. 等待 40 秒
sleep 40

# 3. 检查容器（14 个常驻服务 + 应处于 Exited (0) 的 ims-db-migrate）
docker compose ps

# 4. 检查数据流
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id
WHERE s.time > NOW() - INTERVAL '5 minutes'
GROUP BY device_id;"

# 5. 检查连续聚合
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT bucket, avg_cpu, max_temp
FROM public.sys_hourly
ORDER BY bucket DESC LIMIT 4;"

# 6. 检查 Grafana
curl -sf http://localhost:3000/api/health

# 7. 检查 Prometheus 抓取目标
curl -sf http://localhost:9090/api/v1/targets | python3 -c "
import sys, json
data = json.load(sys.stdin)
ups = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'up')
total = len(data['data']['activeTargets'])
print(f'Prometheus: {ups}/{total} targets UP')
"
```

---

## 备份与恢复

### 数据库备份

请使用脚本化路径（`make backup` → `scripts/backup-db.sh`，`make restore FILE=<path>` → `scripts/restore-db.sh`）；[备份与恢复](../operations/BACKUP_RESTORE.md) 记录了经过测试的流程与注意事项。如需手动转储：

```bash
# 必须加 -T：否则 docker 会分配 TTY，导致重定向输出的转储文件损坏
docker compose exec -T timescaledb sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%Y%m%d).sql

# 恢复到现有数据库
docker compose exec -T timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backup_YYYYMMDD.sql

# 自动备份（cron，在仓库目录中执行）
0 2 * * * cd /path/to/IMS && bash scripts/backup-db.sh
```

`scripts/backup-db.sh` 将 gzip 压缩的转储写入 `./backups/`（已被 gitignore 忽略），并删除超过 30 天的转储。转储文件包含真实生产数据：切勿将其移动到受 git 跟踪的路径，并限制对备份目录的访问。

### Flow 备份

```bash
# nodered_data/flows/*.json 是由 git 维护的源文件
# （由 scripts/build-flows.js 构建为 nodered_data/flows.json -- 切勿手动编辑 flows.json）
# 备份 nodered_data/flows.json（运行时副本）
cp nodered_data/flows.json nodered_data/flows.json.bak

# 从备份恢复
cp nodered_data/flows.json.bak nodered_data/flows.json
docker compose restart node-red
```

### 配置备份

```bash
# 备份 docker-compose 文件
cp docker-compose.yaml docker-compose.yaml.bak
cp docker-compose.prod.yaml docker-compose.prod.yaml.bak
cp proxy/nginx.conf proxy/nginx.conf.bak

# 备份 Prometheus 配置
cp monitoring/prometheus/prometheus.yml monitoring/prometheus/prometheus.yml.bak
cp monitoring/prometheus/rules/ims-alerts.yml monitoring/prometheus/rules/ims-alerts.yml.bak

# 备份 Grafana 仪表板
cp -r monitoring/grafana/dashboards/ monitoring/grafana/dashboards.bak/
```

---

## 性能监控

### 系统指标

```bash
# 容器资源使用
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 数据库连接数
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT count(*) as active_connections
FROM pg_stat_activity
WHERE state = 'active';"

# 磁盘用量
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT pg_size_pretty(pg_database_size('ims')) as database_size;"

# 各表大小
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;"
```

### Prometheus 指标

```bash
# 抓取耗时
curl -s http://localhost:9090/api/v1/query?query=prometheus_scrape_duration_seconds

# 已接收样本数
curl -s http://localhost:9090/api/v1/query?query=prometheus_tsdb_head_samples_appended_total

# 告警数量
curl -s http://localhost:9090/api/v1/alerts | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Active alerts: {len(data[\"data\"][\"alerts\"])}')
"
```

### 日志分析

```bash
# Node-RED 错误
docker compose logs node-red 2>&1 | grep -i "error" | tail -20

# Prometheus 错误
docker compose logs prometheus 2>&1 | grep -i "error" | tail -20

# Alertmanager 错误
docker compose logs alertmanager 2>&1 | grep -i "error" | tail -20

# 数据库慢查询
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;"
```

---

<div align="center">

**IMS 管理员手册 — 版本 1.2（2026-09-26 对照 `main` 核实）**

_面向 IT 团队与 MIS-G_

</div>
