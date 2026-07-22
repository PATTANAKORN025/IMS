# Product

## Register

product

## Platform

web

## Users

Primary: NOC operators monitoring 1000+ industrial devices (Linux servers, Juniper EX4000 switches) across factory floors and data centers. They work 24/7 shifts, need instant visibility into device health, network bandwidth, temperature anomalies, and LDI manufacturing metrics. Secondary: SRE and DevOps engineers performing root cause analysis, capacity planning, and pipeline debugging.

## Product Purpose

Provide a single-pane-of-glass monitoring system that transforms raw SNMP telemetry into actionable operational intelligence. The system ingests metrics from 1000+ devices via Node-RED, stores them in TimescaleDB with continuous aggregation and retention policies, and visualizes them through 4 specialized Grafana dashboards (NOC Overview, Engineering Drill-down, Capacity Forecast, Meta-Monitoring). It includes AIOps features (Z-Score anomaly detection, circuit breaker failover, predictive capacity forecasting) and alerting via LINE/Slack with runbook links. Success means zero blind spots — every device, every metric, every anomaly visible within seconds.

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

1. **Semantic color, never decorative.** Every color maps to an operational state: #FF4D4D=critical, #FFD93D=warning, #2DFF8B=healthy. Never use color for decoration alone.
2. **Data density over whitespace.** NOC operators need maximum information per screen pixel. Empty space is wasted space in an operational context.
3. **Zero cognitive load for anomalies.** An unhealthy device should be immediately obvious through color, position, or motion — never require reading numbers to detect a problem.
4. **Self-healing by design.** The system detects and recovers from failures (circuit breakers, retry queues, degraded ingestion) without human intervention. The dashboard reflects this resilience.
5. **Monospaced truth.** All numerical data uses monospaced fonts to prevent layout shifts during live updates. The numbers are the product.

## Accessibility & Inclusion

WCAG 2.1 AA compliance target. Color combinations meet 4.5:1 contrast ratio against dark backgrounds. All critical alerts have text labels alongside color indicators (not color-only). Reduced motion support via CSS `prefers-reduced-motion`. Screen reader compatibility for panel descriptions and alert annotations.
