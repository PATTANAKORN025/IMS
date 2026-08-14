# IMS 操作员标准操作程序 (SOP)

> **角色:** LDI 车间操作员 / NOC 1 级支持
> **目标:** 使用 IMS Grafana HUD 进行日常操作、监控和一线响应。

---

## 1. 交接班 (08:00 / 20:00)

### 1.1 交接班检查表
1. **登录:** 在主屏幕打开 [IMS NOC Overview](http://localhost:3000/d/ims-noc-overview) 仪表板。
2. **健康检查:** 查看 **Fleet Health Score** (左上角)。
 - `> 95%`: ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) 正常。继续日常工作。
 - `90% - 94%`: ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 警告。检查 "Top 10 Critical Nodes" 面板。
 - `< 90%`: 严重。立即升级至 2 级 (SRE/Engineering)。
3. **验证 LDI 机群:** 打开 [LDI Manufacturing](http://localhost:3000/d/ims-ldi-manufacturing) 仪表板。确保没有机器标记为红色 "OFFLINE"。

---

## 2. 日常监控和安灯 (Andon) 响应

**Operator Andon Dashboard** 是主要工具。严格执行红绿灯协议。

### ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) 绿灯状态 (正常)
- **视觉:** 所有面板呈绿色。无闪烁。
- **操作:** 无需操作。继续常规机器上下料。

### ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 黄灯状态 (警告)
- **视觉:** 面板变黄 (例如 "Yield Drop Warning", "Temp Rising")。
- **操作:** 
 1. 点击黄色面板打开 [LDI Machine Snapshot](http://localhost:3000/d/ims-ldi-machine-snapshot)。
 2. 验证具体指标 (例如激光温度为 42°C，限制为 45°C)。
 3. 通过对讲机/LINE 通知产线主管。说明机器 ID。

### 红灯状态 (严重 / 停线)
- **视觉:** 面板变红并闪烁。背景可能闪烁。
- **操作:**
 1. **停线。** 立即停止向受影响的 LDI 机器装载 PCB。
 2. 存在安全风险时按下紧急停止按钮。
 3. 在操作 LINE 群组中宣布 "LDI-[Machine-ID] DOWN"。
 4. 参阅 [ALARM PLAYBOOK](ALARM_PLAYBOOK.md) 了解屏幕上显示的具体错误代码。

---

## 3. 如何查找特定信息

### Q: "主管想知道为什么 LDI-05 机器速度慢。"
1. 打开 [Engineering Drill-Down](http://localhost:3000/d/ims-engineering) 仪表板。
2. 在左上角的下拉菜单 (Variable) 中，选择 `LDI-05`。
3. 检查 **CPU / RAM / Yield** 时间序列面板是否有突然下降 (Z-Score anomalies)。

### Q: "监控系统本身坏了吗？"
1. 打开 [Meta-Monitoring](http://localhost:3000/d/ims-meta-monitoring) 仪表板。
2. 检查 **Node-RED Ingestion Rate**。如果持续 1 分钟为 `0 rows/sec`，则监控管道已瘫痪。致电 IT/DevOps。

---

## 4. 班次结束 (19:30 / 07:30)

### 4.1 每日报告
1. 打开 [Capacity Planning](http://localhost:3000/d/ims-capacity) 仪表板。
2. 记录任何显示 **"Days Until Full < 7"** 的机器。
3. 在交接班记录本中记录当班的平均 Fleet Health Score。
4. 将持续的黄色/警告状态移交给下一班操作员。

---
*Version: 1.0.0 | Last Updated: 2026-08-10*
