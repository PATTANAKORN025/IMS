# K6 Load Test — Monitoring Commands

Run these commands in separate terminals DURING the K6 test.

## Terminal 1: PgBouncer Connections & Queue

```bash
# Active connections in PgBouncer
docker exec ims-pgbouncer psql -p 5432 -U pgbouncer pgbouncer -c "SHOW POOLS;" 2>/dev/null

# Watch connections every 2 seconds
watch -n 2 "docker exec ims-pgbouncer psql -p 5432 -U pgbouncer pgbouncer -c 'SHOW POOLS;' 2>/dev/null"

# Connection stats
docker exec ims-pgbouncer psql -p 5432 -U pgbouncer pgbouncer -c "SHOW STATS;" 2>/dev/null
```

## Terminal 2: TimescaleDB CPU/RAM + Active Queries

```bash
# Active queries count + longest running
watch -n 2 "docker exec ims-timescaledb psql -U ims_admin -d ims -c \"
SELECT count(*) as active_queries,
       max(now() - query_start) as longest_running
FROM pg_stat_activity
WHERE state = 'active' AND datname = 'ims';
\""

# Table row counts (live during test)
watch -n 5 "docker exec ims-timescaledb psql -U ims_admin -d ims -c \"
SELECT 'sys_metrics' as tbl, count(*) FROM public.sys_metrics WHERE time > now() - interval '1 minute'
UNION ALL
SELECT 'net_metrics', count(*) FROM public.net_metrics WHERE time > now() - interval '1 minute'
UNION ALL
SELECT 'ldi_metrics', count(*) FROM public.ldi_metrics WHERE time > now() - interval '1 minute';
\""

# Database size
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT pg_size_pretty(pg_database_size('ims'));"
```

## Terminal 3: Docker Container Resources

```bash
# Watch CPU/RAM of all containers
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" --no-stream

# Continuous monitoring
watch -n 2 "docker stats --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}' --no-stream"
```

## Terminal 4: Node-RED Pipeline Health

```bash
# Watch pipeline metrics (inserts/sec, errors, circuit breaker)
curl -s http://localhost:1880/metrics 2>/dev/null | grep -E "ims_pipeline|ims_circuit"

# Node-RED log (filter for errors only)
docker logs ims-node-red --tail 50 2>&1 | grep -i "error\|fail\|timeout"

# Watch for circuit breaker trips
watch -n 5 "curl -s http://localhost:1880/metrics 2>/dev/null | grep ims_circuit_breaker"
```

## Expected Results at Each Phase

| Phase | VUs | Expected Duration | Expected Success Rate |
|-------|-----|-------------------|----------------------|
| Warm-up (0→50) | 1-50 | < 200ms | > 99% |
| Sustained (50) | 50 | < 300ms | > 99% |
| Stress (50→200) | 50-200 | < 500ms | > 95% |
| Peak (200) | 200 | < 800ms | > 95% |
| Cool-down (200→0) | 200→0 | < 500ms | > 95% |

## Bottleneck Indicators

| Symptom | Likely Bottleneck | Fix |
|---------|-------------------|-----|
| Duration spikes > 2s | PgBouncer pool exhaustion | Increase MAX_CLIENT_CONN |
| CPU > 80% on timescaledb | Query overload | Add indexes, tune work_mem |
| Circuit breaker trips | Device timeout cascade | Already tuned (threshold=2) |
| Net IO spike on node-red | Parser CPU-bound | Profile parseAll hotpath |
