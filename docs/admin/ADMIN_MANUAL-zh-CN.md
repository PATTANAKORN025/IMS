# <img src="docs/assets/icons/wrench.svg" width="18" height="18" align="center" /> System Administration & SRE Guide

> **IMS系统IT运维手册 (MIS-G)**
> 涵盖Docker管理、设备注册、告警管理、故障排除

---

<div align="center">

![Admin](https://img.shields.io/badge/Admin-SRE%20Guide-green)
![Version](https://img.shields.io/badge/Version-1.1-blue)
![Audience](https://img.shields.io/badge/Audience-IT%20Team-purple)

</div>

---

## Table of Contents

1. [System Management](#system-management)
2. [Adding New Devices](#adding-new-devices)
3. [Alert Management](#alert-management)
4. [Troubleshooting](#troubleshooting)
5. [Backup & Recovery](#backup--recovery)
6. [Performance Monitoring](#-performance-monitoring)

---

## System Management

### Container Overview

系统基于Docker Compose，共14个服务 (13个常驻服务 + 1个一次性迁移任务):

| Container              | Service           | Port            | Purpose                                                               |
| ---------------------- | ----------------- | --------------- | --------------------------------------------------------------------- |
| `ims-timescaledb`      | TimescaleDB       | 5432 (loopback) | 时序数据库                                                            |
| `ims-pgbouncer`        | PgBouncer         | 5432 (internal) | 连接池                                                                |
| `ims-db-migrate`       | Migration runner  | — (one-shot)    | 执行 `database/migrations/*.sql`，阻塞 `node-red` 和 `alarm-api` 启动 |
| `ims-node-red`         | Node-RED          | 1880 (loopback) | 数据管道                                                              |
| `ims-proxy`            | nginx proxy       | **3000**        | Grafana和`alarm-api`的唯一入口。拦截`/alarm-api/`通过`auth_request`   |
| `ims-grafana`          | Grafana           | internal        | 仪表盘 — 仅通过 `ims-proxy` 访问                                      |
| `ims-alarm-api`        | alarm-api         | internal        | 写入 `public.ldi_alarm_lifecycle`。仅通过 `ims-proxy` 访问            |
| `ims-grafana-renderer` | Grafana Renderer  | 8081 (internal) | 渲染PNG告警                                                           |
| `ims-prometheus`       | Prometheus        | 9090 (loopback) | 监控与告警                                                            |
| `ims-alertmanager`     | Alertmanager      | 9093 (loopback) | 告警路由                                                              |
| `ims-blackbox`         | Blackbox Exporter | 9115 (loopback) | SLA拨测                                                               |
| `ims-snmpsim`          | SNMP Simulator    | 161/udp         | 开发测试                                                              |

> `ims-db-migrate` 成功退出状态为0。`docker compose ps` 显示 `Exited (0)` 是正常的。在此完成前 `node-red` 和 `alarm-api` 不会启动。

### Common Operations

```bash
# 检查状态
docker compose ps

# 启动系统
docker compose up -d

# 停止系统
docker compose down

# 清理并重启 (清除数据，重新启动)
docker compose down -v && docker compose up -d

# 重启指定服务
docker compose restart node-red
docker compose restart pgbouncer
docker compose restart grafana
docker compose restart proxy
docker compose restart alarm-api
docker compose restart prometheus alertmanager

# 查看实时日志 (最后50行)
docker compose logs -f --tail 50 node-red
docker compose logs -f --tail 50 pgbouncer

# 检查资源使用
docker stats --no-stream
```

> [!NOTE]
>
> > 执行 `docker compose down -v` 后，需等待40秒以确保所有服务启动完毕再进行检查。

### Service Health Checks

```bash
# Database
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

### Database Migrations

`database/migrations/` 包含54个有序文件 (`013` 到 `079`)。由 `ims-db-migrate` 自动应用。

```bash
# 手动运行迁移
bash scripts/migrate.sh

# 检查当前迁移状态
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT version, filename, applied_at FROM public.schema_migrations ORDER BY version DESC LIMIT 10;"
```

---

## Pre-Production Security Checklist

> **CRITICAL:** 部署到生产环境前，必须修改所有默认凭证。

| Credential               | Default Value      | Location                       | Action Required                          |
| ------------------------ | ------------------ | ------------------------------ | ---------------------------------------- |
| `INGEST_API_KEY`         | `ims-secret-key`   | `.env` + `docker-compose.yaml` | **CHANGE** — 防止伪造数据注入            |
| `POSTGRES_PASSWORD`      | `change-me-please` | `.env`                         | **CHANGE** — 数据库超级用户权限          |
| `GRAFana_ADMIN_PASSWORD` | `change-me-please` | `.env`                         | **CHANGE** — 仪表盘管理员权限            |
| `ALARM_API_DB_PASSWORD`  | `change-me-please` | `.env`                         | **CHANGE** — `alarm_api_writer` 角色凭证 |

### How to Rotate

```bash
# 1. 生成新密码
NEW_API_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
NEW_DB_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")
NEW_GRAFANA_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")
NEW_ALARM_API_DB_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")

# 2. 更新 .env
sed -i "s/^INGEST_API_KEY=.*/INGEST_API_KEY=$NEW_API_KEY/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_DB_PASS/" .env
sed -i "s/^GRAFANA_ADMIN_PASSWORD=.*/GRAFANA_ADMIN_PASSWORD=$NEW_GRAFANA_PASS/" .env
sed -i "s/^ALARM_API_DB_PASSWORD=.*/ALARM_API_DB_PASSWORD=$NEW_ALARM_API_DB_PASS/" .env

# 3. 更新数据库用户密码
docker compose exec -T timescaledb psql -U ims_admin -d ims \
 -c "ALTER ROLE grafana_reader WITH PASSWORD '$NEW_DB_PASS';"
docker compose exec -T timescaledb psql -U ims_admin -d ims \
 -c "ALTER ROLE alarm_api_writer WITH PASSWORD '$NEW_ALARM_API_DB_PASS';"

# 4. 重启服务
docker compose up -d

# 5. 验证
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
curl -s -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" \
 -H "x-api-key: $NEW_API_KEY" \
 -d '{"machine_id":"TEST"}'
```

### Verification Commands

```bash
# 验证 API Key
curl -s -w "\nHTTP: %{http_code}" -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" -d '{"machine_id":"TEST"}'
# 期望: HTTP 401

# 验证 Grafana 认证
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboards
# 期望: 401
```

---

## Adding New Devices

### Step 1: Register in Database

在 `public.devices` 中指定 `device_type` 为 `'server'` (默认) 或 `'ldi'`。

```sql
-- 添加新服务器 (SNMP采集)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, snmp_community, snmp_port, enabled)
VALUES ('NEW-MACHINE-01', '192.168.1.100', '192.168.1.100', 'server', 'public', 161, true);

-- 添加新 LDI 设备
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled)
VALUES ('LDI-11', 'LDI-11', '', 'ldi', true);

-- 验证
SELECT device_id, hostname, device_type, snmp_community, enabled FROM public.devices WHERE device_id IN ('NEW-MACHINE-01', 'LDI-11');
```

### Step 2: Verify SNMP Connectivity

```bash
# 测试 SNMP 连通性
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

### Step 3: Verify Data Flow

```bash
# 等待 30 秒采集周期
sleep 30

# 验证数据写入
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
 FROM public.sys_metrics s
 WHERE device_id = 'NEW-MACHINE-01'
 GROUP BY device_id;"
```

### Step 4: Add Dashboard Panel (Optional)

1. Grafana → Dashboard → Edit
2. 添加新 panel
3. Query: `SELECT time, cpu_load_percent FROM public.sys_metrics WHERE device_id IN (\${machine_id:sqlstring}) ORDER BY time DESC`
4. 保存仪表盘

---

## Alert Management

### Alert Rules Location

文件: `monitoring/prometheus/rules/ims-alerts.yml`

### Editing Alert Rules

```yaml
- alert: HighCpuLoad
 # 阈值 80% 改为 85%
 expr: avg_over_time(cpu_load_percent[5m]) > 85
 for: 5m
 labels:
 severity: warning
 annotations:
 summary: "High CPU load on {{ $labels.machine_id }}"
 description: "CPU load {{ $value }}% exceeds threshold 85%"

- alert: LDI_Vibration_Critical
 expr: ldi_vibration > 10.0
 for: 5m
 labels:
 severity: critical
 annotations:
 summary: "LDI vibration critical on {{ $labels.machine_id }}"
 description: "Vibration {{ $value }} mm/s exceeds threshold 10.0"
```

### Reload Configuration

```bash
# 重新加载规则
curl -X POST http://localhost:9090/-/reload

# 检查语法
docker compose exec prometheus promtool check rules /etc/prometheus/rules/ims-alerts.yml
```

### Inhibition Rules

系统包含自动抑制规则:

| Source Alert               | Suppressed Alerts | Scope                    |
| -------------------------- | ----------------- | ------------------------ |
| `InterfaceDown` (critical) | 所有 Warning      | Same machine             |
| `ServiceDown` (critical)   | 所有 Warning      | Same machine             |
| `NodeREDDown`              | `TelemetryGap`    | Global                   |
| `Critical`                 | `Warning`, `Info` | Same alertname + machine |

---

## Troubleshooting

### Common Issues & Solutions

| Issue                 | Cause                        | Fix                                                            |
| --------------------- | ---------------------------- | -------------------------------------------------------------- |
| Grafana "No Data"     | PgBouncer 连接满, 数据库故障 | `docker restart ims-pgbouncer`, 检查磁盘                       |
| 告警未发送至聊天软件  | Webhook 配置丢失             | 检查 Node-RED 日志 (`POST/alert-webhook`)                      |
| 吞吐量飙升 Tbps       | 32位计数器溢出               | 检查设备是否支持 64-bit HC                                     |
| Node-RED 无法启动     | Flow JSON 语法错误           | `docker compose logs --tail=50 node-red`                       |
| 连续聚合表无数据      | 需要手动刷新                 | `CALL refresh_continuous_aggregate('sys_hourly', NULL, NULL);` |
| 容器持续 "Restarting" | 配置错误, 端口冲突           | 查看对应容器日志                                               |

### SRE Verification Protocol

```bash
# 1. 清理并重启
docker compose down -v && docker compose up -d

# 2. 等待 40 秒
sleep 40

# 3. 检查容器状态
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

# 7. 检查 Prometheus 目标
curl -sf http://localhost:9090/api/v1/targets | python3 -c "
import sys, json
data = json.load(sys.stdin)
ups = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'up')
total = len(data['data']['activeTargets'])
print(f'Prometheus: {ups}/{total} targets UP')
"
```

---

## Backup & Recovery

### Database Backup

```bash
# 备份
docker compose exec timescaledb pg_dump -U ims_admin ims > backup_$(date +%Y%m%d).sql

# 恢复
cat backup_20260627.sql | docker compose exec -T timescaledb psql -U ims_admin -d ims

# 定时备份 (cron)
0 2 * * * docker compose exec timescaledb pg_dump -U ims_admin ims > /backup/ims_$(date +\%Y\%m\%d).sql
```

### Flow Backup

```bash
# 备份
cp nodered_data/flows.json nodered_data/flows.json.bak

# 恢复
cp nodered_data/flows.json.bak nodered_data/flows.json
docker compose restart node-red
```

### Configuration Backup

```bash
cp docker-compose.yaml docker-compose.yaml.bak
cp docker-compose.prod.yaml docker-compose.prod.yaml.bak
cp proxy/nginx.conf proxy/nginx.conf.bak
cp monitoring/prometheus/prometheus.yml monitoring/prometheus/prometheus.yml.bak
cp monitoring/prometheus/rules/ims-alerts.yml monitoring/prometheus/rules/ims-alerts.yml.bak
cp -r monitoring/grafana/dashboards/ monitoring/grafana/dashboards.bak/
```

---

## <img src="docs/assets/icons/activity.svg" width="18" height="18" align="center" /> Performance Monitoring

### System Metrics

```bash
# 资源使用
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 数据库连接
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active';"

# 数据库大小
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT pg_size_pretty(pg_database_size('ims')) as database_size;"

# 表大小
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;"
```

### Prometheus Metrics

```bash
# 抓取持续时间
curl -s http://localhost:9090/api/v1/query?query=prometheus_scrape_duration_seconds

# 采集样本数
curl -s http://localhost:9090/api/v1/query?query=prometheus_tsdb_head_samples_appended_total

# 告警数量
curl -s http://localhost:9090/api/v1/alerts | python3 -c "import json, sys; data = json.load(sys.stdin); print(f'Active alerts: {len(data[\"data\"][\"alerts\"])}')"
```

### Log Analysis

```bash
# 错误日志
docker compose logs node-red 2>&1 | grep -i "error" | tail -20
docker compose logs prometheus 2>&1 | grep -i "error" | tail -20
docker compose logs alertmanager 2>&1 | grep -i "error" | tail -20

# 慢查询
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT query, calls, mean_time, total_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

---

<div align="center">

**IMS Admin Manual — Version 1.1**

_For IT Team & MIS-G_

</div>
