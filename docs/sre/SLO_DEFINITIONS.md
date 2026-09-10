# Service Level Objectives (SLO) & Indicators (SLI)

This document defines the reliability targets for the IMS (Industrial Monitoring System) platform.

## 1. Availability (Uptime)
- **SLI**: The percentage of successful HTTP responses (200 OK) from the Node-RED ingestion endpoints and Grafana UI, measured over a 30-day window via synthetic monitoring.
- **SLO**: `99.95%` (approx. 21.6 minutes of allowed downtime per month).
- **Error Budget Policy**: If budget is depleted, feature deployments are frozen; engineering time shifts 100% to reliability.

## 2. Ingestion Latency (Data Pipeline)
- **SLI**: The time elapsed from when Node-RED receives a telemetry payload to when it is queryable in TimescaleDB.
- **SLO**: `99th percentile < 2.0 seconds`.

## 3. Query Performance (Dashboard UX)
- **SLI**: Execution time of Grafana SQL queries against TimescaleDB (Continuous Aggregates and Raw tables).
- **SLO**: `95th percentile < 1.0 second`; `99th percentile < 3.0 seconds`.

## 4. Alarm Delivery Latency
- **SLI**: Time elapsed from a Prometheus alert firing to the webhook delivery (LINE/MS Teams).
- **SLO**: `99.9th percentile < 5.0 seconds`.
