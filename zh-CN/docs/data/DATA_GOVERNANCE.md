<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 数据治理：分级、保留期限与访问控制</h1>
  <p><b>系统保存哪些数据、保存多久、谁能读写，以及仍未解决的缺口</b></p>
  <p>
    <a href="../../../docs/data/DATA_GOVERNANCE.md">English</a> |
    <a href="../../../th/docs/data/DATA_GOVERNANCE.md">ไทย</a> |
    <a href="DATA_GOVERNANCE.md">简体中文</a>
  </p>
</div>

---

> **范围：** `ims` 数据库和 `docker-compose.yaml` 中的服务。本页所有保留期限和角色均取自迁移文件与生产数据库目录 (`timescaledb_information.jobs`)，而不是目标值。
> **标准：** IEC 62443（工业安全）和 ISO/IEC 27001:2022 可作为本页所列控制措施的参考。IMS **未**获得其中任何一项认证，本页也不声称已合规。泰国 PDPA 适用于系统保存的少量个人标识（第 3 节）。

---

## 1. 数据分级

| 级别 | IMS 中的示例 | 存放位置 | 当前保护 |
| --- | --- | --- | --- |
| **公开** | 架构文档、schema 定义、仪表板 JSON | Git 仓库 | 公开仓库 |
| **内部** | 聚合数据（`*_hourly`、`ldi_data_1m/15m/1h`）、告警规则、容器指标 | TimescaleDB、Prometheus | 除 nginx 入口外，所有主机端口只绑定 `127.0.0.1`；静态数据未加密 |
| **机密** | 设备原始遥测（`ldi_data`、`ldi_metrics`）、`eap_backup` 中的工厂数据、一楼 CAD 数据 | TimescaleDB 数据卷；CAD 数据存放在 git 之外 | 需要登录 Grafana；静态数据未加密；泄露扫描器阻止 CAD 数据进入 git |
| **受限** | `.env` 中的凭据；`acknowledged_by` / `resolved_by` 中保存的 Grafana 登录名 | 主机上的 `.env`；`ldi_alarm_lifecycle` 表 | `.env` 已列入 `.gitignore` 并由 gitleaks 检查；登录名以明文保存 |

服务之间的流量都在 Docker 内部网络中。入口（`${GRAFANA_PORT:-3000}` 上的 nginx）提供的是**明文 HTTP**；在开放到可信工厂网络之外前，必须在其前面部署 TLS。

---

## 2. 保留与压缩（生产环境中生效的策略）

| 对象 | 类型 | 压缩时间 | 删除时间 |
| --- | --- | --- | --- |
| `ldi_data` | 超表 | 7 天 | 180 天 |
| `ldi_metrics`、`sys_metrics`、`net_metrics` | 超表 | 7 天 | 30 天 |
| `ldi_alarm_log` | 超表 | —（无法压缩：`ldi_alarm_lifecycle` 有指向它的外键，见迁移 083） | 365 天 |
| `ldi_data_1m` | 连续聚合 | — | 30 天 |
| `ldi_data_15m` | 连续聚合 | — | 90 天 |
| `ldi_data_1h`、`ldi_data_hourly` | 连续聚合 | — | 2 年 |
| `sys_hourly`、`net_hourly`、`ldi_hourly` | 连续聚合 | — | 不删除 |
| `ldi_alarm_lifecycle`、`container_restart_audit`、`devices` | 普通表 | — | 不删除 |

随时可以查看生产环境中生效的状态：

```bash
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT proc_name, hypertable_name, config
FROM timescaledb_information.jobs
WHERE proc_name IN ('\''policy_retention'\'','\''policy_compression'\'')
ORDER BY 1, 2;"'
```

修改策略必须在 `database/migrations/` 中新增一个带编号的迁移，不要在服务器上手动修改，否则下次全新安装时会丢失。

---

## 3. 个人数据

- **保存的内容：** 确认或解决告警的用户的 Grafana 登录名（`ldi_alarm_lifecycle.acknowledged_by`、`resolved_by`），由 `alarm-api` 从 Grafana 会话中获取，无保留期限。
- **不保存的内容：** 来自设备的操作员工牌号或姓名。没有任何采集流程读取这类字段，也没有假名化处理流程。
- **如果将来要采集工牌号**，请在写入前用带密钥的哈希处理，密钥取自 `.env`，代码中不得设置默认值，并为该表添加保留策略。

---

## 4. 数据库角色（最小权限）

| 角色 | 创建来源 | 权限 | 使用方 |
| --- | --- | --- | --- |
| `grafana_reader` | `postgres/init`、迁移 | `public` 上的 `SELECT`；`statement_timeout` 60 秒（迁移 083） | Grafana 数据源、`factory-twin-3d` |
| `alarm_api_writer` | 迁移 078 | 仅 `public.ldi_alarm_lifecycle` 上的 `SELECT, UPDATE` | `alarm-api` |
| `${POSTGRES_USER}`（`.env.example` 中为 `ims_admin`） | 容器初始化 | 超级用户 | 迁移、备份，**以及 Node-RED 数据采集** |

**未解决的缺口：** Node-RED 使用超级用户角色写入数据。为采集表建立一个仅能插入的专用角色，可以限制流程被攻破时的影响范围。尚未实施。

---

## 5. 审计与核查

```bash
# 哪些角色存在、能否登录
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\du"'

# 告警操作及执行人
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT logid, status, acknowledged_by, acknowledged_at, resolved_by, resolved_at
FROM public.ldi_alarm_lifecycle ORDER BY coalesce(resolved_at, acknowledged_at) DESC NULLS LAST LIMIT 20;"'

# observability-archiver 记录的容器重启
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT * FROM public.container_restart_audit ORDER BY 1 DESC LIMIT 20;"'
```

---

[⬅️ 返回 Telemetry Ontology](TELEMETRY_ONTOLOGY.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码仓库](../../README.md)
