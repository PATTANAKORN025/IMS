<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 工程师入职与上手指南</h1>
  <p><b>面向平台工程师的系统架构全景、本地开发环境部署与日常运维排障工作流</b></p>
  <p>
    <a href="../../../docs/product/ONBOARDING.md">English</a> |
    <a href="../../../th/docs/product/ONBOARDING.md">ไทย</a> |
    <a href="ONBOARDING.md">简体中文</a>
  </p>
</div>

---

## 1. 欢迎加入 IMS 工程团队

欢迎加入 **工业监控系统 (IMS)** 工程团队。IMS 专为高精度工业 PCB 制造（激光直接成像 / LDI）、数控钻孔（CNC Drilling）以及垂直连续电镀（VCP）设施设计，提供生产级实时遥测监测与智能告警。

### 系统架构总览

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart LR
  EDGE["工业边缘设备\n(LDI, CNC, VCP, SNMP)"] -->|"HTTPS / SNMP"| INGEST["摄入处理层\n(Nginx Proxy & Node-RED)"]
  INGEST -->|"连接池调度"| PGB["PgBouncer :5432"]
  PGB -->|"写入超表"| TSDB["TimescaleDB (PostgreSQL 16)"]
  TSDB -->|"连续聚合视图"| GRAFANA["Grafana 13\n(22 个预置生产看板)"]
  PROM["Prometheus & Alertmanager"] -->|"Webhooks"| NOTIF["LINE & Teams 告警外发"]
```

---

## 2. 首日开发环境初始化 (Day-1 Setup)

5 分钟内在本地启动完整的全套运行环境：

### 环境前置要求

- **Docker Desktop** / Docker Engine（支持 Compose v2）
- **Node.js**（v18 或 v20 LTS）
- **Make**（Windows 环境可直接调用 PowerShell 对应脚本）

### 极速初始化步骤

```bash
# 1. 克隆代码仓库
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS

# 2. 配置环境配置文件
cp .env.example .env
# 编辑 .env，并将默认示例密码替换为强随机本地密钥

# 3. 校验工具链依赖
make doctor

# 4. 构建并启动全部 16 个服务容器
make up

# 5. 全面验证系统健康状态
make verify
```

启动完成后，通过浏览器访问 `http://localhost:3000` 即可进入 Grafana 控制台。

---

## 3. 核心生产与排障工作流

### 异常排查与下钻定位 (Triage & Drill-Down)

当制造工艺指标超出规格或产生系统告警时：

1. **NOC 全景大屏 (`/d/ims-noc-overview`)**:
   - 检查全厂设备的温度、扫描速度或对齐误差整体态势。
   - 点击高亮异常指标，通过 Grafana Data Link 直接跳转到对应设备下钻面板。
2. **LDI 制造集群指挥中心 (`/d/ims-ldi-manufacturing`)**:
   - 切换 `$machine_id` 过滤单台设备（如 `LDI-01` 至 `LDI-10`）。
   - 查看由 TimescaleDB 连续聚合动态计算的过程能力指数 ($C_p, C_{pk}$) 以及 3-sigma Z-Score。
3. **告警控制台 (`/d/ims-ldi-alarm-console`)**:
   - 审查记录在 `public.ldi_alarm_lifecycle` 的活动告警。
   - 操作员确认告警（Acknowledge），工程师通过 `ims-alarm-api` 输入根本原因分析笔记并解除告警（Resolve）。

---

## 4. 工程守则与开发门禁

- **零风险流程规则**: 切勿直接手动修改 `nodered_data/flows.json`。拆分源码保存在 `nodered_data/flows/*.json` 中，执行 `make deploy-flows` 进行合并部署。
- **数据库架构规范**: 业务表与超表必须严格存放在 `public` 模式下，禁止建立自定义 schema。
- **提交前质量门禁**: 提交 Pull Request 前务必运行 `make check`（或 `node scripts/pre-commit.js`），确保所有单元测试与代码检查 100% 通过。

更详尽的技术规范请参阅 [文档索引](../README.md)。
