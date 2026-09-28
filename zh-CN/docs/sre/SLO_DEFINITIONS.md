<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 站点可靠性工程 (SRE)：SLI 与 SLO 定义</h1>
  <p><b>仅基于系统当前实际导出的指标构建的服务等级指标、对应目标，以及尚未度量的部分</b></p>
  <p>
    <a href="../../../docs/sre/SLO_DEFINITIONS.md">English</a> |
    <a href="../../../th/docs/sre/SLO_DEFINITIONS.md">ไทย</a> |
    <a href="SLO_DEFINITIONS.md">简体中文</a>
  </p>
</div>

---

> **本页规则：** 下列每条查询都能在按仓库部署的系统上运行。Prometheus 只抓取 blackbox 探测和 Node-RED 的 `/metrics`；采集延迟保存在 TimescaleDB 中（`ingest_ts`，迁移 081）。Grafana、nginx 和 PgBouncer 都不向 Prometheus 导出指标，依赖它们的 SLI 列在第 4 节，状态为**尚未度量**。

---

## 1. 已度量的 SLI 与目标

目标采用滚动 30 天窗口，是为本工厂设定的目标，而非合同保证。

| SLI | 数据来源 | 目标 (SLO) | 30 天错误预算 |
| --- | --- | --- | --- |
| **平台可用性**：对 Grafana、Node-RED、Prometheus 和 Alertmanager 的 blackbox HTTP 探测成功 | Prometheus `probe_success{job="blackbox-http"}` | ≥ 99.9% | 每个目标 43.2 分钟的探测失败 |
| **写入成功率**：未失败的采集写入 | Prometheus `ims_pipeline_inserts_total`、`ims_pipeline_inserts_failed_total` | ≥ 99.9% | 0.1% 的写入 |
| **管道新鲜度**：距上次成功刷写的秒数 | Prometheus `ims_pipeline_last_flush_timestamp_seconds` | 99% 的分钟内 < 120 秒 | 432 分钟超过 120 秒 |
| **采集延迟**：LDI 数据行从源时间戳到数据库提交的时间 | TimescaleDB `ldi_data.ingest_ts - ldi_data.time` | p99 < 2 秒 | 1% 的数据行更慢 |
| **SNMP 轮询存活**：设备轮询正在发生 | Prometheus `ims_pipeline_devices_polled_total` | 速率始终 > 0 | 仅作告警，不计预算 |

---

## 2. 查询

### 2.1 平台可用性

```promql
avg_over_time(probe_success{job="blackbox-http"}[30d]) * 100
```

### 2.2 写入成功率

$$\text{SLI}_{\text{write}} = 1 - \frac{\Delta\,\text{inserts\_failed}}{\Delta\,\text{inserts}}$$

```promql
(1 - sum(increase(ims_pipeline_inserts_failed_total[30d]))
     / clamp_min(sum(increase(ims_pipeline_inserts_total[30d])), 1)) * 100
```

### 2.3 管道新鲜度

```promql
time() - max(ims_pipeline_last_flush_timestamp_seconds)
```

### 2.4 采集延迟（SQL，而非 PromQL）

```sql
SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY extract(epoch FROM ingest_ts - time)) AS p99_seconds,
       count(*) AS rows
FROM public.ldi_data
WHERE time > now() - interval '1 hour' AND ingest_ts IS NOT NULL;
```

仪表板 "Platform — 04 Ingestion Pipeline Latency & Telemetry SLO" 绘制的是同一度量。

### 2.5 SNMP 轮询存活

```promql
sum(rate(ims_pipeline_devices_polled_total[5m]))
```

---

## 3. 已守护这些 SLI 的告警

`monitoring/prometheus/rules/ims-alerts.yml` 中已有以下规则：

| 规则 | 条件 | 守护对象 |
| --- | --- | --- |
| `ServiceDown` | `probe_success == 0` | 可用性 |
| `SLABreachWarning` | `(1 - avg_over_time(probe_success[1h])) * 100 > 0.01` | 可用性 |
| `PipelineDataStalled` | `rate(ims_pipeline_inserts_total[5m]) == 0` | 新鲜度 |
| `PipelineHighErrorRate` | `rate(ims_pipeline_inserts_failed_total[5m]) > 0.1` | 写入成功率 |
| `PipelineDataDegraded` | 写入速率低于其 1 小时平均值的一半 | 写入量 |

多窗口燃尽率告警（例如在 1 小时和 5 分钟窗口上都达到 14.4 倍）是**建议**的下一步，目前还没有燃尽率规则文件。请基于第 2 节的查询构建，切勿使用系统未导出的指标。

---

## 4. 尚未度量

| 期望的 SLI | 缺少的部分 |
| --- | --- |
| 仪表板查询延迟 | 未抓取 Grafana 的 `/metrics` |
| 入口 HTTP 错误率 | nginx 未导出指标（没有 `stub_status` 或 exporter） |
| 连接池饱和度 | 没有 PgBouncer exporter |
| 告警送达延迟（LINE / Teams） | Alertmanager 的通知指标已被抓取，但尚未基于它定义 SLI |

---

## 5. 错误预算策略

| 剩余预算（30 天） | 应对措施 |
| --- | --- |
| > 50% | 正常变更。 |
| 25–50% | 修改 Node-RED 流程和迁移需要第二位审阅者。 |
| < 25% | 只接受修复，非紧急变更延后。 |
| 已耗尽 | 停止功能开发，直到 SLI 恢复；48 小时内完成事后复盘（`docs/sre/postmortems/TEMPLATE.md`）。 |

---

## 6. 命令行检查

```bash
curl -s -G http://127.0.0.1:9090/api/v1/query \
  --data-urlencode 'query=time() - max(ims_pipeline_last_flush_timestamp_seconds)' | jq '.data.result[0].value[1]'

curl -s -G http://127.0.0.1:9090/api/v1/query \
  --data-urlencode 'query=avg_over_time(probe_success{job="blackbox-http"}[1h])' \
  | jq -r '.data.result[] | "\(.metric.instance) \(.value[1])"'
```

Prometheus 只绑定 `127.0.0.1`，请在主机上运行这些命令。
