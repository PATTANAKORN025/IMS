<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 事件响应 (Incident Response)

> **受众：** 站点可靠性工程师 (SRE) / 运维人员、值班工程师 (On-call Engineers)。
> **目标：** 提供严重性级别框架以及从系统故障中恢复的具体实战案例。
> **出处：** 以下所有案例均是本系统运行历史中真实发生的事件（已定位根本原因，且已标记修复状态）—— 并非假设性场景。

---

## 严重性级别框架 (Severity framework)

| 严重性    | 定义                                   | 示例                                           | 响应目标               |
| --------- | -------------------------------------- | ---------------------------------------------- | ---------------------- |
| **SEV-1** | 生产环境数据丢失或双重管道摄取完全停止 | `ldi_data` 和 `sys_metrics` 均无法接收写入请求 | 立即响应 — 全员参与    |
| **SEV-2** | 一个管道中断，或容器无法自动恢复       | LDI 数据摄取停滞，基础设施管道未受影响         | 轮班内解决             |
| **SEV-3** | 服务降级但仍在运行                     | 查询延迟升高，单台机器的遥测数据停滞不前       | 下一工作日             |
| **SEV-4** | 外观 / 非功能性问题                    | 仪表盘面板显示过期的颜色标记                   | 列入积压工作 (Backlog) |

## 初始响应，适用于任何严重级别

1. **检查 Meta-Monitoring 仪表盘** — 查看管道健康状况、摄取速率、错误率。
2. **运行 `docker ps`** — 每个容器是否都处于 `Up` 且 `healthy` 的状态？
3. **执行 `SELECT max(time) FROM public.ldi_data;`** （以及针对 `sys_metrics` 的对应查询）— 实际数据的滞后程度如何？
4. **检查 Alertmanager/Grafana 中正在触发的警报** — 查阅 `docs/architecture/ALARM_PLAYBOOK.md` 了解每个警报的具体含义。请记住 `Watchdog` 总是处于触发状态，并非真实故障。

---

## 实战案例 1：TimescaleDB 重启未能恢复数据摄取

**事件描述 (2026-08-10，于灾备演练期间发现)：** 在 TimescaleDB 容器被强制终止并重启后（无论是手动还是由编排工具执行），即便数据库自身已恢复健康状态，LDI 数据摄取仍可能停滞几分钟——使用 `docker exec ims-timescaledb psql ... SELECT max(time) FROM ldi_data` 查询发现时间戳一直冻结在中断发生的时刻。

**根本原因 (Root cause)：** PgBouncer 的 `server_login_retry` 失败缓存机制。后端发生故障后，PgBouncer 会缓存连接失败状态，并且在后端恢复正常后也不会立即重试。同时，Node-RED 自身的 `pg.Pool` 也可能卡死在失败状态且无法自愈（Node-RED 日志中若出现 `server login has been failing, cached error: connect failed` 即可确认此特征）。

**Watchdog 配置参数：** `ldi_ingestion.json` 中的 `ldi_auth_check` 负责记录连续连接失败次数 (`ldiDbConnFailureStreak`)。连续 5 次失败后，将调用 `process.exit(1)`。该机制依赖 Docker 的 `restart: unless-stopped` 策略重启 Node-RED 以分配新的连接池。**在灾难恢复演练中观察到，此级联故障的触发延迟约为 6 分钟** — 目前已计划优化计数器的触发阈值（详见 `ARCHITECTURE.md` 中的系统约束和技术边界部分）。

**手动恢复（立即生效）：**

```bash
docker restart ims-node-red
```

确认恢复状态：`SELECT max(time) FROM public.ldi_data;` 的时间戳应在几秒钟内推进。

## 实战案例 2：某台特定机器的遥测数据悄然停止

**事件描述：** 两台实体机器（其设备 ID 中包含空格字符，例如 `"LDI-A01"`）完全停止了数据汇报，且在常规警报监控中未显示任何错误。

**根本原因 (Root cause)：** Node-RED 的流上下文 (`flow.get()`/`global.get()`) 在解析字符串键时会将其视为属性表达式 —— 键中如果存在单独的空格将引发 `Invalid property expression` 异常。设备 ID 在两个位置（`ingestion.json` 中的内联解析器和 `circuit-breaker.js`）被直接用作上下文键，这会导致带有空格或其他标点符号的设备 ID 在每个轮询周期中被静默丢弃。

**修复措施（已应用）：** 如今在将设备 ID 存入 `flow`/`global` 存储前，两处调用点都会先将其清理为安全的上下文键（即 `nodered_data/lib/parser.js` 中的 `safeKey()`），同时保留真实的设备 ID 以用于显示和表连接。回归测试覆盖位置：`tests/unit/circuit-breaker.test.js`。

**需警惕的诊断特征：** Node-RED 日志中出现 `Invalid property expression`，或者在其他设备正常更新时，唯独某台设备的记录在 `ldi_data`/`sys_metrics` 中停滞不前。

## 实战案例 3：容器被终止后无法自动恢复

**事件描述 (灾备演练，2026-08-10)：** 执行 `docker kill ims-timescaledb` 并没有触发 Docker 的 `restart: unless-stopped` 策略 —— 尽管容器上已正确配置了该策略，但通过实时监控 `docker events` 连续确认两次发现（仅出现 `kill`/`die` 事件，而无自动的 `start` 事件）。

**状态：** 正在分析中 — 目前正在评估环境因素（可能特定于 Docker Desktop/WSL2；尚未在生产级 Linux 主机上验证）。

**手动恢复：**

```bash
docker start ims-timescaledb # 适用于容器存在但未运行的情况
# 或者，如果上述命令不起作用：
docker compose up -d timescaledb
```

随后请执行实战案例 1 中的步骤 —— TimescaleDB 重启将会级联引发相同的数据摄取停滞模式。

---

## 升级流程 (Escalation)

对于未涵盖在上述实战案例中的问题，或久久无法解决的 SEV-1/SEV-2 级别事件：

1. 检查 `docs/architecture/ARCHITECTURE.md` 的系统约束和技术边界 (System Constraints & Technical Boundaries) — 有关系统参数可能已经被记录在案。
2. 查阅 `docs/operations/TROUBLESHOOTING.md` 获取更广泛的 SRE 调试命令。
3. 如果这确实是个新问题，请按照上述三个案例的方式寻找根本原因：在安全的前提下进行复现（参考 `docs/operations/DR_TEST_PLAN.md` 中的可控、收集证据的演练模式），记录下您发现的情况 —— 并补充到 `ARCHITECTURE.md` 的系统约束和技术边界中。

## 相关文档

- `docs/architecture/ARCHITECTURE.md` — 系统约束和技术边界章节，系统的权威性约束列表。
- `docs/operations/ALARM_PLAYBOOK.md` — 每个警报代表的含义。
- `docs/operations/DR_TEST_PLAN.md` — 受控故障演练及其真实证据。
- `docs/operations/BACKUP_RESTORE.md` — 涉及数据丢失事件时的处理手册。
- `docs/operations/TROUBLESHOOTING.md` — 通用的 SRE 调试命令。

---

[⬅️ 返回 IMS 平台手册](../architecture/IMS_PLATFORM_BOOK.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码库](../../README.md)
