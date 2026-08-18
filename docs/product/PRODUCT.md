# Product

> **Audience:** Plant Managers, Product Owners, Sales/Marketing.
> **Objective:** Defines the product vision, brand personality, and high-level platform capabilities.
> **Provenance:** Validated against the live monitoring system and business objectives on 2026-08-10.

The IMS (Industrial Monitoring System) bridges the critical visibility gap between traditional IT infrastructure and PCB manufacturing floor operations. By replacing reactive manual inspection with continuous, automated telemetry, IMS acts as a direct multiplier for operational efficiency and equipment uptime.

- **Risk Mitigation:** Prevents catastrophic failures via sub-10-second anomaly detection (Z-Score AIOps) before hardware thresholds are breached.
- **Cost Avoidance:** Zero-license open-source architecture eliminates the massive recurring fees (THB 3M-10M annually) typical of enterprise monitoring software.
- **Operational Scalability:** Automates manual data logging (saving 2,920 man-hours annually), allowing operators to shift from reactive monitoring to proactive maintenance.
- **Root-Cause Agility:** Reduces Mean Time to Resolution (MTTR) from hours to minutes through direct correlation of machine alarms with process parameters (e.g., LDI laser intensity and position errors).

## Register

product

## Platform

web

## Users

Primary: Two distinct operator populations.
- **NOC Operators:** Monitoring servers and network devices across data centers.
  - **Environment:** 24/7 shifts.
  - **Needs:** Rapid visibility into device health, network bandwidth, and temperature anomalies.
- **LDI Floor Operators & Process Engineers:** Monitoring the PCB production line.
  - **Environment:** Factory floor.
  - **Needs:** Live Andon-board status, SPC/Cpk process capability, and RCA (Root-Cause Analysis) correlation between alarms and parameters.

Secondary: 
- **SRE and DevOps Engineers:** Performing root cause analysis, capacity planning, and pipeline debugging across both domains.

## Product Purpose

Provide a single-pane-of-glass monitoring system spanning two domains — infrastructure and manufacturing — each with its own telemetry pipeline, dashboard set, and alerting.

**Infrastructure Domain:**
- **Ingestion:** SNMP metrics from servers/network devices via Node-RED into TimescaleDB.
- **Visualization:** 5 Dashboards (NOC Overview, Engineering Drill-Down, Capacity Forecast, Meta-Monitoring, Ingestion Latency).
- **AIOps:** Z-Score anomaly detection, circuit breaker degradation, predictive capacity forecasting.

**Manufacturing Domain:**
- **Ingestion:** LDI machine telemetry (position/judgment error, thickness, scan speed, resist dosage) via HTTP/JSON.
- **Visualization:** 10 Dashboards (Easy Overview, Manufacturing Command Center, Operator Andon Board, Alarm Console, Alarm Dictionary, Engineering Analytics & SPC, Machine Snapshot, Data Readiness, Factory Digital Twin, Alarm Response).
- **Analytics:** Real SPC (Cpk process capability) and RCA (alarm-to-parameter correlation) analytics.

**Alerting & Success Criteria:**
- **Notifications:** LINE Messaging API and MS Teams with direct runbook links.
- **Success Criteria:** Comprehensive visibility — critical devices, machines, and anomalies are visible within seconds.

## Positioning

Industrial-grade monitoring that understands both server and network switch hardware, with self-healing pipeline architecture that survives device failures without operator intervention.

## Brand Personality

**Precision, Resilience, Authority.** The system speaks with the confidence of a mature industrial platform — no decoration for its own sake, no playful flourishes. Every color has a semantic meaning (red=critical, yellow=warning, green=healthy). The dark theme reflects a 24/7 NOC environment where operators stare at screens under fluorescent lighting. Typography is monospaced for numerical data to prevent jitter during live updates.

## Anti-references

- Generic SaaS dashboards with bright white backgrounds and rainbow color palettes
- Consumer-grade monitoring tools with cartoonish icons and rounded-everything design
- Bootstrap/Material Design admin templates (too generic, no industrial identity)
- Grafana default dark theme without customization (looks like every other Grafana instance)
- Marketing-heavy dashboards that prioritize aesthetics over data density

## Design Principles

1. **Semantic color, never decorative.** Every color maps to an operational state, from one approved 8-token palette shared by every dashboard (`docs/architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1): `#ef4444`=critical, `#f59e0b`=warning, `#22c55e`=ok, `#eab308`=severity-minor, `#3b82f6`=accent, `#00f2fe`=info, `#64748b`=no_data, `#4a5568`=forecast. Never use color for decoration alone — enforced at commit time by `dashboard-linter.js` Check 15.
2. **Data density over whitespace.** NOC operators need maximum information per screen pixel. Empty space is wasted space in an operational context.
3. **Zero cognitive load for anomalies.** An unhealthy device should be immediately obvious through color, position, or motion — never require reading numbers to detect a problem.
4. **Self-healing by design.** The system detects and recovers from failures (circuit breakers, retry queues, degraded ingestion) without human intervention. The dashboard reflects this resilience.
5. **Monospaced truth.** All numerical data uses monospaced fonts to prevent layout shifts during live updates. The numbers are the product.

## Accessibility & Inclusion

WCAG 2.1 AA compliance target. Color combinations meet 4.5:1 contrast ratio against dark backgrounds. All critical alerts have text labels alongside color indicators (not color-only). Reduced motion support via CSS `prefers-reduced-motion`. Screen reader compatibility for panel descriptions and alert annotations.

---
[⬅️ Back to Main Repository](../../README.md)
