<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a> &nbsp;|&nbsp; <a href="../../docs/README.md">🌐 <b>English</b></a> &nbsp;|&nbsp; <a href="../../th/docs/README.md">🇹🇭 <b>ภาษาไทย</b></a> &nbsp;|&nbsp; <a href="README.md">🇨🇳 <b>中文</b></a>
</div>
<br/>

<div align="center">
  <img src="../../docs/assets/icons/book.svg" width="64" alt="Docs Logo" style="filter: drop-shadow(0 0 12px rgba(0, 242, 254, 0.6));" />
  <h1>IMS 文档目录</h1>
  <p><b>工业监控系统知识库中心</b></p>
</div>

---

> [!TIP]
> **欢迎来到 IMS 知识库。** 本仓库包含有关 APEX Circuit 工业监控系统各个方面的世界级、工程级文档。所有文档均毫无夸大之词，经过优化以降低认知负荷，并从宏观到微观进行结构化。

## <img src="../../docs/assets/icons/book.svg" width="18" align="center" /> 目录

### 1. 产品与架构 (Product & Architecture)

高层设计、商业价值和产品功能。

- **[产品概述](product/README.md)** - 功能与生态系统。
- **[仪表板生态系统](product/DASHBOARD_ECOSYSTEM.md)** - 15 个必选的 Grafana 仪表板。
- **[架构手册](architecture/IMS_PLATFORM_BOOK.md)** - 全栈技术架构。
- **[数据流](architecture/DATA_FLOW.md)** - 从边缘到可视化的遥测管道 (Telemetry pipeline)。
- **[数据库模式](architecture/DATABASE_SCHEMA.md)** - TimescaleDB 超表 (Hypertable) 结构。
- **[商业 ROI](business/BUSINESS_VALUE_ROI.md)** - 商业影响和投资回报率。

### 2. 运营与管理 (Operations & Administration)

关于在生产环境中运行、维护和扩展系统的指南。

- **[管理员手册](admin/ADMIN_MANUAL.md)** - Docker、平台配置和系统操作。
- **[操作员 SOP](operations/SOP_OPERATOR.md)** - 针对 NOC 操作员的标准操作程序。
- **[告警处理手册](operations/ALARM_PLAYBOOK.md)** - 事件响应和告警处理协议。
- **[故障排除指南](operations/TROUBLESHOOTING.md)** - 常见问题及解决方案。
- **[部署就绪检查](operations/DEPLOYMENT_READINESS.md)** - 生产环境飞行前检查清单。

### 3. 用户指南 (User Guides)

面向与可视化层交互的最终用户的文档。

- **[用户手册](user/USER_MANUAL.md)** - 如何导航和使用 IMS Grafana 界面。
- **[LDI SPC 指南](architecture/LDI_SPC_GUIDE.md)** - 统计过程控制 (Statistical Process Control) 方法。

### 4. 工程与证据 (Engineering & Evidence)

测试协议、验证和系统可靠性证据。

- **[证据包](evidence/EVIDENCE_PACK.md)** - 性能和浸泡测试 (Soak testing) 证据。
- **[LDI 验证协议](operations/LDI_VALIDATION_PROTOCOL.md)** - 验收测试程序。
- **[扩展测试日志](evidence/SCALE_TEST_2026-08-15.md)** - 100,000 EPS 极限负载测试结果。
- **[安全模型](architecture/SECURITY_MODEL.md)** - 威胁向量和缓解措施。

### 5. 审计与归档 (Audit & Archives)

历史审计和系统快照。

- **[系统全面审计](archive/IMS_FULL_SYSTEM_AUDIT.md)** - 全面的基准审计。
- **[系统信任报告](evidence/SYSTEM_TRUST_REPORT.md)** - 指标保真度验证 (Metric fidelity)。

---

<div align="center">
  <p><i>文档由 IMS 核心工程团队维护</i></p>
  <p><b>精确 • 保真 • 速度 (Precision • Fidelity • Velocity)</b></p>
</div>
