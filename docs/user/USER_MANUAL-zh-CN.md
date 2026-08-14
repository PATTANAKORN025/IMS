# IMS — 用户手册

> **IT 支持与 NOC 团队用户指南**
> 解释如何阅读仪表盘、解读指标以及应对警报

---

<div align="center">

![Manual](https://img.shields.io/badge/Manual-User%20Guide-green)
![Version](https://img.shields.io/badge/Version-1.1-blue)
![Audience](https://img.shields.io/badge/Audience-IT%20Support-purple)

</div>

---

## 目录

1. [快速入门](#-快速入门)
2. [Grafana 仪表盘指南](#-grafana-仪表盘指南)
3. [指标解读](#-指标解读)
4. [警报响应程序](#-警报响应程序)
5. [常见操作](#-常见操作)
6. [故障排除](#-故障排除)
7. [快速参考](#-快速参考)

---

## 快速入门

### 访问系统

| 服务 | URL | 凭据 |
|---|---|---|
| **Grafana 仪表盘** | `http://localhost:3000` | admin / admin |
| **Node-RED 编辑器** | `http://localhost:1880` | (在设置中配置) |
| **Prometheus** | `http://localhost:9090` | — |
| **Alertmanager** | `http://localhost:9093` | — |

### 仪表盘概览

登录 Grafana 后，您将看到 12 个仪表盘：

```
 IMS Dashboards
├── Infrastructure (服务器/网络)
│  ├── NOC 概览      — 管理层设备包络 (仅限基础设施 -- LDI 在下面)
│  ├── 工程深入分析 — 单个服务器深入分析: CPU/内存/磁盘/温度/网络
│  ├── 容量规划    — 线性回归预测 (距离磁盘/内存占满的天数)
│  └── 元监控     — 数据管道自身的健康状况 (行/秒, 批处理成功, 重试队列)
└── LDI Manufacturing (PCB 激光直接成像设备)
  ├── 简易概览      — 零配置全设备一览，无需设置过滤器
  ├── LDI 制造    — 管理层 KPI + 机器遥测 + 警报流 (主指挥中心)
  ├── LDI 操作员安灯   — 工厂车间信息亭，1280x720，零滚动，只读 (无交互元素)
  ├── LDI 警报控制台    — 交互式确认/解决工作流，只读安灯板的配套组件
  ├── LDI 警报字典  — 参考查询：完整供应商警报定义 + 最近发生事件
  ├── LDI 工程分析 — Cpk/SPC 排名，RCA 真理测试，PE/JE 分布
  ├── LDI 机器快照  — 单击任何警报/日志以检查确切的毫秒
  └── LDI 数据就绪度   — 自我审计数据质量仪表盘 (覆盖率 %, 差距)
```

---

## Grafana 仪表盘指南

### 1. NOC 概览仪表盘

**目的**：为管理层和 NOC 团队提供概览

```
┌─────────────────────────────────────────────────────────────────┐
│  IMS NOC Overview                      │
├─────────────────────────────────────────────────────────────────┤
│                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│ │ Total    │ │ Healthy   │ │ Warning   │ │ Critical │ │
│ │ Machines: 5 │ │ Machines: 4 │ │ Alerts: 1  │ │ Alerts: 0 │ │
│ │  ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen)    │ │  ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen)    │ │  ![Warning](https://img.shields.io/badge/Status-Warning-yellow)    │ │     │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Fleet CPU Usage (Last 1 Hour)              │ │
│ │ [Line chart showing all machines CPU over time]     │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Active Alerts                      │ │
│ │ [Table of current firing alerts with severity]      │ │
│ └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2. 服务器健康指标 (NOC 概览 / 工程深入分析)

**目的**：所有服务器的健康概览 — 此类面板分布在 **NOC 概览** (设备包络) 和 **工程深入分析** (单台服务器深入分析) 上，而不是单独的仪表盘

| 面板 | 指标 | 颜色编码 |
|---|---|---|
| **CPU 使用率** | 每核心 `cpu_load_percent` | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 60%, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 60-80%, > 80% |
| **内存使用率** | `ram_used_mb / ram_total_mb` | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 70%, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 70-85%, > 85% |
| **磁盘使用率** | `disk_used_gb / disk_total_gb` | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 70%, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 70-80%, > 80% |
| **网络流量** | 每接口 `rx_mbps`, `tx_mbps` | 蓝色 = RX, 浅蓝色 = TX |
| **温度** | `temp_c` | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 65°C, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 65-80°C, > 80°C |

### 3. 工程深入分析仪表盘

**目的**：工程师对每台机器进行深入分析

```
┌─────────────────────────────────────────────────────────────────┐
│  Engineering Drilldown — [Select Machine ▼]         │
├─────────────────────────────────────────────────────────────────┤
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Network Interface Traffic (Symmetrical Butterfly)    │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │   ▲ eth0 RX: ████████████ 2.4 Gbps        │ │ │
│ │ │   │ wlan0 RX: ██████ 800 Mbps           │ │ │
│ │ │ ───┼────────────────────────────────── 0 Mbps   │ │ │
│ │ │   │ wlan0 TX: ████ 400 Mbps            │ │ │
│ │ │   ▼ eth0 TX: ████████ 1.6 Gbps          │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                 │
│ ┌──────────────────────┐ ┌──────────────────────────────────┐ │
│ │ CPU Temperature   │ │ Disk Usage           │ │
│ │ [Gauge: 72°C]    │ │ [Bar: /dev/sda1 45%, sdb1 62%] │ │
│ └──────────────────────┘ └──────────────────────────────────┘ │
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ LDI Quality Scatter (PE vs JE)              │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ PE (µm)                      │ │ │
│ │ │  15 ┤     ╱ Tolerance Box           │ │ │
│ │ │   │ · · ╱· · ·                │ │ │
│ │ │  0 ┤──╱────────────────── 0            │ │ │
│ │ │   │ ╱· · · ·                  │ │ │
│ │ │ -15 ┤╱     (green zone ±10µm)         │ │ │
│ │ │   └─┬────┬────┬────┬────┬─           │ │ │
│ │ │    -15  -5  0  5  15 JE (µm)       │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ LDI Manufacturing Telemetry               │ │
│ │ Throughput: 1250 units/hr | PE: 0.85 | JE: 0.92     │ │
│ │ Humidity: 65% | Power: 2400W | Vibration: 2.1 mm/s    │ │
│ └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**LDI 散点图容差框：**

散点图显示 PE (位置误差) vs JE (判断误差)，单位为 µm：

| 区域 | 颜色 | 含义 |
|---|---|---|
| ±10µm 内 | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) 绿色 | 正常 — 激光头工作正常 |
| ±10µm 外 | 红色 | 异常 — 激光头开始出现问题 |

**使用方法：**
- 绿色框内的点 = PCB 质量在标准内
- 跳出红色框的点 = 必须立即检查激光头
- 与 **LDI 吞吐量** 面板结合使用，以查看生产率是否仍然正常

### 4. 容量规划仪表盘

**目的**：用于资源规划的预测

| 面板 | 显示内容 | 用例 |
|---|---|---|
| **CPU 预测** | 线性回归斜率 → CPU 何时达到 100% | 规划服务器升级 |
| **磁盘预测** | 预测的磁盘满载日期 | 规划存储扩展 |
| **内存趋势** | 内存使用增长率 | 规划内存升级 |
| **网络容量** | 带宽利用率趋势 | 规划网络升级 |

### 5. 简易概览仪表盘

**目的**：无需任何设置即可即时查看整个 LDI 设备的概览 — 无模板变量，无过滤器，打开即可见。

此仪表盘上的每个数字均从与其他仪表盘相同的共享视图/函数中提取 (`v_ldi_machine_latest_full`, `v_ldi_alarm_context`, `f_ldi_yield_pct`, `v_machine_spc_fleet`) — 数字永远不会跨仪表盘冲突，因为没有单独计算的冗余查询。

### 6. LDI 制造指挥中心

**目的**：LDI 生产线的主要仪表盘 — 4层 RCA 设计

| 层级 | 内容 |
|---|---|
| **高管 HUD** | 良率 %，运行的机器，设备状态，平均 Cpk，设备可用性，严重警报 |
| **机器遥测** | 温湿度合规性，扫描速度/空气真空，厚度/光刻胶剂量，比例 X/Y |
| **生产上下文** | 实时生产表 (机器/作业/零件/层/进度)，板追溯性，每块板的计算时间 |
| **警报流** | 最近警报事件 (过去 50 个)，相关度最高的警报 (24小时，RCA) |

深入分析行 (生产与合规性、工艺指标、分析与 SPC、系统警报、RCA 设备摘要、周期时间与可追溯性) 默认折叠 — 单击行标题即可展开。这样可以使初步浏览仅关注高管 KPI 栏。

### 7. LDI 操作员安灯板

**目的**：现场 (工厂车间) 信息亭显示屏 — 兼容 ISA-101，无需触摸，在 1280x720 分辨率下无滚动。

显示设备可用性、严重警报计数、环境合规性 %、运行的机器、每台机器的状态 (OK/IDLE/NO_DATA 显示为背景颜色)，以及实时生产表。

### 8. LDI 工程分析与 SPC

**目的**：工程师的深入分析 — Cpk/SPC 排名，RCA 真理测试，PE/JE 分布。

| 章节 | 内容 |
|---|---|
| **环境** | 温度与湿度，所有机器同时显示 |
| **SPC 控制图** | 厚度控制图 (平均值 ± 3σ)，比例 X/Y 控制图 |
| **变异分析** | 每台机器的 PE/JE 标准差，PE/JE 误差分布 (箱线图) |
| **RCA / 警报关联** | RCA 真理测试 — 每个警报类别的提升度/置信度 (热力/湿度/真空/对准/运动) |

### 9. LDI 机器快照

**目的**：从工艺时间线 (从其他仪表盘深入) 中点击的确切毫秒数查看详细的机器状态。

显示作业上下文、物理变量、PE 对准、Cpk 以及该时间点附近的警报 — 当需要调查特定事件时使用，而非用于查看概览。

### 10. LDI 数据就绪度

**目的**：自我审计数据质量的仪表盘 — 仅使用 PostgreSQL 的真实数据，没有模拟数据。

用于检查 board-key 重复、覆盖率 % 以及与警报主表的匹配率，然后再信任其他仪表盘的数字。

---

## 指标解读

### CPU 指标

| 指标 | 单位 | 健康 | 警告 | 严重 |
|---|---|---|---|---|
| `cpu_load_percent` | % | < 60% | 60-80% | > 80% |
| `cpu_cores` | 数量 | — | — | — |

**如何解读：**
- **平均 CPU** — 所选时间段内所有核心的平均值。
- **峰值 CPU** — 记录的最高值 (可能会出现暂时的高峰)。
- **每核心 CPU** — 查看哪个核心正在被大量使用。

**示例：**
```
Machine: server-01
CPU Load: 72% (Warning)
├── Core 1: 85% ️
├── Core 2: 45% 
├── Core 3: 78% ️
└── Core 4: 80% ️
→ Core 1, 3, 4 正在被大量使用。检查哪些进程正在运行。
```

### 内存指标

| 指标 | 单位 | 健康 | 警告 | 严重 |
|---|---|---|---|---|
| `ram_used_mb` | MB | — | — | — |
| `ram_total_mb` | MB | — | — | — |
| **使用率 %** | % | < 70% | 70-85% | > 85% |

**如何解读：**
- **使用率 %** = `(ram_used_mb / ram_total_mb) × 100`
- **可用** = `ram_total_mb - ram_used_mb`
- 内存使用率高不一定是坏事 — Linux 使用内存进行缓存。

### 网络指标

| 指标 | 单位 | 描述 |
|---|---|---|
| `rx_mbps` | Mbps | 下载速度 (流入流量) |
| `tx_mbps` | Mbps | 上传速度 (流出流量) |
| `net_rx_errors` | 数量 | 接收错误 (硬件/驱动程序问题) |
| `net_rx_drops` | 数量 | 丢弃的数据包 (缓冲区溢出) |
| `net_if_status` | 1/2 | 1 = UP (上线), 2 = DOWN (下线) |

**如何解读：**
- **带宽利用率** = `(rx_mbps / link_speed) × 100`
- **错误率** = `net_rx_errors / total_packets × 100`
- **接口下线 (DOWN)** = 网线断开或交换机端口关闭。

**示例：**
```
Machine: server-01
┌─────────┬──────────┬──────────┬──────────┬──────────┬────────┐
│Interface│ RX Mbps │ TX Mbps │ Errors  │ Drops  │ Status │
├─────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│ eth0  │ 1200   │ 850   │ 0    │ 0    │ UP │
│ wlan0  │ 320   │ 180   │ 0    │ 12    │ UP │
└─────────┴──────────┴──────────┴──────────┴──────────┴────────┘
→ wlan0 有 12 个丢包 — 请检查无线信号
```

### 磁盘指标

| 指标 | 单位 | 健康 | 警告 | 严重 |
|---|---|---|---|---|
| `disk_used_gb` | GB | — | — | — |
| `disk_total_gb` | GB | — | — | — |
| **使用率 %** | % | < 70% | 70-80% | > 80% |

**如何解读：**
- **使用率 %** = `(disk_used_gb / disk_total_gb) × 100`
- **可用空间** = `disk_total_gb - disk_used_gb`
- **IOPS** = 每秒操作数 (如果有额外的指标)。

### 温度指标

| 指标 | 单位 | 健康 | 警告 | 严重 |
|---|---|---|---|---|
| `temp_c` | °C | < 65°C | 65-80°C | > 80°C |

**如何解读：**
- **平均温度** — 平均温度。
- **最高温度** — 最高温度 (峰值温度)。
- **温度趋势** — 温度正在升高或降低。

---

## 警报响应程序

### 警报严重级别

| 级别 | 颜色 | 响应时间 | 示例 |
|---|---|---|---|
| **严重 (Critical)** | 红色 | 立即 (< 15 分钟) | InterfaceDown, ServiceDown, CriticalCPU |
| **警告 (Warning)** | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 黄色 | 尽快 (< 1 小时) | HighCPU, HighMemory, DiskSpaceLow |
| **信息 (Info)** | 蓝色 | 正常 (< 4 小时) | TelemetryGap, PredictiveDiskFull |

### 事故响应剧本

#### 场景 1: InterfaceDown (严重)

```
症状:
- 警报: server-01 上的 InterfaceDown
- 网络面板显示 "No Data" (无数据)
- 其他机器仍在报告

调查步骤:
1. SSH 到 server-01 → 检查网线
2. 检查交换机端口状态
3. 运行: ip link show eth0
4. 检查接口是否为 UP

解决方案:
- 重新插拔网线
- 检查交换机配置
- 重启网络服务: systemctl restart networking
- 验证: ping 网关

升级:
- 如果物理网线正常 → 联系网络团队
- 如果交换机端口下线 → 联系数据中心团队
```

#### ️ 场景 2: HighCPUUsage (警告)

```
症状:
- 警报: server-01 上的 HighCPUUsage
- CPU 面板显示 > 80%
- 系统可能会变慢

调查步骤:
1. SSH 到 server-01
2. 运行: top -bn1 | head -20
3. 找出消耗 CPU 最多的进程
4. 检查是否有计划任务正在运行

解决方案:
- 如果是合法工作负载 → 监控，无需采取行动
- 如果是异常进程 → 终止 (kill) 或更改优先级 (renice)
- 如果是内存溢出 (OOM) → 添加交换空间或增加内存

升级:
- 如果持续时间超过 1 小时 → 与应用团队确认
- 如果影响到其他服务 → 考虑扩展
```

#### ️ 场景 3: DiskSpaceLow (警告)

```
症状:
- 警报: server-01 上的 DiskSpaceLow
- 磁盘面板显示 > 80%

调查步骤:
1. SSH 到 server-01
2. 运行: df -h
3. 运行: du -sh /* | sort -rh | head -10
4. 找出大文件/目录

解决方案:
- 清理日志: journalctl --vacuum-size=500M
- 删除旧备份: find /backup -mtime +30 -delete
- 压缩大文件: gzip largefile.log
- 归档到冷存储

升级:
- 如果磁盘使用率继续上升 → 规划存储扩展
- 如果情况严重 (> 95%) → 必须立即清理
```

#### 场景 4: ServiceDown (严重)

```
症状:
- 警报: server-01 上的 ServiceDown
- Blackbox 探针失败
- 应用可能无法访问

调查步骤:
1. 检查服务状态: systemctl status <service>
2. 检查服务日志: journalctl -u <service> -n 50
3. 检查端口绑定: netstat -tlnp | grep <port>
4. 检查防火墙: iptables -L -n

解决方案:
- 重启服务: systemctl restart <service>
- 检查配置: <service> -t (测试配置)
- 验证防火墙规则
- 检查依赖服务

升级:
- 如果服务无法启动 → 检查应用日志
- 如果端口冲突 → 找出冲突的进程
- 如果是系统级问题 → 联系系统管理员
```

#### ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 场景 5: PipelineDataStalled (警告)

```
症状:
- 警报: server-01 上的 PipelineDataStalled (在旧文档中称为 TelemetryGap)
- 3分钟以上无数据
- 其他机器仍在报告

调查步骤:
1. 检查 Node-RED 日志: docker compose logs --tail=50 node-red
2. 检查 SNMP 模拟器: docker compose ps snmpsim
3. 检查网络连接
4. 检查 machine_id 是否匹配

解决方案:
- 如果 snmpsim 下线 → docker compose restart snmpsim
- 如果 Node-RED 报错 → 检查流程 JSON 语法
- 如果机器不在注册表中 → 添加到数据库

升级:
- 如果持续存在 → 检查 SNMP 团体字符串
- 如果是新机器 → 验证 MIB 兼容性
```

---

## 常见操作

### 检查系统状态

```bash
# 查看所有容器
docker compose ps

# 检查 Node-RED 日志
docker compose logs --tail=20 node-red

# 检查 Prometheus 目标
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"

# 检查活动警报
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts"
```

### 直接查询数据库

```bash
# 最近的遥测数据 (过去 5 分钟)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, time, cpu_load_percent, temp_c
  FROM public.sys_metrics
  WHERE time > NOW() - INTERVAL '5 minutes'
  ORDER BY time DESC LIMIT 10;"

# 检查接口指标
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, iface_name, rx_mbps, tx_mbps
  FROM public.net_metrics
  ORDER BY time DESC LIMIT 1;"
```

### 重启服务

```bash
# 重启 Node-RED (流程更改后)
docker compose restart node-red

# 重启 Prometheus (规则更改后)
docker compose restart prometheus

# 完全重启 (不丢失数据)
docker compose restart node-red grafana alertmanager prometheus
```

---

## 故障排除

### 常见问题

| 症状 | 可能原因 | 解决方案 |
|---|---|---|
| **所有面板显示 "No Data"** | Node-RED 未运行 | `docker compose restart node-red` |
| **特定机器显示 "No Data"** | 机器不在注册表中 | 添加到 `machines` 表中 |
| **Alertmanager 不断重启** | 配置 YAML 语法错误 | 检查 `docker compose logs alertmanager` |
| **所有 blackbox 目标均 DOWN** | 配置中服务名称错误 | 使用 `blackbox-exporter:9115` |
| **Grafana 显示过时数据** | 仪表盘未刷新 | 强制刷新：Ctrl+Shift+R |
| **内存使用率高** | Node-RED 中存在内存泄漏 | 检查 `docker stats ims-node-red` |
| **数据库连接被拒绝** | PgBouncer 下线 | `docker compose restart pgbouncer` |

### 日志位置

| 服务 | 命令 | 要查找的内容 |
|---|---|---|
| **Node-RED** | `docker compose logs node-red` | `Started flows`, `TypeError`, `ETIMEOUT` |
| **TimescaleDB** | `docker compose logs timescaledb` | `connection refused`, `authentication failed` |
| **Prometheus** | `docker compose logs prometheus` | `failed to check config`, `target down` |
| **Alertmanager** | `docker compose logs alertmanager` | `Loading configuration file failed` |
| **Grafana** | `docker compose logs grafana` | `Failed to look up user`, `dashboard not found` |

### 快速诊断脚本

```bash
# 一次性运行所有健康检查
echo "=== 容器 ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}"

echo "=== 数据流 ==="
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(time) as latest
  FROM public.sys_metrics
  WHERE time > NOW() - INTERVAL '5 minutes'
  GROUP BY device_id;"

echo "=== 警报 ==="
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts" 2>&1 | \
 python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"data\"][\"alerts\"])} 个活动警报')"
```

---

## 快速参考

### 键盘快捷键 (Grafana)

| 快捷键 | 动作 |
|---|---|
| `Ctrl+S` | 保存仪表盘 |
| `Ctrl+Z` | 撤销 |
| `Ctrl+Shift+Z` | 重做 |
| `F` | 切换全屏 |
| `R` | 刷新仪表盘 |
| `T` | 打开时间选择器 |
| `D` | 打开仪表盘搜索 |
| `Ctrl+Shift+P` | 打开命令面板 |

### 颜色编码参考

| 指标 | 健康 | 警告 | 严重 |
|---|---|---|---|
| **CPU** | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) 绿色 | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 黄色 → 橙色 | 红色 |
| **内存** | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) 绿色 | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 紫色 → 深橙色 | 红色 |
| **磁盘** | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) 绿色 | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 青色 → 蓝色 | 红色 |
| **网络 RX** | 深蓝色 (#1F60C4) | — | 红色 |
| **网络 TX** | 浅蓝色 (#5794F2) | — | 红色 |
| **温度** | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) 绿色 | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 黄色 | 红色 |
| **错误** | — | — | 红色 (#C4162A) |
| **丢包 (Drops)** | — | ![Warning](https://img.shields.io/badge/Status-Warning-orange) 橙色 (#FF9830) | 红色 |

### 警报联系人

| 角色 | 联系人 | 渠道 |
|---|---|---|
| **NOC 团队** | LINE 群组 | LINE Messaging API |
| **系统管理员** | MS Teams | Webhook |
| **管理层** | 电子邮件 (未来) | SMTP |

---

<div align="center">

**IMS 用户手册 — 1.1 版本**

*供 IT 支持与 NOC 团队使用*

</div>
