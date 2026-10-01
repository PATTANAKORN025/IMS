# K6 负载测试——系统实时监测指令

在执行 K6 压测期间，建议在独立终端中分别运行以下监测指令。

## 终端 1: PgBouncer 连接池与队列监控

```bash
# 查看 PgBouncer 当前活动连接池
docker exec ims-pgbouncer psql -p 5432 -U pgbouncer pgbouncer -c "SHOW POOLS;" 2>/dev/null

# 每 2 秒刷新一次连接池状态
watch -n 2 "docker exec ims-pgbouncer psql -p 5432 -U pgbouncer pgbouncer -c 'SHOW POOLS;' 2>/dev/null"

# 查看连接统计数据
docker exec ims-pgbouncer psql -p 5432 -U pgbouncer pgbouncer -c "SHOW STATS;" 2>/dev/null
```

## 终端 2: TimescaleDB CPU/内存与活跃查询

```bash
# 当前活跃查询数及最长耗时查询
watch -n 2 "docker exec ims-timescaledb psql -U ims_admin -d ims -c \"
SELECT count(*) as active_queries,
  max(now() - query_start) as longest_running
FROM pg_stat_activity
WHERE state = 'active' AND datname = 'ims';
\""

# 压测期间实时写入行数统计
watch -n 5 "docker exec ims-timescaledb psql -U ims_admin -d ims -c \"
SELECT 'sys_metrics' as tbl, count(*) FROM public.sys_metrics WHERE time > now() - interval '1 minute'
UNION ALL
SELECT 'net_metrics', count(*) FROM public.net_metrics WHERE time > now() - interval '1 minute'
UNION ALL
SELECT 'ldi_metrics', count(*) FROM public.ldi_metrics WHERE time > now() - interval '1 minute';
\""

# 数据库占用磁盘空间
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT pg_size_pretty(pg_database_size('ims'));"
```

## 终端 3: Docker 容器资源占用

```bash
# 监测全量容器 CPU 与内存开销快照
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" --no-stream

# 持续动态刷新
watch -n 2 "docker stats --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}' --no-stream"
```

## 终端 4: Node-RED 流水线运行健康

```bash
# 监测流水线吞吐与熔断器指标 (写入/秒、错误计数、熔断状态)
curl -s http://localhost:1880/metrics 2>/dev/null | grep -E "ims_pipeline|ims_circuit"

# 过滤 Node-RED 错误日志
docker logs ims-node-red --tail 50 2>&1 | grep -i "error\|fail\|timeout"

# 实时监测熔断器触发
watch -n 5 "curl -s http://localhost:1880/metrics 2>/dev/null | grep ims_circuit_breaker"
```

## 各测试阶段预期指标基准

| 阶段 | 并发 VUs | 预期响应时长 | 预期成功率 |
| ----------------- | ------ | ----------------- | --------------------- |
| 预热 (0→50) | 1-50 | < 200ms | > 99% |
| 持续稳定 (50) | 50 | < 300ms | > 99% |
| 加压 (50→200) | 50-200 | < 500ms | > 95% |
| 峰值 (200) | 200 | < 800ms | > 95% |
| 冷却降压 (200→0) | 200→0 | < 500ms | > 95% |

## 系统瓶颈诊断矩阵

| 现象表现 | 潜在瓶颈根因 | 调优解决措施 |
| ------------------------ | ------------------------- | --------------------------- |
| 响应耗时突增 > 2s | PgBouncer 连接池耗尽 | 增加 `MAX_CLIENT_CONN` |
| timescaledb CPU > 80% | 复杂查询导致负载过载 | 补充索引或调大 `work_mem` |
| 触发熔断器 Circuit breaker | 目标设备超时级联 | 已预置调优（断开阈值 = 2） |
| node-red 网络 IO 尖峰 | 解析器处于 CPU 密集瓶颈 | 针对 `parseAll` 热路径进行画像优化 |
