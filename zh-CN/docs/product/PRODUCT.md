<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Product

> **Audience:** 厂长、产品负责人、销售/营销人员。
> **Objective:** 定义产品愿景、品牌个性和高层面的平台功能。
> **Provenance:** 于 2026-08-10 根据实时监控系统和业务目标进行了验证。

IMS（工业监控系统）填补了传统 IT 基础设施与 PCB 制造车间运营之间关键的可见性差距。通过以连续自动化的遥测（Telemetry）取代被动的人工检查，IMS 成为提升运营效率和设备正常运行时间的直接倍增器。

- **Risk Mitigation（风险缓解）：** 通过硬件达到阈值之前的亚 10 秒级异常检测（Z-Score AIOps），预防灾难性故障。
- **Cost Avoidance（规避成本）：** 零许可费用的开源架构消除了企业监控软件常见的巨额经常性费用（每年 300 万至 1000 万泰铢）。
- **Operational Scalability（运营可扩展性）：** 将手动数据记录自动化（每年节省 2,920 个工时），使操作员能够从被动监控转向主动维护。
- **Root-Cause Agility（根因分析敏捷性）：** 通过将机器警报与工艺参数（例如，LDI 激光强度和位置误差）直接关联，将平均解决时间（MTTR）从数小时缩短至数分钟。

## Register

product

## Platform

web

## Users

Primary（主要用户）：两个不同的操作员群体。

- **NOC Operators（NOC 操作员）：** 监控跨数据中心的服务器和网络设备。
  - **Environment（环境）：** 24/7 全天候轮班。
  - **Needs（需求）：** 能够快速查看设备健康状况、网络带宽和温度异常。
- **LDI Floor Operators & Process Engineers（LDI 车间操作员与工艺工程师）：** 监控 PCB 生产线。
  - **Environment（环境）：** 工厂车间。
  - **Needs（需求）：** 实时安灯（Andon）看板状态、SPC/Cpk 工艺能力，以及警报与参数之间的 RCA（根本原因分析）关联。

Secondary（次要用户）：

- **SRE and DevOps Engineers（SRE 与 DevOps 工程师）：** 在这两个领域执行根本原因分析、容量规划和流水线调试。

## Product Purpose

提供一个涵盖两个领域（基础设施和制造）的单一控制面板（Single-pane-of-glass）监控系统，每个领域都有其自身的遥测流水线、仪表板集和警报机制。

**Infrastructure Domain（基础设施领域）：**

- **Ingestion（数据接入）：** 来自服务器/网络设备的 SNMP 指标，通过 Node-RED 导入 TimescaleDB。
- **Visualization（可视化）：** 5 个仪表板（NOC 概览、工程向下钻取、容量预测、元监控、接入延迟）。
- **AIOps：** Z-Score 异常检测、断路器降级（Circuit breaker degradation）、预测性容量预测。

**Manufacturing Domain（制造领域）：**

- **Ingestion（数据接入）：** LDI 机器遥测（位置/判定误差、厚度、扫描速度、抗蚀剂剂量）通过 HTTP/JSON 接入。
- **Visualization（可视化）：** 10 个仪表板（简易概览、制造指挥中心、操作员安灯看板、警报控制台、警报字典、工程分析与 SPC、机器快照、数据就绪度、工厂数字孪生、警报响应）。
- **Analytics（分析）：** 真实的 SPC（Cpk 工艺能力）和 RCA（警报与参数关联）分析。

**Alerting & Success Criteria（警报与成功标准）：**

- **Notifications（通知）：** 带有直接运维手册（Runbook）链接的 LINE Messaging API 和 MS Teams。
- **Success Criteria（成功标准）：** 全面的可见性 — 关键设备、机器和异常情况可在数秒内可见。

## Positioning

工业级监控，既了解服务器又了解网络交换机硬件，具有自愈式（Self-healing）流水线架构，能够在操作员不干预的情况下从设备故障中恢复。

## Brand Personality

**Precision（精准），Resilience（韧性），Authority（权威）。** 该系统以成熟的工业平台的自信进行沟通——没有为了装饰而装饰的设计，没有俏皮的修饰。每种颜色都具有语义含义（红色=严重，黄色=警告，绿色=健康）。深色主题反映了 24/7 NOC 环境，操作员在荧光灯下盯着屏幕。对于数字数据，排版采用等宽字体，以防止实时更新期间出现抖动。

## Anti-references

- 具有明亮白色背景和彩虹色调色板的通用 SaaS 仪表板
- 带有卡通图标和一切皆圆角设计的消费级监控工具
- Bootstrap/Material Design 管理模板（过于通用，缺乏工业特征）
- 未经定制的 Grafana 默认深色主题（看起来像其他所有 Grafana 实例）
- 优先考虑美观而非数据密度的偏向营销的仪表板

## Design Principles

1. **Semantic color, never decorative（语义色彩，绝非装饰）：** 每种颜色都映射到一个运行状态，来自每个仪表板共享的经过批准的 8 标记调色板（`docs/architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1）：`#ef4444`=严重，`#f59e0b`=警告，`#22c55e`=正常，`#eab308`=轻微严重，`#3b82f6`=强调，`#00f2fe`=信息，`#64748b`=无数据，`#4a5568`=预测。绝对不要仅为了装饰而使用颜色——在提交时由 `dashboard-linter.js` 检查 15 强制执行。
2. **Data density over whitespace（数据密度优先于空白）：** NOC 操作员需要每个屏幕像素获得最大信息量。在操作环境中，空白就是浪费空间。
3. **Zero cognitive load for anomalies（异常情况的零认知负担）：** 不健康的设备必须通过颜色、位置或运动立即显现——绝对不能要求通过阅读数字来检测问题。
4. **Self-healing by design（基于设计的自愈）：** 系统在无需人工干预的情况下检测并从故障中恢复（断路器、重试队列、降级的接入）。仪表板反映了这种韧性。
5. **Monospaced truth（等宽的真相）：** 所有数字数据都使用等宽字体，以防止实时更新过程中的布局偏移。数字即产品本身。

## Accessibility & Inclusion

目标符合 WCAG 2.1 AA 标准。色彩组合在深色背景下满足 4.5:1 的对比度。所有严重警报在颜色指示器旁边都带有文本标签（不仅靠颜色区分）。通过 CSS `prefers-reduced-motion` 支持减少运动。屏幕阅读器兼容面板描述和警报注释。

---

[⬅️ Back to Main Repository](../../README.md)
