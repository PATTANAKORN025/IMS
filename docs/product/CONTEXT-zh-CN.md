<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# CONTEXT — 会话启动加载器 (Session Start Loader)

> AI 代理会话引导脚手架，而非面向人类读者的文档 —— 为会话中首先加载此文件的任何 AI 工具提供快速的项目导航。如需查阅真实的系统文档，请从 `docs/architecture/IMS_PLATFORM_BOOK.md` 开始。
>
> **2026-08-10 修正：** 此文件曾引用了本仓库中不存在的 5 个文件（`CLAUDE.md`、`GLOBAL-INSTRUCTIONS.md`、`TASKS.md`、`MEMORY.md`、`checkpoint.md`）以及一些过时的技术声明。已在下方修复；“按此顺序阅读”列表已被删除，因为其目标文件不存在 —— `ABOUT-ME.md` 和 `START.md` 是原列表中仅存的两个确认存在的文件。

## 项目概览

- **IMS** — 涵盖两个领域的监控平台：基础设施（服务器、网络设备、SNMP 轮询）和 LDI 制造（PCB 激光直接成像产线，带有 SPC/RCA 分析的 HTTP/JSON 遥测）。
- **两条独立的流水线**，共享一个 TimescaleDB：基础设施（SNMP → Node-RED → PgBouncer → TimescaleDB）和 LDI（HTTP POST `/ldi-telemetry` → Node-RED → PgBouncer → TimescaleDB），两者都在 Grafana 中进行可视化展示（12 个仪表板，分为 `Infrastructure`/`Manufacturing` 文件夹），并通过 Grafana 原生规则 + Prometheus/Alertmanager 发出警报。
- 有关完整的系统上下文，请参阅 `docs/architecture/ARCHITECTURE.md`；有关基础设施/制造领域的划分，请参阅 `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md`。

## 工作区映射图 (Workspace map)

| 文件夹 | 用途 |
|--------|-----|
| `INPUTS/` | 用于开展工作的原始素材 |
| `OUTPUTS/` | 已完成的交付物 |
| `TEMPLATES/` | 可复用的提示词 (prompt)/工作流模板 |
| `ARCHIVES/` | 冷存储 / 被替代的文件（仅限本地，被 git 忽略 —— 与被追踪的 `docs/archive/` 不同） |
| `SKILLS/` | 技能笔记 + 映射 |
| `docs/` | 规范的计划、规格说明、报告、架构 —— 从 `docs/architecture/IMS_PLATFORM_BOOK.md` 开始 |
| `monitoring/` | grafana、prometheus、alertmanager、snmpsim 的配置文件 |
| `nodered_data/` | Node-RED 运行时环境 —— `flows/*.json` 为源文件，`flows.json` 为构建后的工件 (`node scripts/build-flows.js`) |

## 如何快速启动会话

请参阅 `START.md` 了解启动序列。
