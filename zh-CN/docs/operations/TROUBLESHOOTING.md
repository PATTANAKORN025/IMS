<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS 故障排除指南

> **受众：** SRE/运维人员、值班工程师。
> **目标：** 用于操作和诊断 IMS 监控技术栈的 SRE 运行手册。
> **出处：** 于 2026-08-10 针对实际的 docker-compose 和监控技术栈进行了验证。

## 快速健康检查

按顺序运行以下命令以评估系统状态：

```bash
# 1. 容器状态 (Container status)
docker compose ps

# 2. Node-RED 启动确认 (Node-RED startup confirmation)
docker logs ims-node-red 2>&1 | tail -5

# 3. 遥测数据流 (Telemetry flow) (应显示每台机器的行数)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest \
 FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id \
 WHERE s.time > NOW() - INTERVAL '5 minutes' GROUP BY device_id;"

# 4. Prometheus 目标 (Prometheus targets) (所有的状态都应为 UP)
curl -s http://localhost:9090/api/v1/targets | python3 -c \
 "import sys,json; d=json.load(sys.stdin); \
 up=sum(1 for t in d['data']['activeTargets'] if t['health']=='up'); \
 print(f'{up}/{len(d[\"data\"][\"activeTargets\"])} targets UP')"
```

## 故障模式

| 症状 (Symptom) | 可能原因 (Likely Cause) | 诊断方法 (Diagnostic) | 解决方法 (Resolution) |
| --- | --- | --- | --- |
| **Node-RED 崩溃循环 (crash-looping)** | 数据库连接失败或缺少 npm 模块 | `docker logs ims-node-red --tail=50` | 检查 PgBouncer：`docker logs ims-pgbouncer --tail=20`。验证 `.env` 中是否有 `POSTGRES_PASSWORD`。如果缺少模块则重新构建：`docker compose build --no-cache node-red && docker compose up -d node-red` |
| **Node-RED 显示 "Started flows" 但无数据** | SNMP 目标不可达或社区字符串 (community string) 错误 | `docker exec ims-node-red node -e "const s=require('net-snmp').createSession('ims-snmpsim','apex_mock',{port:161,version:2});s.get(['1.3.6.1.2.1.1.3.0'],(e,v)=>{console.log(e\|\|v);s.close()})"` | 验证 snmpsim 是否正在运行：`docker logs ims-snmpsim --tail=5`。检查社区字符串是否与配置文件匹配（`ubuntu` 或 `windows`） |
| **Grafana 面板显示 "No Data"** | CAGG 尚未刷新或时间范围错误 | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT COUNT(*) FROM public.sys_hourly WHERE bucket > NOW() - INTERVAL '1 hour';"` | CAGG 在重启后需要约 3 分钟来填充数据。请等待并刷新。如果 count=0，请检查 Node-RED 日志以查找 INSERT 错误 |
| **Grafana 提示 "Panel plugin not found: clock"** | 未安装插件或数据卷已过期 | `docker compose exec grafana grafana-cli plugins ls` | 清理 Grafana 数据卷：`docker compose rm -fs grafana && docker volume rm ims_grafana_data && docker compose up -d grafana` |
| **TimescaleDB CPU 占用率高** | CAGG 刷新风暴或查询未优化 | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;"` | 检查 Grafana 仪表板刷新率。容量 (Capacity) 仪表板应为 5 分钟，而不是 10 秒。终止耗时较长的查询：`SELECT pg_terminate_backend(pid);` |
| **PgBouncer 提示 "server login has been failing"** | 密码更改后身份验证缓存过期 | `docker logs ims-pgbouncer --tail=20 \| grep -i "login\|error"` | 重启 PgBouncer：`docker compose restart pgbouncer`。验证 `DATABASE_URL` 环境变量是否与 TimescaleDB 凭据匹配 |
| **重试队列不断增长** (`/data/retry_queue.json`) | 数据库插入反复失败 | `docker exec ims-node-red cat /data/retry_queue.json \| python3 -c "import sys,json; q=json.load(sys.stdin); print(f'Queue: {len(q)} entries, latest error: {q[-1][\"error\"] if q else \"none\"}')"` | 检查 PgBouncer 连接。每个条目最多重试 5 次，最多 500 个条目。队列每 30 秒自动排空一次 |
| **Alertmanager 中 blackbox 状态为 "TargetDown"** | prometheus.yml 中 Docker DNS 名称错误 | `curl -s http://localhost:9090/api/v1/targets \| python3 -c "import sys,json; [print(t['labels'].get('job','?'), t['health']) for t in json.load(sys.stdin)['data']['activeTargets']]"` | Blackbox 目标必须使用服务名称 `blackbox-exporter:9115`，而不是容器名称 `ims-blackbox` 或 `blackbox:9115` |
| **Docker 提示 "port already in use"** | Windows NAT 端口冲突 | `netstat -ano \| findstr :1880` | 运行：`net stop winnat && net start winnat` 以重置 Windows NAT |
| **无法在 :3000 端口访问 Grafana** | `proxy` (nginx) 宕机 — 这是唯一的主机发布入口点，Grafana 不再发布其自身端口 | `docker logs ims-proxy --tail=20` | 重启：`docker compose restart proxy`。如果 `proxy` 健康但 Grafana 本身宕机，请检查 `docker logs ims-grafana` |
| **警报控制台确认/解决失败 (403)** | `proxy` 到 Grafana 的 `/api/user` 的 `auth_request` 失败，或会话已过期 | `docker logs ims-proxy --tail=20`；确认在同一浏览器中已登录 Grafana | 重新登录 Grafana。如果问题持续存在，请检查 `proxy/nginx.conf` 的 `/auth-check` location 是否正确代理到 `grafana:3000` |
| **警报控制台确认/解决失败 (500)** | `alarm-api` 无法连接到 Postgres，或缺少 `alarm_api_writer` 角色/授权 | `docker logs ims-alarm-api --tail=20` | 重启：`docker compose restart alarm-api`。验证是否已应用迁移 `078-alarm-api-writer-role.sql`：`bash scripts/migrate.sh` |

