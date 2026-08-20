<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 备份与恢复

> **受众：** SRE/运维团队、QA/审计团队。
> **目标：** 提供经过验证的数据库备份与恢复流程。
> **出处：** 以下流程来源于 `scripts/dr-test.sh` 中的 `backup-restore` 演练，于 2026-08-10 进行了实际执行并记录了证据。

---

## 备份流程

```bash
docker exec ims-timescaledb pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup.sql
```

从生产数据库中提取的未压缩 `pg_dump` 快照。**实际测量性能**（2026-08-10，约 52,800 行 `ldi_data` + 约 1,025 个 `devices` + 约 10,400 行 `ldi_alarm_log`）：**1 秒，22.3 MB**。`pg_dump` 会发出关于 `continuous_agg` 上的循环外键约束的警告 —— 对于此技术栈（TimescaleDB 自身的目录表）来说，这是预料之中且无害的，并不意味着转储文件损坏。

## 恢复流程

```bash
docker exec ims-timescaledb psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ims_dr_test;"
docker exec -i ims-timescaledb psql -U "$POSTGRES_USER" -d ims_dr_test < backup.sql
```

**实际测量性能：** 相同数据集大小需时 18 秒。

## 验证：行数区间限定，而非完全相等

这是一个**实时摄取系统** —— 模拟器在不断写入数据。简单的“恢复数量 == 实时数量”检查会产生偏差，因为在快照操作期间会有数据写入。`scripts/dr-test.sh` 正确处理了这一问题：它捕获快照_之前_和_之后_的行数，然后验证恢复的数量是否落入该区间内（包含边界值）。这一行为在灾难恢复（DR）测试期间得到了验证 —— 验证脚本正确地在快照操作前后对实时数量进行了区间限定。

```bash
./scripts/dr-test.sh backup-restore
```

运行完整的端到端演练：转储、限定实时数量区间、恢复到临时验证数据库 `ims_dr_test` 中（**绝不触碰实时数据库**）、验证，然后删除临时数据库。2026-08-10 实际结果：**通过 (PASS)** —— `devices=1025 ldi_data=52795→52796 (bracket) alarm_log=10405`，恢复数量 `52795` 落入该区间。

## 备份/恢复 _不_ 涵盖的内容

- **普通的恢复操作不会自动重新填充连续聚合 (Continuous aggregates) 和物化视图 (materialized views)** —— `pg_dump` 的输出包含它们的定义，但在 CAGGs 刷新之前，新的恢复目标需要运行 TimescaleDB 扩展和后台作业调度程序。如需进行完整的环境重建（不仅仅是数据），请参阅 `docs/operations/DR_TEST_PLAN.md` 中的 Full-Stack Recreate 演练。
- **Grafana 仪表板、警报规则和库面板** 是基于文件配置的（`monitoring/grafana/`），并不存储在数据库中 —— 在容器启动时，它们会自动从代码仓库自身的跟踪文件中恢复，而不是从数据库备份中恢复。
- **Node-RED 流程** 同样基于文件（`nodered_data/flows/`），不属于数据库备份的一部分。

仅仅进行数据库备份并不构成完整的灾难恢复计划 —— 有关完整图景，请参阅 `docs/operations/DR_TEST_PLAN.md` 和 `docs/operations/INCIDENT_RESPONSE.md`，其中包括此系统自身 DR 测试发现的实际可靠性差距（容器重启策略无法可靠地从进程终止中恢复 —— 见下文）。

## 系统约束与运维注意事项

在 2026-08-10 的 DR 测试中，发现在此环境下模拟进程终止后，`ims-timescaledb` 的 `restart: unless-stopped` 策略存在特定的恢复行为（通过实时 `docker events` 流确认）。备份是恢复的基础，而数据库进程的恢复同样关键。有关系统约束与技术边界，请参阅 `ARCHITECTURE.md`，有关手动恢复流程，请参阅 `docs/operations/INCIDENT_RESPONSE.md`。

## 相关文档

- `docs/operations/DR_TEST_PLAN.md` — 完整的包含 3 个演练的灾难恢复测试计划（备份/恢复为演练 1）。
- `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` — 这些演练的原始证据记录。
- `docs/architecture/DATA_RETENTION.md` — 数据保留策略不是备份策略；请了解两者区别。
- `docs/operations/INCIDENT_RESPONSE.md` — 实际发生这种情况时该怎么做。

---

[⬅️ 返回 IMS 平台手册](../../../docs/architecture/IMS_PLATFORM_BOOK.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码仓库](../../../README.md)
