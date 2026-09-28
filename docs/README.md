<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <img src="assets/icons/book.svg" width="64" alt="Docs Logo" style="filter: drop-shadow(0 0 12px rgba(0, 242, 254, 0.6));" />
  <h1>IMS Documentation Index</h1>
  <p><b>Central hub for the Industrial Monitoring System knowledge base</b></p>
  <p>
    <a href="README.md"><img src="assets/icons/gb-us.svg" width="16" align="center"/> English</a> |
    <a href="../th/docs/README.md"><img src="assets/icons/th.svg" width="16" align="center"/> ไทย</a> |
    <a href="../zh-CN/docs/README.md"><img src="assets/icons/cn.svg" width="16" align="center"/> 简体中文</a>
  </p>
</div>

---

> [!TIP]
> **How this index is organised.** Documents run from the big picture down to the detail. **Living documents** (manuals, runbooks, architecture) describe the current `main` branch. **Evidence and audit records** (`evidence/`, `audit/`, `archive/`) are dated snapshots: they record what was measured on that date and are not rewritten afterwards. The Thai (`th/`) and Simplified Chinese (`zh-CN/`) trees mirror this one; living documents are translated in full, and dated records keep the English text behind a localized notice.

## <img src="assets/icons/book.svg" width="18" align="center" /> Table of Contents

### 1. Product & Architecture

The high-level design, business value, and product capabilities.

- **[Product Overview](product/README.md)** - Features and ecosystem.
- **[Dashboard Ecosystem](product/DASHBOARD_ECOSYSTEM.md)** - How the 15 provisioned Grafana dashboards fit together.
- **[Architecture Book](architecture/IMS_PLATFORM_BOOK.md)** - Full-stack technical architecture and glossary.
- **[Architecture](architecture/ARCHITECTURE.md)** - System context, services, constraints and decisions.
- **[Data Flow](architecture/DATA_FLOW.md)** - Telemetry pipeline from edge to visualization.
- **[Database Schema](architecture/DATABASE_SCHEMA.md)** - TimescaleDB hypertable structures (generated).
- **[Dashboard Inventory](architecture/DASHBOARD_INVENTORY.md)** - Every dashboard with its panel count (generated).
- **[Business ROI](business/BUSINESS_VALUE_ROI.md)** - Business impact and return on investment.

### 2. Factory Twin & Equipment Integration (EAP)

The Floor 1 digital twin, its evidence model, and the equipment operational map. Private CAD data never appears in these documents; they publish counts, rules and verdicts only.

- **[Factory Twin Operator Guide](architecture/FACTORY_TWIN_OPERATOR_GUIDE.md)** - How to read the twin without over-reading it: views, layers, evidence legend, inspector.
- **[Factory Twin Runtime Architecture](architecture/FACTORY_TWIN_ARCHITECTURE.md)** - Request path, module map, HTTP surface, rendering and view semantics.
- **[Factory Twin Service Architecture](architecture/FACTORY_TWIN_SERVICE_ARCHITECTURE.md)** - Which container serves the twin and how to run direct-mode verification safely.
- **[Factory Twin Security Model](architecture/FACTORY_TWIN_SECURITY_MODEL.md)** - Trust boundaries, the 401 requirement, response shaping, private geometry handling.
- **[Factory Twin Evidence Requirements](architecture/FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)** - What is blocked, what would unlock it, and the evidence promotion contract.
- **[Factory Twin Reconstruction](architecture/FACTORY_TWIN_RECONSTRUCTION.md)** - How the Floor 1 twin was reconstructed and what it may not claim.
- **[Factory Twin Presentation Model](architecture/FACTORY_TWIN_PRESENTATION_MODEL.md)** - Geometry drawn to be understood, and why it can never become evidence.
- **[Factory Twin Provenance](architecture/FACTORY_TWIN_PROVENANCE.md)** - The four namespaces, the classification vocabulary, and why no spatial IMS mapping exists.
- **[Factory Twin Visual Fidelity](architecture/FACTORY_TWIN_VISUAL_FIDELITY.md)** - How closely the schematic view reproduces its reference renders.
- **[Factory Twin Visual QA](architecture/FACTORY_TWIN_VISUAL_QA.md)** - Repeatable visual and performance QA procedure and baseline.
- **[Floor 1 DXF Forensic Audit](architecture/FLOOR1_DXF_FORENSIC_AUDIT.md)** - What the CAD source contains and how the coordinate frame was derived (dimensions withheld).
- **[Equipment Integration (EAP) Architecture](architecture/EAP_ARCHITECTURE.md)** - SNMP, HTTP/JSON and SECS/GEM adapter contracts.
- **EAP operational map** - Specifications, lineage and validation under [`eap/`](eap/), plus the Floor 1 node model, census and renderer documents in this folder (`eap-*.md`, `equipment-*.md`, `machine-node-census-floor1.md`).

