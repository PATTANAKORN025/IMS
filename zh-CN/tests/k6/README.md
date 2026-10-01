# IMS K6 负载与压力测试

> **基于 Grafana Labs [K6](https://k6.io/) 的 IMS 平台性能与高负载压测套件**

---

<div align="center">

<img src="../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **K6:** 负载与并发测试
<img src="../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态:** 1K 并发虚拟用户 (VUs) 通过
<img src="../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **失败率:** 0%

</div>

---

## 环境前置准备 (Prerequisites)

```bash
# Windows (choco)
choco install k6

# macOS
brew install k6

# Linux
sudo snap install k6
```

---

## 测试脚本概览 (Test Scripts)

| 测试脚本 | 测试目标 | 默认基准负载 |
| ------------------------- | ------------------------------------------ | -------------------------- |
| `db-write-stress.js` | 经由 PgBouncer 的数据库写入吞吐上限 | 100 台服务器 × 10 秒间隔 |
| `grafana-query-stress.js` | Grafana 看板聚合查询并发性能 | 50 个并发活跃用户 |
| `pipeline-stress.js` | 端到端全链路: SNMP → Node-RED → DB → Grafana | 100 台设备并发摄入 |

---

## 执行测试 (Running Tests)

### 数据库写入高压测试 (Database Write Stress)

```bash
# 默认配置: 100 台服务器，10 秒写入间隔
k6 run tests/k6/db-write-stress.js

# 自定义加压: 500 台服务器，5 秒写入间隔
k6 run tests/k6/db-write-stress.js \
 --env SERVER_COUNT=500 \
 --env WRITE_INTERVAL=5 \
 --env PGHOST=localhost \
 --env PGPORT=6432
```

### Grafana 看板查询压测 (Grafana Query Stress)

```bash
# 默认配置: 50 个并发用户
k6 run tests/k6/grafana-query-stress.js

# 自定义加压: 200 个并发用户
k6 run tests/k6/grafana-query-stress.js \
 --env CONCURRENT_USERS=200 \
 --env GRAFANA_URL=http://localhost:3000 \
 --env GRAFANA_USER=admin \
 --env GRAFANA_PASS=your-password
```

### 全链路端到端压测 (Full Pipeline E2E)

```bash
# 默认配置: 100 台设备
k6 run tests/k6/pipeline-stress.js

# 自定义加压: 1000 台设备
k6 run tests/k6/pipeline-stress.js \
 --env TARGET_SERVERS=1000 \
 --env NODERED_URL=http://localhost:1880
```

---

## 性能 SLO 达标基准 (Performance Targets)

| 核心指标 | SLO 目标 | 实测结果 |
| --------------------- | ------- | ---------------- |
| **数据库写入 P95** | < 500ms | ~156ms |
| **Grafana 查询 P95** | < 3s | < 1s |
| **端到端链路 P95** | < 10s | < 2s |
| **请求成功率** | > 95% | 100% |
| **最大并发 VUs** | 1,000 | 1,000 |
| **总执行迭代次数** | — | 2 分钟内约 65,000 次 |
