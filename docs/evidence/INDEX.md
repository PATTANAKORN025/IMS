# IMS Evidence Index

This document serves as the central registry linking architectural claims to verifiable evidence files (runtime logs, database policies, etc.). It acts as the single source of truth for all claims made in the documentation.

> **KPI-level evidence** (latency, DR, soak, alarm realism) lives in `EVIDENCE_PACK.md`. **Pass/fail verdict** against the 8 production-grade criteria lives in `SYSTEM_TRUST_REPORT.md`.

## Core Capabilities Evidence

| Capability Claim                     | Evidence Location                                                                  | Description                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local Simulator Environment**      | [`runtime/compose-ps-20260813.txt`](runtime/compose-ps-20260813.txt)               | Output of `docker compose ps` verifying that the system runs completely contained using `ims-snmpsim` without external production dependencies. |
| **Telemetry Ingestion via Node-RED** | [`runtime/nodered-ingestion-20260813.txt`](runtime/nodered-ingestion-20260813.txt) | Log excerpt showing successful `Batch INSERT` into `sys_metrics` and `ldi_alarm_log` from Node-RED bulk SNMP polling.                           |
| **Continuous Aggregation**           | [`runtime/cagg-policies-20260813.txt`](runtime/cagg-policies-20260813.txt)         | Output of the TimescaleDB Continuous Aggregates registry proving hourly, daily, and weekly rollups exist in the database.                       |

## Verification Procedures

Evidence should be periodically updated whenever major architectural changes occur. To generate updated evidence, run the following commands:

```bash
# Docker Stack Evidence
docker compose ps > docs/evidence/runtime/compose-ps-$(date +%Y%m%d).txt

# TimescaleDB CAGG Evidence
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT view_name, schedule_interval, config FROM timescaledb_information.jobs j JOIN timescaledb_information.continuous_aggregates c ON j.hypertable_name = c.materialization_hypertable_name;" > docs/evidence/runtime/cagg-policies-$(date +%Y%m%d).txt

# Node-RED Ingestion Evidence
docker compose logs node-red | Select-String "simulated|SNMP|inserted|Batch INSERT" -Context 0, 5 | Select-Object -First 20 > docs/evidence/runtime/nodered-ingestion-$(date +%Y%m%d).txt
```