### 3. Operations & Administration

Guides for running, maintaining, and scaling the system in production.

- **[Operations Runbook](operations-runbook.md)** - Day-to-day stack operations and recovery commands.
- **[Administrator Manual](admin/ADMIN_MANUAL.md)** - Docker, platform config, and system ops.
- **[Operator SOP](operations/SOP_OPERATOR.md)** - Standard operating procedures for NOC operators.
- **[Alarm Playbook](operations/ALARM_PLAYBOOK.md)** - Incident response and alarm handling protocols.
- **[Incident Response](operations/INCIDENT_RESPONSE.md)** - Severity framework and worked incidents.
- **[Troubleshooting Guide](operations/TROUBLESHOOTING.md)** - Common issues and resolutions.
- **[Backup & Restore](operations/BACKUP_RESTORE.md)** and **[DR Test Plan](operations/DR_TEST_PLAN.md)** - Recovery procedure and drills.
- **[Deployment Readiness](operations/DEPLOYMENT_READINESS.md)** and **[Release Checklist](operations/RELEASE_CHECKLIST.md)** - Pre-flight checks for production.
- **[Scaling Plan](operations/SCALING_PLAN.md)** - Measured limits and the next scaling steps.
- **[Production Readiness](../PRODUCTION-READINESS.md)** - Release gate status and open risks.

### 4. User Guides

Documentation for end-users interacting with the visual layer.

- **[User Manual](user/USER_MANUAL.md)** - How to navigate and use the IMS Grafana interface.
- **[LDI SPC Guide](architecture/LDI_SPC_GUIDE.md)** - Statistical Process Control methodology.
- **[LDI RCA Guide](architecture/LDI_RCA_GUIDE.md)** - Root-cause correlation methodology.
- **Manufacturing analytics specifications** - Command Center, SPC, predictive and decision-UX specifications with their validation reports under [`analytics/`](analytics/).

### 5. Engineering & Evidence

Test protocols, validations, and evidence of system reliability.

- **[Evidence Index](evidence/INDEX.md)** - Every dated evidence record in one list.
- **[Evidence Pack](evidence/EVIDENCE_PACK.md)** - Performance and soak testing evidence.
- **[LDI Validation Protocol](operations/LDI_VALIDATION_PROTOCOL.md)** - Acceptance test procedures.
- **[Scale Test Log](evidence/SCALE_TEST_2026-08-15.md)** - Controlled k6 scale test: 100 % success up to 250 simulated devices, first failures at 500 (Node-RED CPU-bound).
- **[Security Model](architecture/SECURITY_MODEL.md)** - Threat vectors and mitigations.
- **UX specifications and audits** - Under [`ux/`](ux/).

### 6. Audit & Archives

Historical audits and system snapshots.

- **[Audit Index](audit/README.md)** - Dated audit reports.
- **[Full System Audit](archive/IMS_FULL_SYSTEM_AUDIT.md)** - Comprehensive baseline audit.
- **[System Trust Report](evidence/SYSTEM_TRUST_REPORT.md)** - Metric fidelity validation.
- **[Changelog](../CHANGELOG.md)** - Release and merge history.

### 7. Developer & Integration

The blueprints for engineering, maintaining, and integrating with the system.

- **[Developer Guide](developer/LOCAL_DEVELOPMENT.md)** - Local environment setup.
- **[API Reference](api/API_REFERENCE.md)** - Ingestion and webhook API contracts.
- **[Architecture Decisions (ADRs)](architecture/decisions/)** - Historical technology choices.
- **[Service Level Objectives (SLO)](sre/SLO_DEFINITIONS.md)** - Reliability, error budgets, and SLIs.
- **[Telemetry Ontology](data/TELEMETRY_ONTOLOGY.md)** - Data dictionaries and payload standards.
- **[Synthetic Drilling and VCP Data](data/MOCK_DATA.md)** - Run the drilling and VCP dashboards on generated data, with no factory data.

### 8. Governance

Frameworks for security, incident learning, and documentation quality.

- **[Data Governance](data/DATA_GOVERNANCE.md)** - Data lifecycle, PII masking, and compliance.
- **[Supply Chain Security](security/SUPPLY_CHAIN_POLICY.md)** - SBOM and dependency policies.
- **[Post-Mortem Framework](sre/postmortems/TEMPLATE.md)** - Blameless incident RCA template.
- **[Docs Style Guide](DOCUMENTATION_STYLE_GUIDE.md)** - Editorial standards for the knowledge base.

---

<div align="center">
  <p><i>Documentation maintained by the IMS Core Engineering Team</i></p>
  <p><b>Precision • Fidelity • Velocity</b></p>
</div>
