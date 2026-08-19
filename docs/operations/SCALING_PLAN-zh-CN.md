<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS 扩展计划

> **为了适应不断增加的工作负载而制定的 IMS 扩展计划**
> 专为 1-1000+ 台机器设计

---

<div align="center">

<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **规模：** 1-1000+ 台机器
<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **现状：** 已在 1K 虚拟用户 (VUs) 下测试
<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **上限：** ~500 台机器

</div>

---

## 目录

1. [当前架构](#current-architecture)
2. [容量分析](#capacity-analysis)
3. [扩展选项](#scaling-options)
4. [性能调优](#performance-tuning)
5. [保留策略](#retention-policy)
6. [成本估算](#cost-estimation)
7. [数据保真度与扩展管理（架构详情）](../architecture/DATA_FIDELITY_AND_SCALING-zh-CN.md)

---

## 当前架构

### 单实例部署

```text
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Node-RED │────│ PgBouncer │────│ TimescaleDB │
│ (1 个实例) │  │ (1 个实例) │  │ (1 个实例) │
│ ~150MB │  │ 20-50 个连接 │  │ ~1GB/天 │
└─────────────┘  └─────────────┘  └─────────────┘
```

### 当前容量

| 指标              | 值                  | 测试状态 |
| ----------------- | ------------------- | -------- |
| **负载测试 (K6)** | 1,000 个虚拟用户    | 已通过   |
| **迭代次数**      | 2 分钟内 ~65,000 次 | 已验证   |
| **p95 延迟**      | ~156ms              | 已测量   |
| **每小时数据点**  | 每台机器 ~600 个    | 已计算   |
| **每小时存储**    | 每台机器 ~50 KB     | 已验证   |

---

## 容量分析

### 上限计算

```text
当前容量：
- Node-RED：1 个实例，5 个并发轮询器 (walkers)
- 每个轮询器：每个轮询周期 1 个 SNMP 会话
- 轮询间隔：30 秒
- 最大并发会话数：~100（已测试）

扩展系数：
- 500 台机器 × 30秒间隔 = 500 个会话/30秒 = 1,000 个会话/分钟
- 使用 5 个并发轮询器：1,000 / 5 = 每个轮询器每分钟 200 个会话

上限：在 10 秒轮询间隔下约为 500 台机器
- 500 台机器 × 6 次轮询/分钟 = 3,000 个会话/分钟
- 使用 5 个并发轮询器：3,000 / 5 = 每个轮询器每分钟 600 个会话
```

### 扩展触发条件

| 指标                     | 当前     | 警告      | 严重      | 措施                       |
| ------------------------ | -------- | --------- | --------- | -------------------------- |
| **Node-RED 内存**        | ~150MB   | >512MB    | >1GB      | 在实例之间对轮询器进行分片 |
| **PgBouncer 连接数**     | 20-50    | >200      | >500      | 增加连接池大小或添加副本   |
| **TimescaleDB 磁盘使用** | ~1GB/天  | >100GB    | >500GB    | 调整保留策略或增加存储     |
| **K6 p95 延迟**          | ~156ms   | >500ms    | >1s       | 调查瓶颈原因               |
| **CPU 负载 (Node-RED)**  | <30%     | >70%      | >90%      | 添加实例或进行优化         |
| **网络带宽**             | <10 Mbps | >100 Mbps | >500 Mbps | 升级网络或压缩数据         |

---

## 扩展选项

### 选项 1：垂直扩展（最简单）

**适用场景：** 用于 50-100 台机器的快速成效方案，最小化代码更改。

```yaml
# docker-compose.yaml 补充配置
services:
  node-red:
  deploy:
    resources:
    limits:
      memory: 1G
      cpus: "2.0"
  environment:
    - NODE_OPTIONS=--max-old-space-size=800

  timescaledb:
  deploy:
    resources:
    limits:
      memory: 4G
      cpus: "4.0"
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

**优势：**

- 无需修改代码
- 风险极小
- 实施快捷

**局限性：**

- 存在单点故障风险
- 最终会达到硬件极限

### 选项 2：水平扩展（Node-RED 分片）

**适用场景：** 100-500 台机器，需要高可用性。

```text
┌─────────────────────────────────────────────────────────────────┐
│      负载均衡器 (nginx)      │
└─────────────────────────────────────────────────────────────────┘
        │
   ┌─────────────────┼─────────────────┐
   ▼     ▼     ▼
 ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
 │ Node-RED A │ │ Node-RED B │ │ Node-RED C │
 │ 机器 0-166    │ │ 机器 167-333  │ │ 机器 334-500  │
 └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
   │     │     │
   └─────────────────┼─────────────────┘
        ▼
     ┌───────────────┐
     │ PgBouncer │
     └───────┬───────┘
       ▼
     ┌───────────────┐
     │ TimescaleDB │
     │ (主节点)    │
     └───────────────┘
```

**实施：**

```javascript
// 设备注册表分片逻辑
const shardCount = 3;
const shardIndex = hash(machine_id) % shardCount;

// 每个 Node-RED 实例只处理其分片
if (shardIndex === MY_SHARD_INDEX) {
  // 处理此机器
} else {
  // 跳过 - 交由其他实例处理
}
```

**优势：**

- 线性可扩展性
- 高可用性（无单点故障）
- 收集器可以独立扩展

**局限性：**

- 需要负载均衡器
- 部署更加复杂
- 实例间的状态管理

### 选项 3：替换 Node-RED（长期方案，1000+ 台机器）

**适用场景：** 企业级规模，需要专用的监控栈。

```text
┌─────────────────────────────────────────────────────────────────┐
│     Telegraf 舰队 (1000+ 代理)     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │Telegraf 1│ │Telegraf 2│ │Telegraf 3│ │Telegraf N│   │
│ │SNMP  │ │SNMP  │ │SNMP  │ │SNMP  │   │
│ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
└───────┼─────────────┼───────────┼─────────────┼────────────────┘
  │    │   │    │
  └─────────────┼───────────┼─────────────┘
      ▼   ▼
    ┌───────────────────────┐
    │ Redis Streams  │
    │ (摄取缓冲区)   │
    └───────────┬───────────┘
       ▼
    ┌───────────────────────┐
    │  TimescaleDB  │
    │ (存储后端)     │
    └───────────────────────┘
```

**优势：**

- 专为指标收集而构建
- 资源占用低于 Node-RED
- 更好的水平扩展能力
- 行业标准工具

**局限性：**

- 需要大量的重写工作
- 失去了 Node-RED 的可视化管道
- 运维复杂性更高

---

## 性能调优

### TimescaleDB 优化

```sql
-- 增加 shared_buffers 以适应更大数据集
ALTER SYSTEM SET shared_buffers = '2GB';

-- 优化 work_mem 以支持复杂查询
ALTER SYSTEM SET work_mem = '256MB';

-- 启用并行查询执行
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;

-- 优化检查点频率
ALTER SYSTEM SET checkpoint_timeout = '15min';
ALTER SYSTEM SET max_wal_size = '2GB';

-- 应用更改
SELECT pg_reload_conf();
```

### PgBouncer 调优

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

### Node-RED 优化

```javascript
// settings.js 优化
module.exports = {
  flowFile: "flows.json",
  credentialSecret: process.env.CREDENTIAL_SECRET,
  editorTheme: {
    projects: {
      enabled: false, // 禁用以提升性能
    },
  },
  // 增加内存限制
  max_old_space_size: 800,
};
```

---

## 保留策略

### 当前配置

| 数据类型         | 保留期限 | 原因         |
| ---------------- | -------- | ------------ |
| **原始遥测数据** | 30 天    | 制造 QA 周期 |
| **分钟聚合数据** | 1 年     | 长期趋势分析 |
| **小时聚合数据** | 2 年     | 容量规划     |
| **警报历史记录** | 90 天    | 事故调查     |

### 保留管理

```sql
-- 删除超过 30 天的原始数据
SELECT drop_chunks('public.sys_metrics', INTERVAL '30 days');

-- 删除超过 30 天的原始数据 (net_metrics)
SELECT drop_chunks('public.net_metrics', INTERVAL '30 days');

-- 删除超过 30 天的原始数据 (ldi_metrics)
SELECT drop_chunks('public.ldi_metrics', INTERVAL '30 days');

-- 自动化保留策略 (在 001-init-timescaledb.sql 中设置)
SELECT add_retention_policy('public.sys_metrics', INTERVAL '30 days');
SELECT add_retention_policy('public.net_metrics', INTERVAL '30 days');
SELECT add_retention_policy('public.ldi_metrics', INTERVAL '30 days');
```

### 扩展注意事项

| 规模       | 机器数量 | 存储/天 | 存储/月 | 推荐的保留策略              |
| ---------- | -------- | ------- | ------- | --------------------------- |
| **小型**   | 1-10     | ~1 MB   | ~30 MB  | 30 天                       |
| **中型**   | 10-50    | ~10 MB  | ~300 MB | 30 天                       |
| **大型**   | 50-200   | ~50 MB  | ~1.5 GB | 30 天                       |
| **企业级** | 200-1000 | ~500 MB | ~15 GB  | 30 天（原始），1 年（聚合） |

---

## 成本估算

### 基础设施成本（云部署）

| 组件                     | 小型（10 台机器） | 中型（100 台机器） | 企业级（1000 台机器） |
| ------------------------ | ----------------- | ------------------ | --------------------- |
| **计算 (Node-RED)**      | $50/月            | $200/月            | $1,000/月             |
| **数据库 (TimescaleDB)** | $100/月           | $500/月            | $3,000/月             |
| **存储**                 | $10/月            | $50/月             | $500/月               |
| **网络**                 | $20/月            | $100/月            | $500/月               |
| **总计**                 | **$180/月**       | **$850/月**        | **$5,000/月**         |

### 本地部署成本

| 组件           | 小型       | 中型        | 企业级      |
| -------------- | ---------- | ----------- | ----------- |
| **服务器硬件** | $2,000     | $10,000     | $50,000     |
| **网络交换机** | $500       | $2,000      | $10,000     |
| **年度维护**   | $500       | $2,000      | $10,000     |
| **第一年总计** | **$3,000** | **$14,000** | **$70,000** |

### 投资回报率 (ROI) 计算

```text
当前手动监控成本：
- 2 名员工 × 8 小时/天 × $25/小时 × 30 天 = $12,000/月

自动化监控成本（中型规模）：
- 基础设施：$850/月
- 员工时间（已减少）：2 小时/天 × $25/小时 × 30 天 = $1,500/月
- 总计：$2,350/月

每月节省：$12,000 - $2,350 = $9,650/月
每年节省：$115,800/年
ROI：850%（第一年）
```

---

<div align="center">

**IMS 扩展计划 — 版本 1.0**

_专为 1-1000+ 台机器规模设计_

</div>
