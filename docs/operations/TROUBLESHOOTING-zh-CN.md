# IMS 故障排除指南

> 供 SRE 在凌晨 3 点操作 IMS 监控堆栈的 Runbook。

## 快速健康检查

按顺序运行这些命令以评估系统状态：

```bash
# 1. 容器状态
docker compose ps

# 2. 确认 Node-RED 启动
docker logs ims-node-red 2>&1 | tail -5

# 3. 遥测数据流 (应显示每台机器的行)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest \
  FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id \
  WHERE s.time > NOW() - INTERVAL '5 minutes' GROUP BY device_id;"

# 4. Prometheus 目标 (所有状态应为 UP)
curl -s http://localhost:9090/api/v1/targets | python3 -c \
 "import sys,json; d=json.load(sys.stdin); \
  up=sum(1 for t in d['data']['activeTargets'] if t['health']=='up'); \
  print(f'{up}/{len(d[\"data\"][\"activeTargets\"])} targets UP')"
```

## 故障模式

| 症状 | 可能原因 | 诊断 | 解决方案 |
|---------|-------------|-----------|------------|
| **Node-RED 崩溃循环** | 数据库连接失败或缺少 npm 模块 | `docker logs ims-node-red --tail=50` | 检查 PgBouncer: `docker logs ims-pgbouncer --tail=20`。验证 `.env` 中是否有 `POSTGRES_PASSWORD`。如果缺少模块则重新构建: `docker compose build --no-cache node-red && docker compose up -d node-red` |
| **Node-RED "Started flows" 但无数据** | SNMP 目标不可达或 community string 错误 | `docker exec ims-node-red node -e "const s=require('net-snmp').createSession('ims-snmpsim','apex_mock',{port:161,version:2});s.get(['1.3.6.1.2.1.1.3.0'],(e,v)=>{console.log(e||v);s.close()})"` | 验证 snmpsim 正在运行: `docker logs ims-snmpsim --tail=5`。检查 community string 是否与配置文件匹配 (`ubuntu` 或 `windows`) |
| **Grafana 面板显示 "No Data"** | CAGG 尚未刷新或时间范围错误 | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT COUNT(*) FROM public.sys_hourly WHERE bucket > NOW() - INTERVAL '1 hour';"` | 重启后 CAGG 约需 3 分钟填充。等待并刷新。如果 count=0，检查 Node-RED 日志中的 INSERT 错误 |
| **Grafana "Panel plugin not found: clock"** | 插件未安装或数据卷过时 | `docker compose exec grafana grafana-cli plugins ls` | 清理 Grafana 数据卷: `docker compose rm -fs grafana && docker volume rm ims_grafana_data && docker compose up -d grafana` |
| **TimescaleDB CPU 占用高** | CAGG 刷新风暴或查询未优化 | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;"` | 检查 Grafana 仪表板刷新率。容量仪表板应为 5m，而不是 10s。终止长查询: `SELECT pg_terminate_backend(pid);` |
| **PgBouncer "server login has been failing"** | 密码更改后认证缓存过期 | `docker logs ims-pgbouncer --tail=20 \| grep -i "login\|error"` | 重启 PgBouncer: `docker compose restart pgbouncer`。验证 `DATABASE_URL` 环境变量是否与 TimescaleDB 凭据匹配 |
| **重试队列增加** (`/data/retry_queue.json`) | 数据库反复 INSERT 失败 | `docker exec ims-node-red cat /data/retry_queue.json \| python3 -c "import sys,json; q=json.load(sys.stdin); print(f'Queue: {len(q)} entries, latest error: {q[-1][\"error\"] if q else \"none\"}')"` | 检查 PgBouncer 连接。每项最多重试 5 次，最多 500 项。队列每 30 秒自动排空 |
| **Alertmanager blackbox 提示 "TargetDown"** | prometheus.yml 中 Docker DNS 名称错误 | `curl -s http://localhost:9090/api/v1/targets \| python3 -c "import sys,json; [print(t['labels'].get('job','?'), t['health']) for t in json.load(sys.stdin)['data']['activeTargets']]"` | Blackbox 目标 MUST 使用服务名 `blackbox-exporter:9115`，NOT 容器名 `ims-blackbox` 或 `blackbox:9115` |
| **Docker "port already in use"** | Windows NAT 端口冲突 | `netstat -ano \| findstr :1880` | 运行: `net stop winnat && net start winnat` 以重置 Windows NAT |
| **无法在 :3000 访问 Grafana** | `proxy` (nginx) 宕机 — 这是主机发布的唯一入口，Grafana 不再发布其自身端口 | `docker logs ims-proxy --tail=20` | 重启: `docker compose restart proxy`。如果 `proxy` 健康但 Grafana 宕机，检查 `docker logs ims-grafana` |
| **Alarm Console Ack/Resolve 失败 (403)** | `proxy` 到 Grafana `/api/user` 的 `auth_request` 失败，或会话过期 | `docker logs ims-proxy --tail=20`; 确认在同一浏览器中已登录 Grafana | 重新登录 Grafana。如果持续存在，检查 `proxy/nginx.conf` 的 `/auth-check` 位置是否正确代理到 `grafana:3000` |
| **Alarm Console Ack/Resolve 失败 (500)** | `alarm-api` 无法连接 Postgres，或缺少 `alarm_api_writer` 角色/权限 | `docker logs ims-alarm-api --tail=20` | 重启: `docker compose restart alarm-api`。验证是否应用了 `078-alarm-api-writer-role.sql` 迁移: `bash scripts/migrate.sh` |

