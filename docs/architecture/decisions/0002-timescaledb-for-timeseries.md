# 2. TimescaleDB for Time-Series Storage

Date: 2026-08-26

## Status
Accepted

## Context
IMS must ingest over 100,000 events per second from LDI machines and retain it for long-term analytics. We evaluated InfluxDB and TimescaleDB.

## Decision
We chose **TimescaleDB**.

## Consequences
- **Pros**: Full SQL support, continuous aggregates native, seamless integration with our existing PostgreSQL tooling (PgBouncer, pgAdmin).
- **Cons**: Higher disk usage overhead compared to InfluxDB.
- **Mitigation**: We will strictly enforce chunk time intervals and data retention policies.
