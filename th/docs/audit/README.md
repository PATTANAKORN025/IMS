<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# <img src="../../../docs/assets/icons/folder.svg" width="18" align="center" /> เอกสารการตรวจสอบ (Audit Documentation)

ยินดีต้อนรับสู่ไดเรกทอรี **Audit** ส่วนนี้ประกอบด้วยเอกสารที่เกี่ยวข้องกับกระบวนการตรวจสอบของ IMS

## <img src="../../../docs/assets/icons/map.svg" width="18" align="center" /> แผนผังไดเรกทอรี

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: ไฟล์ใน docs/audit
  accDescr: เอกสาร 16 ไฟล์ใน docs/audit เรียงตามตัวอักษรเป็นคอลัมน์
  ROOT["docs/audit"]:::store
  subgraph C0[" "]
    direction TB
    F0["ALARM_TAXONOMY_REVIEW_2026-08-14"]:::flow
    F1["EAP_SCADA_FLOOR1_FINAL_AUDIT"]:::flow
    F2["FT17_5_FINDINGS"]:::flow
    F3["FT17_5_FIX_MATRIX"]:::flow
    F4["FT17_5_REGRESSION"]:::flow
    F5["FT17_5_SYSTEM_DEEP_AUDIT"]:::flow
    F6["LDI_ALARM_FIDELITY_AUDIT"]:::flow
    F7["LDI_SIMULATOR_REDESIGN_RESULTS"]:::flow
    F8["READ_ONLY_AUDIT_2026-08-15"]:::flow
    F9["SIMULATOR_REALISM_AUDIT_2026-08-15"]:::flow
    F10["dashboard-correctness-gap-analysis-20260824"]:::flow
    F11["dashboard-performance-final"]:::flow
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
    F12["dashboard-production-audit"]:::flow
    F13["dashboard-traceability-test"]:::flow
    F14["dashboard-work-status-20260821"]:::flow
    F15["grafana13-audit-report"]:::flow
    F12 ~~~ F13
    F13 ~~~ F14
    F14 ~~~ F15
  end
  ROOT --> C1
  style C1 fill:transparent,stroke:#94a3b8
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

## <img src="../../../docs/assets/icons/file-text.svg" width="18" align="center" /> ดัชนีไฟล์

- [ALARM_TAXONOMY_REVIEW_2026-08-14.md](ALARM_TAXONOMY_REVIEW_2026-08-14.md)
- [EAP_SCADA_FLOOR1_FINAL_AUDIT.md](EAP_SCADA_FLOOR1_FINAL_AUDIT.md)
- [FT17_5_FINDINGS.md](FT17_5_FINDINGS.md)
- [FT17_5_FIX_MATRIX.md](FT17_5_FIX_MATRIX.md)
- [FT17_5_REGRESSION.md](FT17_5_REGRESSION.md)
- [FT17_5_SYSTEM_DEEP_AUDIT.md](FT17_5_SYSTEM_DEEP_AUDIT.md)
- [LDI_ALARM_FIDELITY_AUDIT.md](LDI_ALARM_FIDELITY_AUDIT.md)
- [LDI_SIMULATOR_REDESIGN_RESULTS.md](LDI_SIMULATOR_REDESIGN_RESULTS.md)
- [READ_ONLY_AUDIT_2026-08-15.md](READ_ONLY_AUDIT_2026-08-15.md)
- [SIMULATOR_REALISM_AUDIT_2026-08-15.md](SIMULATOR_REALISM_AUDIT_2026-08-15.md)
- [dashboard-correctness-gap-analysis-20260824.md](dashboard-correctness-gap-analysis-20260824.md)
- [dashboard-performance-final.md](dashboard-performance-final.md)
- [dashboard-production-audit.md](dashboard-production-audit.md)
- [dashboard-traceability-test.md](dashboard-traceability-test.md)
- [dashboard-work-status-20260821.md](dashboard-work-status-20260821.md)
- [grafana13-audit-report.md](grafana13-audit-report.md)