## 常见操作

### 重启单个服务
```bash
docker compose restart node-red  # 重启数据管道
docker compose restart grafana   # 重新加载 dashboard JSON
docker compose restart prometheus # 重新加载 alert rules
docker compose restart proxy    # 重新加载 nginx 配置 (proxy/nginx.conf)
docker compose restart alarm-api  # 重启 alarm ack/resolve 写入路径服务
```

### 部署 flow 更改
```bash
make deploy-flows  # 合并拆分的 flow → POST 至 Admin API
```

### 检查数据库状态
```bash
# 每台机器的行数 (最近 5 分钟)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) FROM public.sys_metrics \
  WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY device_id;"

# CAGG 刷新状态
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT MAX(bucket) as latest FROM public.sys_hourly;"
```

### 备份和恢复
```bash
make backup          # 备份至 backups/backup_YYYYMMDD.sql
make restore FILE=backups/backup_20260701.sql
```

### 全新重启 (销毁所有数据)
```bash
docker compose down -v && docker compose up -d
# 等待 40 秒启动，然后:
make deploy-flows
```

## 环境变量

| 变量 | 必填 | 默认值 | 用途 |
|----------|----------|---------|---------|
| `POSTGRES_DB` | 是 | `ims` | 数据库名称 |
| `POSTGRES_USER` | 是 | `ims_admin` | 数据库用户 |
| `POSTGRES_PASSWORD` | 是 | — | 数据库密码 |
| `GRAFANA_ADMIN_USER` | 是 | `admin` | Grafana 管理员用户名 |
| `GRAFANA_ADMIN_PASSWORD` | 是 | — | Grafana 管理员密码 |
| `NODE_RED_CREDENTIAL_SECRET` | 是 | — | 加密存储的 flow 凭据 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 否 | — | LINE Messaging API 令牌 |
| `LINE_USER_ID` | 否 | — | 用于告警的 LINE 用户 ID |
| `TEAMS_WEBHOOK_URL` | 否 | — | MS Teams 传入 webhook URL |

## 升级路径

1. 检查 `docker compose ps` — 是否有未运行的容器？
2. 检查故障容器的日志 — `docker logs <container> --tail=50`
3. 检查数据库连通性 — `docker compose exec timescaledb pg_isready`
4. 检查网络 — `docker compose exec node-red ping pgbouncer`
5. 如果以上都失败: `docker compose down -v && docker compose up -d && make deploy-flows`

## 事件响应

此文件仅包含 SRE 调试命令。有关严重程度分类、升级和循序渐进的事件操作手册，请参阅 `docs/operations/INCIDENT_RESPONSE.md` — 权威 Runbook，其中包含来自该系统实际操作历史的真实案例。 (此文件的早期版本曾使用了截然不同且冲突的严重性评级重复了该内容；已于 2026-08-13 删除，以消除两份文档之间的不一致。)
