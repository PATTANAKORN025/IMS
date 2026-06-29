# 📈 IMS Scaling Plan

> **แผนการขยายระบบ IMS สำหรับรองรับปริมาณงานที่เพิ่มขึ้น**
> ออกแบบสำหรับ 1-1000+ machines

---

<div align="center">

![Scale](https://img.shields.io/badge/Scale-1--1000%2B%20Machines-blue)
![Current](https://img.shields.io/badge/Current-Tested%201K%20VUs-brightgreen)
![Ceiling](https://img.shields.io/badge/Ceiling-~500%20Machines-yellow)

</div>

---

## 📋 Table of Contents

1. [Current Architecture](#-current-architecture)
2. [Capacity Analysis](#-capacity-analysis)
3. [Scaling Options](#-scaling-options)
4. [Performance Tuning](#-performance-tuning)
5. [Retention Policy](#-retention-policy)
6. [Cost Estimation](#-cost-estimation)

---

## 🏗️ Current Architecture

### Single Instance Deployment

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Node-RED   │────▶│  PgBouncer  │────▶│ TimescaleDB │
│ (1 instance)│     │ (1 instance)│     │ (1 instance)│
│   ~150MB    │     │  20-50 conn │     │  ~1GB/day   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Current Capacity

| Metric | Value | Tested |
|---|---|---|
| **Load Test (K6)** | 1,000 VUs | ✅ Passed |
| **Iterations** | ~65,000 in 2 min | ✅ Verified |
| **p95 Latency** | ~156ms | ✅ Measured |
| **Data Points/Hour** | ~600 per machine | ✅ Calculated |
| **Storage/Hour** | ~50 KB per machine | ✅ Verified |

---

## 📊 Capacity Analysis

### Ceiling Calculation

```
Current Capacity:
- Node-RED: 1 instance, 5 parallel walkers
- Each walker: 1 SNMP session per poll cycle
- Poll interval: 30 seconds
- Max concurrent sessions: ~100 (tested)

Scaling Factor:
- 500 machines × 30s interval = 500 sessions/30s = 1,000 sessions/min
- With 5 parallel walkers: 1,000 / 5 = 200 sessions per walker per minute

Ceiling: ~500 machines at 10s poll interval
- 500 machines × 6 polls/min = 3,000 sessions/min
- With 5 parallel walkers: 3,000 / 5 = 600 sessions per walker per minute
```

### Scaling Triggers

| Metric | Current | Warning | Critical | Action |
|---|---|---|---|---|
| **Node-RED Memory** | ~150MB | >512MB | >1GB | Shard walkers across instances |
| **PgBouncer Connections** | 20-50 | >200 | >500 | Increase pool size or add replica |
| **TimescaleDB Disk** | ~1GB/day | >100GB | >500GB | Adjust retention or add storage |
| **K6 p95 Latency** | ~156ms | >500ms | >1s | Investigate bottleneck |
| **CPU Load (Node-RED)** | <30% | >70% | >90% | Add instances or optimize |
| **Network Bandwidth** | <10 Mbps | >100 Mbps | >500 Mbps | Upgrade network or compress |

---

## 🚀 Scaling Options

### Option 1: Vertical Scaling (Easiest)

**When to use:** Quick win for 50-100 machines, minimal code changes.

```yaml
# docker-compose.yaml additions
services:
  node-red:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '2.0'
    environment:
      - NODE_OPTIONS=--max-old-space-size=800

  timescaledb:
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '4.0'
    command: >
      postgres
      -c shared_buffers=2GB
      -c work_mem=256MB
      -c max_parallel_workers_per_gather=4

  pgbouncer:
    environment:
      - DEFAULT_POOL_SIZE=50
      - MAX_CLIENT_CONN=500
      - RESERVE_POOL_SIZE=10
```

**Benefits:**
- No code changes required
- Minimal risk
- Quick implementation

**Limitations:**
- Single point of failure
- Hardware ceiling reached eventually

### Option 2: Horizontal Scaling (Node-RED Sharding)

**When to use:** 100-500 machines, need high availability.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Load Balancer (nginx)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │  Node-RED A   │ │  Node-RED B   │ │  Node-RED C   │
    │ Machines 0-166│ │Machines 167-333│ │Machines 334-500│
    └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
                    ┌───────────────┐
                    │   PgBouncer   │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │  TimescaleDB  │
                    │  (Primary)    │
                    └───────────────┘
```

**Implementation:**
```javascript
// Device Registry sharding logic
const shardCount = 3;
const shardIndex = hash(machine_id) % shardCount;

// Each Node-RED instance only processes its shard
if (shardIndex === MY_SHARD_INDEX) {
    // Process this machine
} else {
    // Skip - another instance handles this
}
```

**Benefits:**
- Linear scalability
- High availability (no single point of failure)
- Independent scaling of collectors

**Limitations:**
- Requires load balancer
- More complex deployment
- State management across instances

### Option 3: Replace Node-RED (Long-term, 1000+ machines)

**When to use:** Enterprise scale, need dedicated monitoring stack.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Telegraf Fleet (1000+ agents)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │Telegraf 1│ │Telegraf 2│ │Telegraf 3│ │Telegraf N│          │
│  │SNMP      │ │SNMP      │ │SNMP      │ │SNMP      │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
└───────┼─────────────┼───────────┼─────────────┼────────────────┘
        │             │           │             │
        └─────────────┼───────────┼─────────────┘
                      ▼           ▼
              ┌───────────────────────┐
              │    Redis Streams      │
              │  (Ingestion Buffer)   │
              └───────────┬───────────┘
                          ▼
              ┌───────────────────────┐
              │     TimescaleDB       │
              │   (Storage Backend)   │
              └───────────────────────┘
```

**Benefits:**
- Purpose-built for metrics collection
- Lighter resource usage than Node-RED
- Better horizontal scaling
- Industry-standard tooling

**Limitations:**
- Requires significant rewrite
- Loss of Node-RED visual pipeline
- Higher operational complexity

---

## ⚡ Performance Tuning

### TimescaleDB Optimization

```sql
-- Increase shared_buffers for larger datasets
ALTER SYSTEM SET shared_buffers = '2GB';

-- Optimize work_mem for complex queries
ALTER SYSTEM SET work_mem = '256MB';

-- Enable parallel query execution
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;

-- Optimize checkpoint frequency
ALTER SYSTEM SET checkpoint_timeout = '15min';
ALTER SYSTEM SET max_wal_size = '2GB';

-- Apply changes
SELECT pg_reload_conf();
```

### PgBouncer Tuning

```ini
# pgbouncer.ini
[databases]
ims = host=timescaledb port=5432 dbname=ims

[pgbouncer]
pool_mode = transaction
default_pool_size = 50
max_client_conn = 500
reserve_pool_size = 10
reserve_pool_timeout = 5
server_idle_timeout = 600
client_idle_timeout = 0
```

### Node-RED Optimization

```javascript
// settings.js optimizations
module.exports = {
    flowFile: 'flows.json',
    credentialSecret: process.env.CREDENTIAL_SECRET,
    editorTheme: {
        projects: {
            enabled: false  // Disable for performance
        }
    },
    // Increase memory limit
    max_old_space_size: 800
};
```

---

## 🗄️ Retention Policy

### Current Configuration

| Data Type | Retention | Reason |
|---|---|---|
| **Raw Telemetry** | 90 days | Manufacturing QA cycle (30-60 days) |
| **Minute Aggregates** | 1 year | Long-term trending |
| **Hour Aggregates** | 2 years | Capacity planning |
| **Alert History** | 90 days | Incident investigation |

### Retention Management

```sql
-- Drop raw data older than 90 days
SELECT drop_chunks('public.machine_telemetry', INTERVAL '90 days');

-- Drop minute aggregates older than 1 year
SELECT drop_chunks('public.telemetry_minute_summary', INTERVAL '1 year');

-- Automated retention policy
SELECT add_retention_policy('public.machine_telemetry', INTERVAL '90 days');
```

### Scaling Considerations

| Scale | Machines | Storage/Day | Storage/Month | Recommended Retention |
|---|---|---|---|---|
| **Small** | 1-10 | ~1 MB | ~30 MB | 90 days |
| **Medium** | 10-50 | ~10 MB | ~300 MB | 90 days |
| **Large** | 50-200 | ~50 MB | ~1.5 GB | 60 days |
| **Enterprise** | 200-1000 | ~500 MB | ~15 GB | 30 days (raw), 1 year (aggregates) |

---

## 💰 Cost Estimation

### Infrastructure Costs (Cloud Deployment)

| Component | Small (10 machines) | Medium (100 machines) | Enterprise (1000 machines) |
|---|---|---|---|
| **Compute (Node-RED)** | $50/mo | $200/mo | $1,000/mo |
| **Database (TimescaleDB)** | $100/mo | $500/mo | $3,000/mo |
| **Storage** | $10/mo | $50/mo | $500/mo |
| **Network** | $20/mo | $100/mo | $500/mo |
| **Total** | **$180/mo** | **$850/mo** | **$5,000/mo** |

### On-Premise Costs

| Component | Small | Medium | Enterprise |
|---|---|---|---|
| **Server Hardware** | $2,000 | $10,000 | $50,000 |
| **Network Switch** | $500 | $2,000 | $10,000 |
| **Annual Maintenance** | $500 | $2,000 | $10,000 |
| **Total Year 1** | **$3,000** | **$14,000** | **$70,000** |

### ROI Calculation

```
Current Manual Monitoring Cost:
- 2 staff × 8 hours/day × $25/hour × 30 days = $12,000/month

Automated Monitoring Cost (Medium scale):
- Infrastructure: $850/month
- Staff time (reduced): 2 hours/day × $25/hour × 30 days = $1,500/month
- Total: $2,350/month

Monthly Savings: $12,000 - $2,350 = $9,650/month
Annual Savings: $115,800/year
ROI: 850% (Year 1)
```

---

<div align="center">

**IMS Scaling Plan — Version 1.0**

*Designed for 1-1000+ Machine Scale*

</div>