## 常见操作

### 重启单个服务

```bash
docker compose restart node-red # 重启数据管道
docker compose restart grafana  # 重新加载仪表板 JSON
docker compose restart prometheus # 重新加载警报规则
docker compose restart proxy  # 重新加载 nginx 配置 (proxy/nginx.conf)
docker compose restart alarm-api # 重启警报确认/解决的写入路径服务
```

### 部署流程变更

```bash
make deploy-flows # 合并拆分的流程 → POST 到 Admin API
```

### 检查数据库状态

```bash
# 每台机器的行数（过去 5 分钟）
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) FROM public.sys_metrics \
 WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY device_id;"

# CAGG 新鲜度
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT MAX(bucket) as latest FROM public.sys_hourly;"
```

### 备份与恢复

```bash
make backup     # 备份到 backups/backup_YYYYMMDD.sql
make restore FILE=backups/backup_20260701.sql
```

### 完全干净重启（会销毁所有数据）

```bash
docker compose down -v && docker compose up -d
# 等待 40 秒以完成启动，然后运行：
make deploy-flows
```

## 环境变量

| 变量 (Variable) | 必填 (Required) | 默认值 (Default) | 用途 (Purpose) |
| --- | --- | --- | --- |
| `POSTGRES_DB` | 是 | `ims` | 数据库名称 |
| `POSTGRES_USER` | 是 | `ims_admin` | 数据库用户 |
| `POSTGRES_PASSWORD` | 是 | — | 数据库密码 |
| `GRAFANA_ADMIN_USER` | 是 | `admin` | Grafana 管理员用户名 |
| `GRAFANA_ADMIN_PASSWORD` | 是 | — | Grafana 管理员密码 |
| `NODE_RED_CREDENTIAL_SECRET` | 是 | — | 加密存储的 flow 凭据 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 否 | — | LINE Messaging API 令牌 |
| `LINE_USER_ID` | 否 | — | 用于警报的 LINE 用户 ID |
| `TEAMS_WEBHOOK_URL` | 否 | — | MS Teams 传入 webhook URL |

## 升级路径

1. 检查 `docker compose ps` — 是否有未运行的容器？
2. 检查故障容器的日志 — `docker logs <container> --tail=50`
3. 检查数据库连通性 — `docker compose exec timescaledb pg_isready`
4. 检查网络 — `docker compose exec node-red ping pgbouncer`
5. 如果所有方法都失败：`docker compose down -v && docker compose up -d && make deploy-flows`

## 事件响应

此文件仅包含 SRE 调试命令。有关严重性分类、升级和分步事件处理手册，请参阅 `docs/operations/INCIDENT_RESPONSE.md` —— 这是权威的运行手册，其中包含该系统实际操作历史中的实例。（此文件的早期版本复制了该内容，但使用了不同且相互冲突的严重性等级；已于 2026-08-13 移除，以防止两个文档产生分歧。）

---

[⬅️ 返回 IMS 平台手册](../../../docs/architecture/IMS_PLATFORM_BOOK.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码库](../../../README.md)
