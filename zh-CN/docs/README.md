<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <img src="../../docs/assets/icons/book.svg" width="64" alt="Docs Logo" style="filter: drop-shadow(0 0 12px rgba(0, 242, 254, 0.6));" />
  <h1>IMS 文档索引</h1>
  <p><b>工业监控系统知识库中心</b></p>
  <p>
    <a href="../../docs/README.md"><img src="../../docs/assets/icons/gb-us.svg" width="16" align="center"/> English</a> |
    <a href="../../th/docs/README.md"><img src="../../docs/assets/icons/th.svg" width="16" align="center"/> ไทย</a> |
    <a href="README.md"><img src="../../docs/assets/icons/cn.svg" width="16" align="center"/> 简体中文</a>
  </p>
</div>

---

> [!TIP]
> **本索引的组织方式。** 文档按从整体到细节的顺序排列。**现行文档**（手册、运维手册、架构）描述当前 `main` 分支的状态。**证据与审计记录**（`evidence/`、`audit/`、`archive/`）是带日期的快照：记录当日的测量结果，事后不再改写。泰文（`th/`）与简体中文（`zh-CN/`）目录与英文目录结构一致；现行文档全文翻译，带日期的记录保留英文原文，并附本地化说明。

## <img src="../../docs/assets/icons/book.svg" width="18" align="center" /> 目录

### 1. 产品与架构

高层设计、业务价值与产品能力。

- **[产品概览](product/README.md)** - 功能与整体生态。
- **[仪表板生态](product/DASHBOARD_ECOSYSTEM.md)** - 已预置的 22 个 Grafana 仪表板如何协同工作。
- **[Architecture Book](architecture/IMS_PLATFORM_BOOK.md)** - 全栈技术架构与术语表。
- **[架构](architecture/ARCHITECTURE.md)** - 系统上下文、服务、约束与架构决策。
- **[数据流](architecture/DATA_FLOW.md)** - 从边缘到可视化的遥测流水线。
- **[数据库结构](architecture/DATABASE_SCHEMA.md)** - TimescaleDB hypertable 结构（自动生成）。
- **[Dashboard Inventory](architecture/DASHBOARD_INVENTORY.md)** - 每个仪表板及其面板数量（自动生成）。
- **[业务 ROI](business/BUSINESS_VALUE_ROI.md)** - 业务影响与投资回报。

### 2. Factory Twin 与设备集成 (EAP)

一楼数字孪生、其证据模型以及设备运行地图。这些文档不包含任何企业私有 CAD 数据，只公开数量、规则与结论。

- **[Factory Twin 操作员指南](architecture/FACTORY_TWIN_OPERATOR_GUIDE.md)** - 如何正确解读孪生而不过度解读：视图、图层、证据图例、检查器。
- **[Factory Twin 运行时架构](architecture/FACTORY_TWIN_ARCHITECTURE.md)** - 请求路径、模块图、HTTP 接口、渲染与视图语义。
- **[Factory Twin 服务架构](architecture/FACTORY_TWIN_SERVICE_ARCHITECTURE.md)** - 由哪个容器提供孪生服务，以及如何安全地进行直连模式验证。
- **[Factory Twin 安全模型](architecture/FACTORY_TWIN_SECURITY_MODEL.md)** - 信任边界、401 要求、响应整形与私有几何数据处理。
- **[Factory Twin 证据要求](architecture/FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)** - 哪些内容被阻塞、如何解锁，以及证据升级契约。
- **[Factory Twin 重建](architecture/FACTORY_TWIN_RECONSTRUCTION.md)** - 一楼孪生如何重建，以及它不能宣称的内容。
- **[Factory Twin 呈现模型](architecture/FACTORY_TWIN_PRESENTATION_MODEL.md)** - 为便于理解而绘制的几何，以及它为何永远不能成为证据。
- **[Factory Twin 数据溯源](architecture/FACTORY_TWIN_PROVENANCE.md)** - 四个命名空间、分类词汇，以及为何尚不存在 IMS 空间映射。
- **[Factory Twin 视觉保真度](architecture/FACTORY_TWIN_VISUAL_FIDELITY.md)** - 示意图视图与参考渲染的吻合程度。
- **[Factory Twin 视觉 QA](architecture/FACTORY_TWIN_VISUAL_QA.md)** - 可重复的视觉与性能 QA 流程及基线。
- **[Floor 1 DXF Forensic Audit](architecture/FLOOR1_DXF_FORENSIC_AUDIT.md)** - CAD 源文件包含什么，以及坐标系如何推导（不公开实际尺寸）。
- **[设备集成 (EAP) 架构](architecture/EAP_ARCHITECTURE.md)** - SNMP、HTTP/JSON 与 SECS/GEM 适配器契约。
- **EAP 运行地图** - 规格、数据血缘与验证报告位于 [`eap/`](eap/)；一楼节点模型、普查与渲染器文档位于本目录（`eap-*.md`、`equipment-*.md`、`machine-node-census-floor1.md`）。

