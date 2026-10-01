<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# <img src="../../../docs/assets/icons/folder.svg" width="18" align="center" /> 证据文档 (Evidence Documentation)

欢迎来到 **Evidence** 目录。本节包含与 IMS 证据流程相关的文档。

## <img src="../../../docs/assets/icons/map.svg" width="18" align="center" /> 目录结构图

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: docs/evidence 中的文件
  accDescr: docs/evidence 中的 47 个文档，按字母顺序分列。
  ROOT["docs/evidence"]:::store
  subgraph C0[" "]
    direction TB
    F0["ALARM_LATENCY_MEASUREMENT_NOTE"]:::flow
    F1["BROWSER_E2E_VERIFICATION"]:::flow
    F2["CREDENTIAL_ROTATION_P10R"]:::flow
    F3["CREDENTIAL_ROTATION_P10R8"]:::flow
    F4["CSS_UI_UX_EXCELLENCE_AUDIT"]:::flow
    F5["CSS_UI_UX_EXCELLENCE_FINAL"]:::flow
    F6["CVE_TRIAGE"]:::flow
    F7["DATA_INTEGRITY_VALIDATION_2026-08-15"]:::flow
    F8["DR_DRILL_3_FINDINGS"]:::flow
    F9["EVIDENCE_PACK"]:::flow
    F10["FACTORY_TWIN_3D_DEEP_AUDIT"]:::flow
    F11["FACTORY_TWIN_3D_PERFORMANCE"]:::flow
    F0 ~~~ F1
    F1 ~~~ F2
    F2 ~~~ F3
    F3 ~~~ F4
    F4 ~~~ F5
    F5 ~~~ F6
    F6 ~~~ F7
    F7 ~~~ F8
    F8 ~~~ F9
    F9 ~~~ F10
    F10 ~~~ F11
  end
  ROOT --> C0
  style C0 fill:transparent,stroke:#94a3b8
  subgraph C1[" "]
    direction TB
    F12["FACTORY_TWIN_3D_UX"]:::flow
    F13["FAILURE_DETECTION_MATRIX"]:::flow
    F14["FAULT_INJECTION_PLAN"]:::flow
    F15["FINAL_ACCEPTANCE_MATRIX_2026-08-15"]:::flow
    F16["FINAL_SECURITY_GATE_P11"]:::flow
    F17["FINAL_SECURITY_GATE_P12"]:::flow
    F18["GRAFANA_ANDON_COMPLIANCE_TIMELINE_REDESIGN"]:::flow
    F19["GRAFANA_ANDON_FT_INTEGRATION_RENDER"]:::flow
    F20["GRAFANA_DATA_INTEGRITY_P20_FINAL"]:::flow
    F21["GRAFANA_FRONTEND_EXCELLENCE_AUDIT"]:::flow
    F22["GRAFANA_FRONTEND_EXCELLENCE_FINAL"]:::flow
    F23["GRAFANA_FRONTEND_EXCELLENCE_P15"]:::flow
    F12 ~~~ F13
    F13 ~~~ F14
    F14 ~~~ F15
    F15 ~~~ F16
    F16 ~~~ F17
    F17 ~~~ F18
    F18 ~~~ F19
    F19 ~~~ F20
    F20 ~~~ F21
    F21 ~~~ F22
    F22 ~~~ F23
  end
  ROOT --> C1
  style C1 fill:transparent,stroke:#94a3b8
  subgraph C2[" "]
    direction TB
    F24["GRAFANA_FRONTEND_EXCELLENCE_P15R_AUDIT"]:::flow
    F25["GRAFANA_FRONTEND_EXCELLENCE_P15R_FINAL"]:::flow
    F26["GRAFANA_FRONTEND_EXCELLENCE_P15_FINAL"]:::flow
    F27["GRAFANA_FRONTEND_P16_FINAL"]:::flow
    F28["GRAFANA_FRONTEND_P17_FINAL"]:::flow
    F29["GRAFANA_FRONTEND_P18_FINAL"]:::flow
    F30["HISTORICAL_DATA_RECONCILIATION_2026-08-15"]:::flow
    F31["IMS_SECURITY_AND_INTEGRITY_P21"]:::flow
    F32["INDEX"]:::flow
    F33["KIOSK_LOAD_TEST"]:::flow
    F34["NODERED_4_1_13_VALIDATION"]:::flow
    F35["P11E_PRODUCTION_UPGRADE"]:::flow
    F24 ~~~ F25
    F25 ~~~ F26
    F26 ~~~ F27
    F27 ~~~ F28
    F28 ~~~ F29
    F29 ~~~ F30
    F30 ~~~ F31
    F31 ~~~ F32
    F32 ~~~ F33
    F33 ~~~ F34
    F34 ~~~ F35
  end
  ROOT --> C2
  style C2 fill:transparent,stroke:#94a3b8
  subgraph C3[" "]
    direction TB
    F36["PR22_MAIN_ONLY_COMMITS"]:::flow
    F37["PR22_MAIN_RECONCILIATION"]:::flow
    F38["SCALE_TEST_2026-08-15"]:::flow
    F39["SECURITY_CONTAINER_SCAN"]:::flow
    F40["SECURITY_GATE"]:::flow
    F41["SECURITY_MITIGATION_P7"]:::flow
    F42["SECURITY_REACHABILITY"]:::flow
    F43["SOAK_TEST_LOG"]:::flow
    F44["SYSTEM_TRUST_REPORT"]:::flow
    F45["TELEMETRY_READINESS"]:::flow
    F46["TV_WALL_FIELD_VALIDATION"]:::flow
    F36 ~~~ F37
    F37 ~~~ F38
    F38 ~~~ F39
    F39 ~~~ F40
    F40 ~~~ F41
    F41 ~~~ F42
    F42 ~~~ F43
    F43 ~~~ F44
    F44 ~~~ F45
    F45 ~~~ F46
  end
  ROOT --> C3
  style C3 fill:transparent,stroke:#94a3b8
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

