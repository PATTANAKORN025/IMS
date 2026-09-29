<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS — 用户手册

> **面向 IT 支持与 NOC 团队的用户指南**
> 说明如何解读仪表板、分析指标以及执行告警响应。

---

<div align="center">

<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **手册：** 用户指南
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **版本：** 1.2
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **读者：** IT 支持

</div>

---

## 目录

1. [快速上手](#快速上手)
2. [Grafana 仪表板指南](#grafana-仪表板指南)
3. [解读指标](#解读指标)
4. [告警响应流程](#告警响应流程)
5. [常用操作](#常用操作)
6. [故障排除](#故障排除)
7. [快速参考](#快速参考)

---

## 快速上手

### 访问系统

用户通过 IMS 主机 3000 端口上的 nginx 统一入口访问所有内容。下表中的其他端口均绑定在 `127.0.0.1`，仅供在主机上操作的管理员使用。

| 服务 | URL | 登录方式 |
| --- | --- | --- |
| **Grafana 仪表板** | `http://<ims-host>:3000/` | 您的 Grafana 账号（向管理员申请）。已禁用自助注册与匿名访问。 |
| **Factory Twin 3D** | `http://<ims-host>:3000/factory-twin-3d/` | 与 Grafana 共用会话 |
| **Node-RED 编辑器** | `http://127.0.0.1:1880`（仅限主机本地） | Node-RED 管理员账号 |
| **Prometheus** | `http://127.0.0.1:9090`（仅限主机本地） | — |
| **Alertmanager** | `http://127.0.0.1:9093`（仅限主机本地） | — |

### 仪表板概览

Grafana 在四个文件夹中预置了 22 个仪表板：

```text
 IMS Dashboards
├── 01 · Drilling Operations（CNC 钻孔机群）
│ ├── Fleet Digital Twin & Overview — 每台钻孔机的实时状态：运行、停机、换刀、告警、离线
│ ├── Shift Production & OEE — 近 7 天白班与夜班孔数、每台机器的在线与停机时间
│ ├── Machine Investigation — 单台机器的实时状态、事件分布、事件时间线与刀具告警
│ └── Fleet Anomaly & Root Cause — 告警类别、高发机台、断刀与主轴过载趋势
├── 02 · Lithography Operations — LDI（PCB 激光直接成像设备群）
│ ├── Easy Overview        — 零配置的全设备群一览，无需设置筛选
│ ├── LDI Manufacturing    — 指挥中心：管理层 KPI + 设备遥测 + 告警流
│ ├── LDI Operator Andon   — 产线 kiosk 看板，只读，1920×1080 及以上无需滚动
│ ├── LDI Alarm Console    — 交互式确认/解决流程，与只读的 Andon 看板配套
│ ├── LDI Alarm Response   — 基于真实告警生命周期的 MTTA/MTTR
│ ├── LDI Alarm Dictionary — 参考查询：设备厂商告警定义 + 最近发生记录
│ ├── LDI Engineering Analytics — Cpk/SPC 排名、RCA Truth Test、PE/JE 分布
│ ├── LDI Machine Snapshot — 点击任意告警/日志，查看该毫秒的设备状态
│ ├── LDI Factory Digital Twin — 按区域展示上报数据的 LDI 设备的 Canvas 平面图
│ └── LDI Data Readiness   — 自检式数据质量仪表板（覆盖率 %、缺口）
├── 03 · Platform Infrastructure & NOC（服务器/网络）
│ ├── NOC Overview        — 服务器设备群总览（仅基础设施；LDI 见下方）
│ ├── Engineering Drill-Down — 单台服务器深入分析：CPU/内存/磁盘/温度/网络，以及 LDI 质量散点图
│ ├── AIOps & Capacity    — 距离耗尽天数预测与 Z-Score 异常检测
│ ├── Meta-Monitoring     — 流水线自身健康（行/秒、批次成功率、重试队列、熔断器）
│ └── Ingestion Latency   — 从源头到数据库的真实延迟，只读
└── 04 · Plating Operations（VCP 电镀线）
 ├── Fleet Overview & Process Analytics — 各状态时长、槽温与电流偏差、各批次配方符合度
 ├── Operations Console — 产线实时状态、各工位电流与电压、槽温、告警日志
 └── Real-Time Wall — 为电镀车间全屏显示每条产线的实时状态
```

钻孔与 VCP 仪表板读取 `eap_backup` 数据库；没有工厂数据时为空，参见[钻孔与 VCP 合成数据](../data/MOCK_DATA.md)。有关数控钻孔机群的完整操作规程、遥测解码规则、OCAP 响应矩阵及 4 大仪表板操作指南，请参阅专用的 [数控钻孔运营与工程操作手册 (Drilling Operations Manual)](DRILLING_USER_MANUAL.md)。

含面板数量的完整自动生成列表见 [Dashboard Inventory](../architecture/DASHBOARD_INVENTORY.md)。

---

## Grafana 仪表板指南

### 1. NOC Overview 仪表板

**用途**：面向管理层与 NOC 团队的高层概览。

![IMS NOC Overview Dashboard](../../../assets/noc-overview.png)

### 2. 服务器健康指标（NOC Overview / Engineering Drill-Down）

**用途**：所有服务器的健康概览。这些面板分布在 **NOC Overview**（设备群总览）与 **Engineering Drill-Down**（单台服务器）两个仪表板中，并非独立仪表板。

| 面板 | 指标 | 面板颜色区间 |
| --- | --- | --- |
| **CPU Load** | `cpu_load_percent` | 绿 < 80 %，琥珀 80–90 %，红 ≥ 90 % |
| **RAM Usage / Saturation** | `ram_used_mb / ram_total_mb` | 绿 < 85 %，琥珀 85–95 %，红 ≥ 95 % |
| **Storage Saturation** | `disk_used_gb / disk_total_gb` | 绿 < 80 %，琥珀 80–90 %，红 ≥ 90 % |
| **Network Bandwidth** | 各接口 `rx_mbps`、`tx_mbps` | 趋势线，无颜色区间 |
| **Temperature** | `temp_c` | 绿 20–24 °C，超出该范围 1 °C 以内为琥珀，低于 19 °C 或达到 25 °C 及以上为红 |

### 3. Engineering Drill-Down 仪表板

**用途**：供工程师对单台服务器进行深入分析。

![Engineering Drilldown Dashboard](../../../assets/engineering-drilldown.png)

**LDI Quality Scatter——公差区：**

散点图按分钟绘制 PE 与 JE（µm），并标出 ±10 µm 公差带：

| 区域 | 颜色 | 含义 |
| --- | --- | --- |
| ±10 µm 以内 | 绿色区带 | 正常——激光头在公差范围内 |
| ±10 µm 以外 | 区带之外 | 质量风险——检查激光头 |

**使用说明：**

- 落在绿色区带内的点表示 PCB 质量处于可接受公差内。
- 落在区带外的点需要检查激光头。
- 对照 **LDI Scan Speed & Position Error** 面板，确认扫描速度或位置误差是否在同一时段发生变化。

### 4. AIOps & Capacity 仪表板

**用途**：资源容量预测，支撑基础设施规划。

| 面板 | 显示内容 | 用途 |
| --- | --- | --- |
| **Days Until Full (Resource Battery)** | 按当前趋势，磁盘、内存与 CPU 的剩余天数 | 确定升级优先级 |
| **Disk Usage Trend + Linear Regression Forecast** | 预测磁盘写满日期 | 规划存储扩容 |
| **CPU / RAM Load Trend（30 天平均）** | 长期消耗趋势 | 规划服务器与内存升级 |
| **CPU / Temperature Z-Score Anomaly (3σ)** | 超出三个标准差的偏离 | 及早发现异常行为 |

### 5. Easy Overview 仪表板

**用途**：零配置快速查看整个 LDI 设备群——没有模板变量、没有筛选器，打开即可看到全部内容。

该仪表板的每个指标都来自其他仪表板共用的视图与函数（`v_ldi_machine_latest_full`、`v_ldi_alarm_context`、`f_ldi_yield_pct`、`v_machine_spc_fleet`），因此数字与系统其他部分一致，不存在临时的独立查询。

### 6. LDI Manufacturing Command Center

**用途**：LDI 产线的主运营仪表板，按 4 层 RCA 视图组织。

| 层级 | 内容 |
| --- | --- |
| **Executive HUD** | 良率 %、运行设备数、设备群状态、平均 Cpk、Fleet Availability、Critical Alarms |
| **Machine Telemetry** | 温湿度达标情况、Scan Speed/Air Vacuum、Thickness/Resist Dosage、Scale X/Y |
| **Production Context** | 实时生产表（Machine/Job/Part/Layer/Progress）、板件追溯、单板计算耗时 |
| **Alarm Stream** | 最近告警事件（最近 50 条）、关联度最高的告警（24 小时，RCA） |

下钻行（Production & Compliance、Process Metrics、Analytics & SPC、System Alarms、RCA Fleet Summary、Cycle Time & Traceability）默认折叠——点击行标题即可展开。首屏只显示管理层 KPI 条。

### 7. LDI Operator Andon Board

**用途**：遵循 ISA-101 风格的产线 kiosk 看板，无需触控，只读。支持的显示分辨率为 **1920×1080 及以上**，此时看板无需滚动即可完整显示；不支持 1280×720（布局会溢出）。

显示 Fleet Availability、Active Critical/Major Alarms、Environmental Compliance、Machines Running、各设备状态卡片、流水线心跳、温度（22 ± 2 °C）与湿度（55 ± 5 %）达标时间线，以及最近 5 分钟 Critical/Major 告警的 **Action Queue**。确认与解决操作在 **LDI Alarm Console** 上完成，而不是在 Andon 看板上。

### 8. LDI Engineering Analytics & SPC

**用途**：面向工程师的深入分析——Cpk/SPC 排名、RCA Truth Test 与 PE/JE 分布。

| 部分 | 内容 |
| --- | --- |
| **Environmental** | 温度与湿度对比，所有设备同步显示 |
| **SPC Control Charts** | Thickness 控制图（均值 ± 3σ）、Scale X/Y 控制图 |
| **Variation Analysis** | 各设备 PE/JE 标准差、PE/JE 误差分布（箱线图） |
| **RCA / Alarm Correlation** | RCA Truth Test——按告警类别（Thermal/Humidity/Vacuum 等）统计的 Lift/Confidence |

### 9. LDI Machine Snapshot

**用途**：毫秒级设备状态，可从 Process Timeline 或其他仪表板上的告警与日志表点击进入。

显示作业上下文、物理变量、PE 对位、Cpk，以及与所选事件时间相近的告警——专为精确定位事件调查而设计，而非用于总览。

### 10. LDI Data Readiness

**用途**：自检式数据质量仪表板，只读取 PostgreSQL 中的真实数据行，不含任何模拟输入。

用于检测板件键重复、检查覆盖率 %，并在信任主仪表板上的数字之前，确认与告警主数据的匹配率。

### 11. Alarm Console、Alarm Response 与 Alarm Dictionary

- **Alarm Console**——唯一可交互的仪表板：确认与解决操作经 `alarm-api` 将真实状态写入 `public.ldi_alarm_lifecycle`。
- **Alarm Response (MTTA/MTTR)**——告警被确认与解决的速度，基于上述生命周期表计算。
- **Alarm Dictionary**——任意告警代码的厂商定义及其最近发生记录；从其他仪表板的 Alarm Code 链接打开。

---

## 解读指标

### CPU 指标

| 指标 | 单位 | 面板颜色 | 告警规则 |
| --- | --- | --- | --- |
| `cpu_load_percent` | % | 绿 < 80，琥珀 80–90，红 ≥ 90 | **High CPU Usage**——5 分钟平均值 > 85 %，持续 5 分钟（warning） |
| `cpu_cores` | 个 | — | — |

**使用说明：**

- **Average CPU**——所选时间范围内所有核心的平均值。
- **Peak CPU**——记录到的最大值（可能是瞬时尖峰）。
- **CPU per core**——显示负载集中在哪个核心。

**示例：**

```text
Machine: server-01
CPU Load: 86% (amber band, High CPU Usage alert pending)
├── Core 1: 95%
├── Core 2: 70%
├── Core 3: 88%
└── Core 4: 91%
→ Cores 1, 3 and 4 are under heavy load; investigate running processes.
```

### 内存指标

| 指标 | 单位 | 面板颜色 | 告警规则 |
| --- | --- | --- | --- |
| `ram_used_mb` | MB | — | — |
| `ram_total_mb` | MB | — | — |
| **Usage %** | % | 绿 < 85，琥珀 85–95，红 ≥ 95 | **High RAM Usage**——> 90 %，持续 5 分钟（warning） |

**使用说明：**

- **Usage %** = `(ram_used_mb / ram_total_mb) × 100`
- **Available** = `ram_total_mb - ram_used_mb`
- 内存使用率高本身并不代表有问题——Linux 会把空闲内存用作缓存。

### 网络指标

| 指标 | 单位 | 说明 |
| --- | --- | --- |
| `rx_mbps` | Mbps | 入站流量 |
| `tx_mbps` | Mbps | 出站流量 |
| `net_rx_errors` | 个 | 接收错误（硬件/驱动问题） |
| `net_rx_drops` | 个 | 丢弃的数据包（缓冲区溢出） |
| `net_if_status` | 1/2 | 1 = UP，2 = DOWN |

**使用说明：**

- **带宽利用率** = `(rx_mbps / link_speed) × 100`
- **错误率** = `net_rx_errors / total_packets × 100`
- **Interface DOWN** = 网线断开或交换机端口被禁用。相关告警规则：**Interface Down**（critical）、**High Network Error Rate**（warning）、**Network Packet Drops**（critical）、**Bandwidth Saturation Forecast**（warning）。

**示例：**

**设备：** `server-01`

| Interface | RX Mbps | TX Mbps | Errors | Drops | Status |
| --- | --- | --- | --- | --- | --- |
| eth0 | 1200 | 850 | 0 | 0 | UP |
| wlan0 | 320 | 180 | 0 | 12 | UP |

→ *wlan0 有 12 个丢包——检查无线信号。*

### 磁盘指标

| 指标 | 单位 | 面板颜色 | 告警规则 |
| --- | --- | --- | --- |
| `disk_used_gb` | GB | — | — |
| `disk_total_gb` | GB | — | — |
| **Usage %** | % | 绿 < 80，琥珀 80–90，红 ≥ 90 | **High Disk Usage**——> 90 %，持续 10 分钟（critical） |

**使用说明：**

- **Usage %** = `(disk_used_gb / disk_total_gb) × 100`
- **剩余空间** = `disk_total_gb - disk_used_gb`

### 温度指标

| 指标 | 单位 | 面板颜色 | 告警规则 |
| --- | --- | --- | --- |
| `temp_c` | °C | 绿 20–24，超出范围 1 °C 以内为琥珀，红 < 19 或 ≥ 25 | **High Temperature**——最大值 > 80 °C，持续 5 分钟（critical） |

**使用说明：**

- **平均温度**——读数的平均值。
- **最高温度**——记录到的峰值。
- **Z-Score 异常**——AIOps 行会标记偏离近期基线超过 3σ 的读数（**Temperature Z-Score Anomaly**，warning）。

---

## 告警响应流程

### 告警严重级别

告警规则分布在两处：Grafana 管理的设备与 LDI 条件规则（`monitoring/grafana/provisioning/alerting/`），以及针对平台自身的 Prometheus 规则（`monitoring/prometheus/rules/ims-alerts.yml`）。

| 级别 | 颜色 | 目标响应时间 | 示例 |
| --- | --- | --- | --- |
| **Critical** | 红 | 立即（< 15 分钟） | Interface Down、High Disk Usage、High Temperature、LDI Machine Offline (Stale)、`ServiceDown`、`PipelineDataStalled` |
| **Warning** | 琥珀 | 尽快（< 1 小时） | High CPU Usage、High RAM Usage、Z-Score 异常、`PipelineHighErrorRate`、`CircuitBreakerOpen` |

### 事件响应手册

下列命令框中的步骤保留英文，以便与告警名称及实际输入的命令保持一致。

#### 场景 1：Interface Down（Critical）

```text
Symptoms:
- Alert: Interface Down on server-01
- Network panels show "No Data"
- Other machines still reporting

Investigation Steps:
1. SSH to server-01 → check network cable
2. Check switch port status
3. Run: ip link show eth0
4. Check if interface is UP

Resolution:
- Reseat network cable
- Check switch configuration
- Restart network service: systemctl restart networking
- Verify: ping gateway

Escalation:
- If physical cable is fine → contact network team
- If switch port is down → contact data center team
```

#### 场景 2：High CPU Usage（Warning）

```text
Symptoms:
- Alert: High CPU Usage on server-01
- CPU panels showing > 85%
- System may be slow

Investigation Steps:
1. SSH to server-01
2. Run: top -bn1 | head -20
3. Identify top CPU-consuming processes
4. Check if scheduled job is running

Resolution:
- If legitimate workload → monitor, no action needed
- If rogue process → kill or renice
- If OOM → add swap or increase RAM

Escalation:
- If persistent > 1 hour → check with application team
- If affecting other services → consider scaling
```

#### 场景 3：High Disk Usage（Critical）

```text
Symptoms:
- Alert: High Disk Usage on server-01
- Disk panels showing > 90%

Investigation Steps:
1. SSH to server-01
2. Run: df -h
3. Run: du -sh /* | sort -rh | head -10
4. Identify large files/directories

Resolution:
- Clean logs: journalctl --vacuum-size=500M
- Remove old backups: find /backup -mtime +30 -delete
- Compress large files: gzip largefile.log
- Archive to cold storage

Escalation:
- If disk usage continues → plan storage expansion
- If critical (> 95%) → immediate cleanup required
```

#### 场景 4：ServiceDown（Critical）

```text
Symptoms:
- Alert: ServiceDown on server-01
- Blackbox probe failing
- Application may be unreachable

Investigation Steps:
1. Check service status: systemctl status <service>
2. Check service logs: journalctl -u <service> -n 50
3. Check port binding: ss -tlnp | grep <port>
4. Check firewall: iptables -L -n

Resolution:
- Restart service: systemctl restart <service>
- Check configuration: <service> -t (test config)
- Verify firewall rules
- Check dependent services

Escalation:
- If service won't start → check application logs
- If port conflict → identify conflicting process
- If system-level issue → contact system admin
```

#### 场景 5：PipelineDataStalled（Critical）

```text
Symptoms:
- Alert: PipelineDataStalled (named TelemetryGap in older documents)
- No successful database inserts for 3+ minutes
- Dashboards stop updating for every machine

Investigation Steps:
1. Check Node-RED logs: docker compose logs --tail=50 node-red
2. Check PgBouncer and TimescaleDB: docker compose ps pgbouncer timescaledb
3. Check the SNMP simulator (demo stacks): docker compose ps snmpsim
4. Check that the device is registered in public.devices

Resolution:
- If snmpsim down → docker compose restart snmpsim
- If Node-RED error → check flow JSON syntax
- If machine not in registry → add it to public.devices

Escalation:
- If persistent → check SNMP community string
- If new machine → verify MIB compatibility
```

---

## 常用操作

### 检查系统状态

```bash
# 查看所有容器
docker compose ps

# 查看 Node-RED 日志
docker compose logs --tail=20 node-red

# 查看 Prometheus 抓取目标
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"

# 查看活动告警
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts"
```

### 直接查询数据库

```bash
# 最近遥测（最近 5 分钟）
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, time, cpu_load_percent, temp_c
 FROM public.sys_metrics
 WHERE time > NOW() - INTERVAL '5 minutes'
 ORDER BY time DESC LIMIT 10;"

# 查看接口指标
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, iface_name, rx_mbps, tx_mbps
 FROM public.net_metrics
 ORDER BY time DESC LIMIT 1;"
```

### 重启服务

```bash
# 重启 Node-RED（修改 flow 之后）
docker compose restart node-red

# 不重启即可重载 Prometheus 规则（请先阅读管理员手册）
curl -X POST http://localhost:9090/-/reload

# 重启核心服务（不丢失数据）
make restart
```

---

## 故障排除

### 常见问题

| 现象 | 可能原因 | 解决方法 |
| --- | --- | --- |
| **所有面板显示 "No Data"** | Node-RED 或 PgBouncer 未运行 | `docker compose restart node-red pgbouncer` |
| **某台设备显示 "No Data"** | 设备未登记在注册表中 | 添加到 `public.devices`（见管理员手册） |
| **Alertmanager 反复重启** | 配置 YAML 语法错误 | 查看 `docker compose logs alertmanager` |
| **所有 blackbox 目标 DOWN** | 配置中的服务名错误 | 使用 `blackbox-exporter:9115` |
| **Grafana 显示旧数据** | 仪表板未刷新 | 强制刷新：Ctrl+Shift+R |
| **内存占用高** | Node-RED 内存持续增长 | 查看 `docker stats ims-node-red` |
| **数据库拒绝连接** | PgBouncer 宕机 | `docker compose restart pgbouncer` |

### 日志位置

| 服务 | 命令 | 关注内容 |
| --- | --- | --- |
| **Node-RED** | `docker compose logs node-red` | `Started flows`、`TypeError`、`ETIMEOUT` |
| **TimescaleDB** | `docker compose logs timescaledb` | `connection refused`、`authentication failed` |
| **Prometheus** | `docker compose logs prometheus` | `failed to check config`、`target down` |
| **Alertmanager** | `docker compose logs alertmanager` | `Loading configuration file failed` |
| **Grafana** | `docker compose logs grafana` | `Failed to look up user`、`dashboard not found` |
| **nginx 统一入口** | `docker compose logs proxy` | `502`、`upstream`、`auth_request` |

### 快速诊断脚本

```bash
# 一次运行全部健康检查
echo "=== Containers ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}"

echo "=== Data Flow ==="
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(time) as latest
 FROM public.sys_metrics
 WHERE time > NOW() - INTERVAL '5 minutes'
 GROUP BY device_id;"

echo "=== Alerts ==="
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts" 2>&1 | \
 python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"data\"][\"alerts\"])} active alerts')"
```

---

## 快速参考

### 键盘快捷键（Grafana）

在 Grafana 中按 `?` 可查看当前版本的完整列表。

| 快捷键 | 操作 |
| --- | --- |
| `?` | 显示所有键盘快捷键 |
| `Ctrl+K` / `Cmd+K` | 搜索与命令面板 |
| `Ctrl+S` | 保存仪表板（仅编辑者） |
| `d r` | 刷新所有面板 |
| `d k` | 切换 kiosk 模式 |
| `t z` | 缩小时间范围（zoom out） |
| `Esc` | 退出面板视图或关闭抽屉 |

### 颜色含义

| 状态 | 颜色 | Token |
| --- | --- | --- |
| 正常 | 绿 | `#22C55E` |
| 警告 | 琥珀 | `#F59E0B` |
| 严重 | 红 | `#EF4444` |

面板会在颜色旁显示数值，因此无需单靠颜色也能读出状态。

### 告警通道

| 对象 | 通道 | 投递方式 |
| --- | --- | --- |
| **NOC 团队** | LINE 群组 | LINE Messaging API（需配置 `LINE_CHANNEL_ACCESS_TOKEN` 与 `LINE_USER_ID`） |
| **系统管理员** | Microsoft Teams | Incoming webhook（需配置 `TEAMS_WEBHOOK_URL`） |
| **管理层** | 电子邮件 | 未配置 |

---

<div align="center">

**IMS 用户手册 — 版本 1.2（2026-09-26 对照 `main` 核实）**

_面向 IT 支持与 NOC 团队_

</div>
