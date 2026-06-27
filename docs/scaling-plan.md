# Scaling Plan — IMS

## Current Architecture (Single Instance)

```
Node-RED (1 instance) → PgBouncer (1 instance) → TimescaleDB (1 instance)
```

**Capacity**: Tested with K6 at 1,000 VUs, ~65,000 iterations in 2 min. p95 latency ~156ms.

**Ceiling**: ~500 machines at 10s poll interval (50 polls/min × 500 = 2,500 SNMP sessions/min).

## When to Scale

| Metric | Current | Threshold | Action |
|---|---|---|---|
| Node-RED memory | ~150MB | >512MB | Shard walkers across instances |
| PgBouncer connections | 20-50 | >200 | Increase pool size or add replica |
| TimescaleDB disk | ~1GB/day | >100GB | Adjust retention or add storage |
| K6 p95 latency | ~156ms | >500ms | Investigate bottleneck |

## Scale Option 1: Vertical (Easiest)

Increase resources on existing containers:
```yaml
services:
  node-red:
    deploy:
      resources:
        limits:
          memory: 1G
  timescaledb:
    deploy:
      resources:
        limits:
          memory: 2G
```

## Scale Option 2: Horizontal (Node-RED Sharding)

Split SNMP polling across multiple Node-RED instances by machine_id hash:
- Instance A: machines 0-499
- Instance B: machines 500-999

Each instance writes to the same TimescaleDB via PgBouncer.

## Scale Option 3: Replace Node-RED (Long-term)

For 1,000+ machines, consider:
- **Telegraf** fleet for SNMP collection (lighter than Node-RED)
- **Message queue** (Redis Streams / NATS) for ingestion buffering
- **TimescaleDB** stays as storage backend

## PgBouncer Tuning

Current config (edoburu/pgbouncer default):
- `DEFAULT_POOL_SIZE`: 20
- `MAX_CLIENT_CONN`: 100
- `POOL_MODE`: transaction

Recommended for 500+ machines:
- `DEFAULT_POOL_SIZE`: 50
- `MAX_CLIENT_CONN`: 500
- `RESERVE_POOL_SIZE`: 10

## Retention Policy

Current: 90 days raw data, continuous aggregates for minute/hour rollups.

Review: 90 days is appropriate for manufacturing incident investigation (typical QA cycle is 30-60 days). Consider extending to 180 days if regulatory compliance requires longer history.