### 3. 运维与管理

在生产环境中运行、维护与扩展系统的指南。

- **[运维手册（Runbook）](operations-runbook.md)** - 日常栈运维与恢复命令。
- **[管理员手册](admin/ADMIN_MANUAL.md)** - Docker、平台配置与系统运维。
- **[操作员 SOP](operations/SOP_OPERATOR.md)** - NOC 操作员标准作业程序。
- **[告警手册](operations/ALARM_PLAYBOOK.md)** - 事件响应与告警处理规程。
- **[事件响应](operations/INCIDENT_RESPONSE.md)** - 严重级别框架与真实事件案例。
- **[故障排除指南](operations/TROUBLESHOOTING.md)** - 常见问题与解决方法。
- **[备份与恢复](operations/BACKUP_RESTORE.md)** 与 **[DR 测试计划](operations/DR_TEST_PLAN.md)** - 恢复流程与演练。
- **[部署就绪度](operations/DEPLOYMENT_READINESS.md)** 与 **[发布检查清单](operations/RELEASE_CHECKLIST.md)** - 投产前检查。
- **[扩容计划](operations/SCALING_PLAN.md)** - 实测上限与后续扩容步骤。
- **[生产就绪度](../PRODUCTION-READINESS.md)** - 发布闸门状态与未关闭风险。

### 4. 用户指南

面向使用可视化界面的最终用户的文档。

- **[用户手册](user/USER_MANUAL.md)** - 如何浏览与使用 IMS 的 Grafana 界面。
- **[LDI SPC 指南](architecture/LDI_SPC_GUIDE.md)** - 统计过程控制方法。
- **[LDI RCA 指南](architecture/LDI_RCA_GUIDE.md)** - 根因关联方法。
- **制造分析规格** - Command Center、SPC、预测与决策 UX 的规格及验证报告，位于 [`analytics/`](analytics/)。

### 5. 工程与证据

测试规程、验证结果以及系统可靠性证据。

- **[证据索引](evidence/INDEX.md)** - 所有带日期的证据记录汇总。
- **[Evidence Pack](evidence/EVIDENCE_PACK.md)** - 性能与浸泡测试证据。
- **[LDI 验证规程](operations/LDI_VALIDATION_PROTOCOL.md)** - 验收测试流程。
- **[扩展测试日志](evidence/SCALE_TEST_2026-08-15.md)** - 受控的 k6 扩展测试：至 250 台模拟设备成功率 100 %，500 台时开始失败（瓶颈为 Node-RED CPU）。
- **[安全模型](architecture/SECURITY_MODEL.md)** - 威胁向量与缓解措施。
- **UX 规格与审计** - 位于 [`ux/`](ux/)。

### 6. 审计与归档

历史审计与系统快照。

- **[审计索引](audit/README.md)** - 带日期的审计报告。
- **[Full System Audit](archive/IMS_FULL_SYSTEM_AUDIT.md)** - 全系统基线审计。
- **[System Trust Report](evidence/SYSTEM_TRUST_REPORT.md)** - 指标保真度验证。
- **[变更日志](../CHANGELOG.md)** - 发布与合并历史。

### 7. 开发与集成

系统工程、维护与集成的蓝图。

- **[开发者指南](developer/LOCAL_DEVELOPMENT.md)** - 本地环境搭建。
- **[API 参考](api/API_REFERENCE.md)** - 数据接入与 webhook API 契约。
- **[架构决策记录 (ADR)](architecture/decisions/)** - 历史技术选型。
- **[服务等级目标 (SLO)](sre/SLO_DEFINITIONS.md)** - 可靠性、错误预算与 SLI。
- **[遥测本体](data/TELEMETRY_ONTOLOGY.md)** - 数据字典与载荷标准。
- **[钻孔与 VCP 合成数据](data/MOCK_DATA.md)** - 使用生成的数据运行钻孔和 VCP 仪表板，无需工厂数据。

### 8. 治理

安全、事件复盘与文档质量的框架。

- **[数据治理](data/DATA_GOVERNANCE.md)** - 数据生命周期、PII 脱敏与合规。
- **[供应链安全](security/SUPPLY_CHAIN_POLICY.md)** - SBOM 与依赖策略。
- **[事后复盘框架](sre/postmortems/TEMPLATE.md)** - 无责事件 RCA 模板。
- **[文档风格指南](DOCUMENTATION_STYLE_GUIDE.md)** - 知识库的编辑标准。

---

<div align="center">
  <p><i>文档由 IMS 核心工程团队维护</i></p>
  <p><b>Precision • Fidelity • Velocity</b></p>
</div>
