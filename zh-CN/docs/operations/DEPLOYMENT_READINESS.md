<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 部署就绪评估

> **IMS 生产环境部署就绪评估文档**
> 最后更新：2026-06-29

---

<div align="center">

<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态:** 生产就绪
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **版本:** 1.0.0
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **最近评估:** 2026-06-29

</div>

---

## 目录

1. [版本兼容性](#版本兼容性)
2. [部署前检查清单](#部署前检查清单)
3. [实际故障排除](#实际故障排除)
4. [数据格式可靠性](#数据格式可靠性)
5. [上线检查清单](#上线检查清单)

---

<a name="版本兼容性"></a>

## 版本兼容性

### 当前技术栈版本

| 组件            | 当前版本      | 最新版本 | 风险 | 备注                                |
| --------------- | ------------- | -------- | ---- | ----------------------------------- |
| **Node-RED**    | 4.0.5         | 5.0      | 高   | 落后 2 个大版本，需要 Node.js 22.9+ |
| **TimescaleDB** | PostgreSQL 16 | PG 17    | 低   | v16 仍受支持至 2028 年              |
| **Grafana**     | 11.x          | 11.x     | 无   | 当前版本                            |
| **Prometheus**  | v2.55.x       | 3.x      | 低   | v2.x 仍在维护                       |
| **K6**          | 未指定        | 最新     | 无   | 运行良好                            |
| **Docker**      | v4.0+         | v4.0+    | 无   | 稳定                                |

### Node-RED 升级路径

> **警告**：Node-RED 5.0（发布于 2026 年 6 月 9 日）是历史上最大的一次编辑器变更。

| 要求            | 当前状态       | v5.0 所需状态     |
| --------------- | -------------- | ----------------- |
| Node.js         | 18.x           | 22.9+             |
| Docker 基础镜像 | node:18-alpine | node:22-alpine    |
| 编辑器 UI       | 旧版           | 基于 React 的新版 |
| 流程图兼容性    |                | 需先测试          |

**建议的升级路径：**

1. 优先在预发布 (staging) 环境中进行测试
2. 仔细阅读官方升级指南
3. 升级前备份所有流程 (flows)
4. 验证自定义节点 (custom nodes) 的兼容性

---

<a name="部署前检查清单"></a>

## 部署前检查清单

### 阶段 1：网络准备

| #   | 任务                                 | 状态 | 责任人     |
| --- | ------------------------------------ | ---- | ---------- |
| 1   | 获取目标机器的 IP 地址               |      | 网络团队   |
| 2   | 确认 SNMP 团体字 (community strings) |      | 安全团队   |
| 3   | 验证目标机器是否已启用 SNMP          |      | 服务器团队 |
| 4   | 验证 UDP 161 端口未被防火墙拦截      |      | 网络团队   |
| 5   | 测试网络连通性 (ping)                |      | IT 团队    |

**Windows 启用 SNMP：**

```powershell
# Enable SNMP via Windows Features
Enable-WindowsOptionalFeature -Online -FeatureName "SNMP" -All

# Or via GUI: Control Panel → Programs → Turn Windows features on/off → Simple Network Management Protocol (SNMP)
```

**Linux 启用 SNMP：**

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install snmpd

# Enable and start service
sudo systemctl enable snmpd
sudo systemctl start snmpd
```

### 阶段 2：Docker 部署

| #   | 任务             | 状态 | 命令                                                                  |
| --- | ---------------- | ---- | --------------------------------------------------------------------- |
| 1   | 克隆代码库       |      | `git clone https://github.com/PATTANAKORN025/IMS.git`                 |
| 2   | 创建密钥         |      | `mkdir -p secrets && echo "password" > secrets/postgres_password.txt` |
| 3   | 复制环境变量     |      | `cp .env.example .env`                                                |
| 4   | 启动服务         |      | `docker compose up -d`                                                |
| 5   | 等待启动         |      | `sleep 40`                                                            |
| 6   | 验证容器运行状态 |      | `docker compose ps`                                                   |

### 阶段 3：设备注册

| #   | 任务                     | 状态 | 命令                                                                                                            |
| --- | ------------------------ | ---- | --------------------------------------------------------------------------------------------------------------- |
| 1   | 更新 `public.devices` 表 |      | `INSERT INTO public.devices (device_id, hostname, ip_address, snmp_community, snmp_port, enabled) VALUES (...)` |
| 2   | 测试 SNMP 连通性         |      | `snmpwalk -v2c -c <community> <ip> 1.3.6.1.2.1.1`                                                               |
| 3   | 验证数据流               |      | 检查 Grafana 仪表板 (Dashboards)                                                                                |

### 阶段 4：安全加固

| #   | 任务                         | 状态 | 参考资料                                                                                     |
| --- | ---------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| 1   | 移除 PgBouncer 宿主机端口    |      | 从未在基础 `docker-compose.yaml` 中公开——这不是 prod-overlay 的修改                          |
| 2   | 启用 Node-RED adminAuth      |      | 生成 bcrypt 哈希值                                                                           |
| 3   | 禁止直接从宿主机访问 Grafana |      | 基础 compose 文件中没有宿主机端口；`proxy` (nginx) 是唯一的入口，代理 Grafana 和 `alarm-api` |
| 4   | 审查 SECURITY.md             |      | 请参阅安全检查清单                                                                           |

---

<a name="实际故障排除"></a>

## 实际故障排除

### 基于优先级的故障分析

| 优先级 | 问题                             | 症状                                     | 诊断                           | 修复方案                                              |
| ------ | -------------------------------- | ---------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| **P1** | SNMP 服务已禁用                  | 所有 walker 返回空值/超时                | `snmpwalk` 未返回任何内容      | 在 Windows 功能中启用 SNMP 或执行 `apt install snmpd` |
| **P2** | 防火墙拦截了 UDP 161 端口        | 连接在 3 秒后超时                        | `telnet <ip> 161` 失败         | 开放 Node-RED 容器和目标设备之间的 UDP 161 端口       |
| **P3** | 团体字 (Community string) 不匹配 | 身份验证失败                             | `snmpwalk` 返回 "No such name" | 确保流程配置中的团体字与目标的配置匹配                |
| **P4** | 真实 OID ≠ 模拟 OID              | LDI 指标数据为零                         | LDI 面板显示 "No Data"         | 向供应商索取真实的 MIB 文件，更新 walker 的 OID       |
| **P5** | 宿主机硬编码了 `ims-snmpsim`     | 即使存在真实设备，系统仍读取模拟器的数据 | 数据显示为模拟器的值           | 使用设备注册表（阶段 4）或更新 walker 配置            |
| **P6** | 工厂网络延迟                     | 在 3 秒的限时内发生超时                  | 间歇性的数据缺失               | 针对远程站点，将 SNMP 超时时间增加到 5-10 秒          |

### 快速诊断命令

```bash
# Test SNMP connectivity
snmpwalk -v2c -c <community> <ip> 1.3.6.1.2.1.1

# Check UDP port
nc -zuv <ip> 161

# Test from Node-RED container
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('<ip>', '<community>', {port: 161, timeout: 5000});
session.get(['1.3.6.1.2.1.1.1.0'], (err, varbinds) => {
 if (err) console.error('ERROR:', err.message);
 else console.log('OK:', varbinds[0].value.toString());
 session.close();
});
"
```

---

<a name="数据格式可靠性"></a>

## 数据格式可靠性

### 机器类型评估

| 机器类型           | 模拟对比真实       | MIB 标准           | 可靠性                                                                                     | 备注         |
| ------------------ | ------------------ | ------------------ | ------------------------------------------------------------------------------------------ | ------------ |
| **Ubuntu (SNMP)**  | 标准 MIBs          | HOST-RESOURCES-MIB | <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态:** 健康度高 | 极有可能匹配 |
| **Windows (SNMP)** | 标准 MIBs          | HOST-RESOURCES-MIB | <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态:** 健康度高 | 极有可能匹配 |
| **LDI (YSPhotec)** | 自定义 `.9999` MIB | Private Enterprise | **未证实**                                                                                 | 完全基于假设 |

### LDI 机器注意事项

> **严重**：YSPhotec 机器由供应商 (Bender) 系统控制。

| 问题                 | 答案 | 需要采取的行动                             |
| -------------------- | ---- | ------------------------------------------ |
| LDI 是否支持 SNMP？  | 未知 | 需与供应商/工程团队确认                    |
| 真实的 OID 是什么？  | 未知 | 向供应商索取真实的 MIB 文件                |
| 数值是否被除以 100？ | 猜测 | 验证实际的数值格式                         |
| 是否需要 SNMP 网关？ | 可能 | 评估 PLC 到 SNMP 的网关或者使用 Bender API |

**在与供应商确认之前，请勿假设 SNMP 可用。**

---

<a name="上线检查清单"></a>

## 上线检查清单

### 上线前一天

| #   | 任务                             | 责任人  | 签字确认 |
| --- | -------------------------------- | ------- | -------- |
| 1   | 完成所有部署前任务               | IT 团队 |          |
| 2   | 备份现有的监控系统（如果有的话） | IT 团队 |          |
| 3   | 将维护时间窗口通知所有利益相关者 | IT 经理 |          |
| 4   | 制定回滚计划                     | IT 团队 |          |

### 上线当天

| #   | 任务                     | 时间   | 责任人   |
| --- | ------------------------ | ------ | -------- |
| 1   | 启动 Docker 技术栈       | T+0    | IT 团队  |
| 2   | 等待 40 秒以便完成启动   | T+40s  | —        |
| 3   | 验证所有容器是否在运行   | T+45s  | IT 团队  |
| 4   | 验证数据流               | T+90s  | IT 团队  |
| 5   | 验证仪表板是否正常加载   | T+2min | IT 团队  |
| 6   | 测试告警系统（模拟告警） | T+5min | IT 团队  |
| 7   | 进行 24 小时的监控       | T+24h  | NOC 团队 |

### 上线后一天

| #   | 任务                      | 责任人  |
| --- | ------------------------- | ------- |
| 1   | 审查 24 小时的监控数据    | IT 团队 |
| 2   | 处理任何误报的告警        | IT 团队 |
| 3   | 记录遇到的任何问题        | IT 团队 |
| 4   | 安排 1 周后的项目回顾会议 | IT 经理 |

---

<div align="center">

**IMS 部署就绪评估 — 版本 1.0**

_已为生产环境部署进行评估_

</div>
