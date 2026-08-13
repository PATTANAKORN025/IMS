# Product

## Register

product

## Platform

web

## Users

Primary: two distinct operator populations. (1) NOC operators monitoring servers and network devices across data centers — 24/7 shifts, need instant visibility into device health, network bandwidth, and temperature anomalies. (2) LDI manufacturing floor operators and process engineers monitoring the LDI (Laser Direct Imaging) PCB production line — need real-time Andon-board machine status, SPC/Cpk process capability, and RCA (root-cause) correlation between alarms and process parameters. Secondary: SRE and DevOps engineers performing root cause analysis, capacity planning, and pipeline debugging across both domains.

## Product Purpose

Provide a single-pane-of-glass monitoring system spanning two domains — infrastructure and manufacturing — each with its own telemetry pipeline, dashboard set, and alerting. The infrastructure side ingests SNMP metrics from servers and network devices via Node-RED into TimescaleDB, visualized through 4 dashboards (NOC Overview, Engineering Drill-Down, Capacity Forecast, Meta-Monitoring). The manufacturing side ingests LDI machine telemetry (position/judgment error, thickness, scan speed, resist dosage, and more) via HTTP/JSON, visualized through 8 dashboards (Easy Overview, Manufacturing Command Center, Operator Andon Board, Alarm Console, Alarm Dictionary, Engineering Analytics & SPC, Machine Snapshot, Data Readiness) with real SPC (Cpk process capability) and RCA (alarm-to-parameter correlation) analytics. It includes AIOps features (Z-Score anomaly detection on the infrastructure side, circuit breaker failover, predictive capacity forecasting) and alerting via LINE Messaging API and MS Teams with runbook links. Success means zero blind spots — every device, every machine, every anomaly visible within seconds.

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
