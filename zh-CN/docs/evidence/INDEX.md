<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS Evidence Index

本文档作为将架构声明（architectural claims）与可验证的证据文件（运行时日志、数据库策略等）相关联的中央注册表。它作为文档中所有声明的唯一事实来源。

> **KPI 级证据**（延迟、灾难恢复 (DR)、浸泡测试 (soak)、报警真实性）存放在 `EVIDENCE_PACK.md` 中。针对 8 项生产级标准的 **通过/失败判定** 存放在 `SYSTEM_TRUST_REPORT.md` 中。

## Core Capabilities Evidence

| Capability Claim                     | Evidence Location                                                                  | Description                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local Simulator Environment**      | [`runtime/compose-ps-20260813.txt`](../../../docs/evidence/runtime/compose-ps-20260813.txt)               | `docker compose ps` 的输出，验证系统完全在使用 `ims-snmpsim` 的受控环境中运行，而不依赖外部生产环境。                                               |
| **Telemetry Ingestion via Node-RED** | [`runtime/nodered-ingestion-20260813.txt`](../../../docs/evidence/runtime/nodered-ingestion-20260813.txt) | 日志摘录，显示通过 Node-RED 批量 SNMP 轮询成功向 `sys_metrics` 和 `ldi_alarm_log` 执行了 `Batch INSERT` 操作。                                    |
| **Continuous Aggregation**           | [`runtime/cagg-policies-20260813.txt`](../../../docs/evidence/runtime/cagg-policies-20260813.txt)         | TimescaleDB 持续聚合（Continuous Aggregates）注册表的输出，证明数据库中存在每小时、每天和每周的数据汇总（rollups）。                               |

## Verification Procedures

每当发生重大架构更改时，应定期更新证据。要生成更新的证据，请运行以下命令：

```bash
# Docker Stack Evidence
docker compose ps > docs/evidence/runtime/compose-ps-$(date +%Y%m%d).txt

# TimescaleDB CAGG Evidence
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT view_name, schedule_interval, config FROM timescaledb_information.jobs j JOIN timescaledb_information.continuous_aggregates c ON j.hypertable_name = c.materialization_hypertable_name;" > docs/evidence/runtime/cagg-policies-$(date +%Y%m%d).txt

# Node-RED Ingestion Evidence
docker compose logs node-red | Select-String "simulated|SNMP|inserted|Batch INSERT" -Context 0, 5 | Select-Object -First 20 > docs/evidence/runtime/nodered-ingestion-$(date +%Y%m%d).txt
```
