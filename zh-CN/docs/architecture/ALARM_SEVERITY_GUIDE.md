<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# LDI 告警严重级别指南 (LDI Alarm Severity Guide)

> **目标受众：** 流程工程 (Process Engineering)、QA/审计、SRE/运营、工厂管理。
> **目的：** 定义 4 级告警严重级别分类 (Taxonomy)、视觉色彩映射 (Visual Color Mapping) 以及对 ISA-18.2 合规性的界限。
> **来源出处 (Provenance)：** 于 2026-08-10 直接对照实时数据库、`dashboard-linter.js` 和实际仪表板 JSON 值映射进行核对。

---

## 4 级严重级别划分 (The 4-tier severity scale)

`public.ldi_alarm_ms_code.severity` 被严格限制为 4 个值（通过 `CHECK` 约束）：

| 严重级别 (Severity) | 颜色 Token (Color token) | 十六进制色值 (Hex) | 含义                                                                                                                                                                                          |
| ------------------- | ------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical**        | `critical`               | `#EF4444`          | 最高严重级别 — 需要立即响应。                                                                                                                                                                 |
| **Major**           | `warning`                | `#F59E0B`          | 重大故障 — 需要及时处理。                                                                                                                                                                     |
| **Minor**           | `severity-minor`         | `#EAB308`          | 影响较小的故障。刻意采用与 Major 琥珀色不同的色调，以便能一目了然地区分这 4 个级别 — 详见 `GRAFANA_DESIGN_SYSTEM.md` §2.1。                                                                   |
| **Warning**         | `accent`                 | `#3B82F6`          | 4 个级别中最低的级别 — 仅供参考/建议。映射到蓝色 _accent_ Token，而不是具有语义名称的 `warning` 琥珀色 Token（该 Token 已被 Major 占用） — 这是真实且刻意的映射，并非不一致 (Inconsistency)。 |

**19 个在模拟器中处于激活状态的告警代码的实时严重级别分布** (2026-08-10)：7 个 Major、11 个 Warning、1 个 Minor，**0 个 Critical**。目前模拟器没有生成 Critical 级别的代码 — 这是关于当前模拟器故障注入范围的事实，但这并不意味着 Critical 告警不可能发生（在 `ldi_alarm_ms_code` 中完整导入的告警代码目录远远超过模拟器激活的 19 个代码，包含尚未连接触发的 Critical 级别条目）。

## ISA-18.2 适用范围 — 此处务必使用精准语言

上述严重级别命名和颜色约定借用了 ISA-18.2 的词汇。**此系统是“ISA-18.2 风格 (ISA-18.2-style)”，而非“符合 ISA-18.2 标准 (ISA-18.2-compliant)”** — 于 2026-08-10 进行了核实，以回应先前声称完全符合标准的说法。真实实现的内容包括：

- 4 级 Critical/Major/Minor/Warning 命名及其专用的颜色 Token。

**未**实现的内容 — 即该标准的实际核心内容：

- **告警状态 (Alarm states)：** ISA-18.2 定义了状态模型（未确认 (Unacknowledged)、已确认 (Acknowledged)、已搁置 (Shelved) 等）。`ldi_alarm_log` 中没有 ack/shelve/suppress 列。每个告警默认且永久处于单一隐式状态。
- **合理化文档 (Rationalization documentation)：** 不存在针对每个告警的合理化记录（告警存在原因、后果、响应方式）。
- **告警性能 KPI (Alarm performance KPIs)：** 未进行告警数量/操作员/10分钟、洪泛状态 (Flood) 时间百分比或“不良告警 (Bad actor)”等分析和跟踪。

> [!NOTE]
> 如果面向利益相关者的文档需要描述告警管理，请使用术语 **“ISA-18.2 风格的严重级别分类 (ISA-18.2-style severity taxonomy)”**，不要使用“符合 ISA-18.2 标准 (ISA-18.2 compliant)”。（注意：针对 HMI 设计的独立标准 ISA-101，在操作员安灯看板 (Operator Andon Board) 中_确实_得到了正确的实施）。

## 严重级别的应用场景

- **安灯看板 (Andon Board) / 告警表格** — LDI 仪表板中所有面向告警的面板 (Panel) 均使用上述色彩映射来呈现严重级别（在代码提交时，`dashboard-linter.js` 检查项 15 会强制要求 Token 合规）。
- **RCA 相关性 (RCA correlation)** — 严重级别本身不是 Lift/Confidence 计算的因素（详见 `LDI_RCA_GUIDE.md`）；RCA 将告警的_类别_（按代码划分，通过 `v_ldi_alarm_category` 映射）与工艺参数关联起来，这与严重级别无关。

## 告警代码目录 (The alarm code catalog)

`public.ldi_alarm_ms_code`（列名：`alarm_id`, `alarm_type`, `alarm_code`, `alarm_msg`, `alarm_detail`, `severity`）保存了真实历史导出数据（超过 1,820 个代码）— 远多于当前模拟器主动生成的 19 个代码。请参阅 `docs/operations/ALARM_PLAYBOOK.md` 获取实际在模拟器中处于激活状态的子集及初始响应指南，以及 `tests/lint/alarm-sync-linter.js` 了解该 CI 门禁是如何保持模拟器可生成的代码与主目录同步的。

## 相关文档

- `docs/operations/ALARM_PLAYBOOK.md` — 针对实际触发的告警代码的实用第一响应手册 (Runbook)。
- `docs/architecture/LDI_RCA_GUIDE.md` — 告警类别与工艺参数如何关联。
- `docs/architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1 — 完整的经过批准的颜色 Token 集。

---

[⬅️ 返回 IMS 平台手册](../../../docs/architecture/IMS_PLATFORM_BOOK.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码库](../../../README.md)
