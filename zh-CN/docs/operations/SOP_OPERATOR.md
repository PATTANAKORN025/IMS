<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS 操作员标准作业程序 (SOP)

> **受众：** 工厂车间操作员、NOC 1级支持人员。
> **目标：** 使用 IMS Grafana HUD 进行日常操作、监控和一线响应。
> **出处：** 于 2026-08-10 针对实际生产工作流进行了验证。

---

## 1. 交接班与初始化 (08:00 / 20:00)

### 1.1 岗前检查清单

在接班之前，接班操作员必须验证平台的基线健康状态：

1. **登录与认证：** 在主墙面显示器上打开 [IMS NOC Overview](http://localhost:3000/d/ims-noc-overview) 仪表板。
2. **验证设备群健康度得分**（左上方面板）：
   - `> 95%`：<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 健康 **正常 (Nominal)**。可以接班。
   - `90% - 94%`：<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 警告 **警告 (Warning)**。检查“Top 10 Critical Nodes”面板。要求交班人员针对这些节点进行口头汇报。
   - `< 90%`：<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 严重 **严重 (Critical)**。在没有 L2（工程）人员在场的情况下，不要接班。立即升级处理。
3. **验证 LDI 设备群状态：** 打开 [LDI Manufacturing](http://localhost:3000/d/ims-ldi-manufacturing) 仪表板。确保没有机器被意外标记为红色的“OFFLINE”。

---

## 2. 常规监控与安灯 (Andon) 响应

**操作员安灯仪表板 (Operator Andon Dashboard)** 按照严格的交通灯协议运行。不要试图调试算法；请根据颜色做出响应。

### <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 健康绿色状态（正常运行）

- **视觉效果：** 所有面板均为绿色。无闪烁。
- **行动：** 继续标准 PCB 装载/卸载操作。保持对现场情况的关注。

### <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 警告黄色状态（预警）

- **视觉效果：** 面板变黄（例如，“Yield Drop Warning”、“Temp Rising”）。
- **行动工作流：**
  1. 点击黄色面板，立即跳转到 [LDI Machine Snapshot](http://localhost:3000/d/ims-ldi-machine-snapshot)。
  2. 识别具体超出范围的指标（例如，“激光温度为 42°C，接近 45°C 限制”）。
  3. **沟通话术：** 通过对讲机或指定的运营 LINE 群组通知产线主管：
     > _"警告：机器 LDI-[ID] 显示 [Metric] 为 [Value]。正在密切监控。"_

### <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 严重红色状态（严重异常 / 停线）

- **视觉效果：** 面板变红并闪动。背景可能会闪烁。
- **行动工作流：**
  1. **停止产线 (STOP THE LINE)。** 立即停止将 PCB 装载到受影响的 LDI 机器中。
  2. **安全第一：** 如果存在任何直接的安全风险或严重的设备损坏风险，请按下物理紧急停止 (E-Stop) 按钮。
  3. **沟通话术：** 立即在运营 LINE 群组中宣布：
     > _"严重：LDI-[Machine-ID] 宕机。错误：[Metric/Alarm Code]。产线已停止。"_
  4. 请参阅 [ALARM PLAYBOOK](../../../docs/operations/ALARM_PLAYBOOK.md) 以了解控制台上显示的具体故障代码。

---

## 3. 升级矩阵（升级时间 SLA）

发生问题时，请严格遵守这些升级时间 (TTE) 限制。不要试图在您的授权时间窗口之外进行“个人英雄主义式的调试”。

| 事件类型 | 初始响应 (L1 操作员) | 升级到 L2 (产线主管) 的时间 (TTE) | 升级到 L3 (SRE / 工厂工程师) 的时间 (TTE) |
| :--- | :--- | :--- | :--- |
| **单台机器黄色** | 监控并记录 | 15 分钟 | 60 分钟 (如果未解决) |
| **单台机器红色** | 停线并记录警报 | 立即 (0 分钟) | 15 分钟 |
| **多台机器红色** | 停止受影响的产线 | 立即 (0 分钟) | 立即 (0 分钟) |
| **IMS HUD 无响应** | 刷新浏览器 | 5 分钟 | 15 分钟 |
| **Node-RED 摄入 0 rows/s** | Ping IT 部门 | 立即 (0 分钟) | 立即 (0 分钟) |

---

## 4. 故障恢复后检查清单

当工程部门解决了红色状态时，操作员必须正式批准该机器恢复生产：

1. **验证仪表板：** 确认安灯板上特定的 LDI 机器面板已恢复为绿色。
2. **确认解决：** 打开 `IMS LDI - Alarm Console` 并将警报标记为“已解决 (Resolved)”。
3. **沟通话术：** 在运营 LINE 群组中宣布：
   > _"恢复：LDI-[Machine-ID] 已由 [Engineer Name] 清除故障。恢复生产。"_
4. **恢复装载：** 重新开始标准装载序列。

---

## 5. 交班准备 (19:30 / 07:30)

### 5.1 结班协议

1. 打开 [Capacity Planning](http://localhost:3000/d/ims-capacity) 仪表板。
2. 在日常交班日志中记录任何显示为 **"Days Until Full < 7"** 的机器。
3. 记录结班时的设备群平均健康度得分。
4. 与接班操作员进行口头交接，明确指出任何未解决的黄色状态。

---

## 相关文档

- [INCIDENT RESPONSE](../../../docs/operations/INCIDENT_RESPONSE.md) — 重大事件处理程序。
- [ALARM PLAYBOOK](../../../docs/operations/ALARM_PLAYBOOK.md) — 特定的机器错误代码。

---

[⬅️ 返回 IMS 平台手册](../../../docs/architecture/IMS_PLATFORM_BOOK.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码库](../../../README.md)