## <img src="../../../docs/assets/icons/file-text.svg" width="18" align="center" /> 文件索引

- [ALARM_LATENCY_MEASUREMENT_NOTE.md](ALARM_LATENCY_MEASUREMENT_NOTE.md)
- [BROWSER_E2E_VERIFICATION.md](BROWSER_E2E_VERIFICATION.md)
- [CREDENTIAL_ROTATION_P10R.md](CREDENTIAL_ROTATION_P10R.md)
- [CREDENTIAL_ROTATION_P10R8.md](CREDENTIAL_ROTATION_P10R8.md)
- [CSS_UI_UX_EXCELLENCE_AUDIT.md](CSS_UI_UX_EXCELLENCE_AUDIT.md)
- [CSS_UI_UX_EXCELLENCE_FINAL.md](CSS_UI_UX_EXCELLENCE_FINAL.md)
- [CVE_TRIAGE.md](CVE_TRIAGE.md)
- [DATA_INTEGRITY_VALIDATION_2026-08-15.md](DATA_INTEGRITY_VALIDATION_2026-08-15.md)
- [DR_DRILL_3_FINDINGS.md](DR_DRILL_3_FINDINGS.md)
- [EVIDENCE_PACK.md](EVIDENCE_PACK.md)
- [FACTORY_TWIN_3D_DEEP_AUDIT.md](FACTORY_TWIN_3D_DEEP_AUDIT.md)
- [FACTORY_TWIN_3D_PERFORMANCE.md](FACTORY_TWIN_3D_PERFORMANCE.md)
- [FACTORY_TWIN_3D_UX.md](FACTORY_TWIN_3D_UX.md)
- [FAILURE_DETECTION_MATRIX.md](FAILURE_DETECTION_MATRIX.md)
- [FAULT_INJECTION_PLAN.md](FAULT_INJECTION_PLAN.md)
- [FINAL_ACCEPTANCE_MATRIX_2026-08-15.md](FINAL_ACCEPTANCE_MATRIX_2026-08-15.md)
- [FINAL_SECURITY_GATE_P11.md](FINAL_SECURITY_GATE_P11.md)
- [FINAL_SECURITY_GATE_P12.md](FINAL_SECURITY_GATE_P12.md)
- [GRAFANA_ANDON_COMPLIANCE_TIMELINE_REDESIGN.md](GRAFANA_ANDON_COMPLIANCE_TIMELINE_REDESIGN.md)
- [GRAFANA_ANDON_FT_INTEGRATION_RENDER.md](GRAFANA_ANDON_FT_INTEGRATION_RENDER.md)
- [GRAFANA_DATA_INTEGRITY_P20_FINAL.md](GRAFANA_DATA_INTEGRITY_P20_FINAL.md)
- [GRAFANA_FRONTEND_EXCELLENCE_AUDIT.md](GRAFANA_FRONTEND_EXCELLENCE_AUDIT.md)
- [GRAFANA_FRONTEND_EXCELLENCE_FINAL.md](GRAFANA_FRONTEND_EXCELLENCE_FINAL.md)
- [GRAFANA_FRONTEND_EXCELLENCE_P15.md](GRAFANA_FRONTEND_EXCELLENCE_P15.md)
- [GRAFANA_FRONTEND_EXCELLENCE_P15R_AUDIT.md](GRAFANA_FRONTEND_EXCELLENCE_P15R_AUDIT.md)
- [GRAFANA_FRONTEND_EXCELLENCE_P15R_FINAL.md](GRAFANA_FRONTEND_EXCELLENCE_P15R_FINAL.md)
- [GRAFANA_FRONTEND_EXCELLENCE_P15_FINAL.md](GRAFANA_FRONTEND_EXCELLENCE_P15_FINAL.md)
- [GRAFANA_FRONTEND_P16_FINAL.md](GRAFANA_FRONTEND_P16_FINAL.md)
- [GRAFANA_FRONTEND_P17_FINAL.md](GRAFANA_FRONTEND_P17_FINAL.md)
- [GRAFANA_FRONTEND_P18_FINAL.md](GRAFANA_FRONTEND_P18_FINAL.md)
- [HISTORICAL_DATA_RECONCILIATION_2026-08-15.md](HISTORICAL_DATA_RECONCILIATION_2026-08-15.md)
- [IMS_SECURITY_AND_INTEGRITY_P21.md](IMS_SECURITY_AND_INTEGRITY_P21.md)
- [INDEX.md](INDEX.md)
- [KIOSK_LOAD_TEST.md](KIOSK_LOAD_TEST.md)
- [NODERED_4_1_13_VALIDATION.md](NODERED_4_1_13_VALIDATION.md)
- [P11E_PRODUCTION_UPGRADE.md](P11E_PRODUCTION_UPGRADE.md)
- [PR22_MAIN_ONLY_COMMITS.md](PR22_MAIN_ONLY_COMMITS.md)
- [PR22_MAIN_RECONCILIATION.md](PR22_MAIN_RECONCILIATION.md)
- [SCALE_TEST_2026-08-15.md](SCALE_TEST_2026-08-15.md)
- [SECURITY_CONTAINER_SCAN.md](SECURITY_CONTAINER_SCAN.md)
- [SECURITY_GATE.md](SECURITY_GATE.md)
- [SECURITY_MITIGATION_P7.md](SECURITY_MITIGATION_P7.md)
- [SECURITY_REACHABILITY.md](SECURITY_REACHABILITY.md)
- [SOAK_TEST_LOG.md](SOAK_TEST_LOG.md)
- [SYSTEM_TRUST_REPORT.md](SYSTEM_TRUST_REPORT.md)
- [TELEMETRY_READINESS.md](TELEMETRY_READINESS.md)
- [TV_WALL_FIELD_VALIDATION.md](TV_WALL_FIELD_VALIDATION.md)
