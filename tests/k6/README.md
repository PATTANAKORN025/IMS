# 🧪 IMS K6 Stress Testing

> **Load testing scripts สำหรับ IMS ด้วย [K6](https://k6.io/) by Grafana Labs**

---

<div align="center">

![K6](https://img.shields.io/badge/K6-Load%20Testing-red)
![Status](https://img.shields.io/badge/Status-1K%20VUs%20Passed-brightgreen)
![Failure](https://img.shields.io/badge/Failure-0%25-green)

</div>

---

## 📋 Prerequisites

```bash
# Windows (choco)
choco install k6

# macOS
brew install k6

# Linux
sudo snap install k6
```

---

## 📊 Test Scripts

| Script | Purpose | Default Load |
|---|---|---|
| `db-write-stress.js` | Database write throughput via PgBouncer | 100 servers × 10s interval |
| `grafana-query-stress.js` | Grafana dashboard query performance | 50 concurrent users |
| `pipeline-stress.js` | End-to-end: SNMP → Node-RED → DB → Grafana | 100 servers |

---

## 🚀 Running Tests

### Database Write Stress

```bash
# Default: 100 servers, 10s write interval
k6 run tests/k6/db-write-stress.js

# Custom: 500 servers, 5s interval
k6 run tests/k6/db-write-stress.js \
  --env SERVER_COUNT=500 \
  --env WRITE_INTERVAL=5 \
  --env PGHOST=localhost \
  --env PGPORT=6432
```

### Grafana Query Stress

```bash
# Default: 50 concurrent users
k6 run tests/k6/grafana-query-stress.js

# Custom: 200 users
k6 run tests/k6/grafana-query-stress.js \
  --env CONCURRENT_USERS=200 \
  --env GRAFANA_URL=http://localhost:3000 \
  --env GRAFANA_USER=admin \
  --env GRAFANA_PASS=your-password
```

### Full Pipeline E2E

```bash
# Default: 100 servers
k6 run tests/k6/pipeline-stress.js

# Custom: 1000 servers
k6 run tests/k6/pipeline-stress.js \
  --env TARGET_SERVERS=1000 \
  --env NODERED_URL=http://localhost:1880
```

---

## 📈 Performance Targets

| Metric | Target | Actual (Tested) |
|---|---|---|
| **DB Write P95** | < 500ms | ~156ms ✅ |
| **Grafana Query P95** | < 3s | < 1s ✅ |
| **E2E Pipeline P95** | < 10s | < 2s ✅ |
| **Success Rate** | > 95% | 100% ✅ |
| **Max VUs** | 1,000 | 1,000 ✅ |
| **Total Iterations** | — | ~65,000 in 2 min |

---

## 📁 Output

Results are saved to `tests/k6/*-results.json`:

```json
{
  "totalOperations": 65000,
  "successRate": 100,
  "avgLatency": 45,
  "p95Latency": 156,
  "p99Latency": 280,
  "errors": 0
}
```

---

## 🔧 Customization

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SERVER_COUNT` | 100 | Number of simulated servers |
| `WRITE_INTERVAL` | 10 | Seconds between writes |
| `CONCURRENT_USERS` | 50 | Number of concurrent query users |
| `TARGET_SERVERS` | 100 | Servers for pipeline test |
| `PGHOST` | localhost | PostgreSQL host |
| `PGPORT` | 6432 | PgBouncer port |
| `GRAFANA_URL` | http://localhost:3000 | Grafana URL |
| `NODERED_URL` | http://localhost:1880 | Node-RED URL |

---

<div align="center">

**IMS K6 Testing — Version 1.0**

*1,000 VUs | 0% Failure | Production Ready*

</div>
