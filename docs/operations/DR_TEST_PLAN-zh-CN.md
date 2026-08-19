<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Disaster Recovery Test Plan (灾难恢复测试计划)

> 根据 `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §6。通过 `scripts/dr-test.sh` 运行三次演练，参照 `scripts/soak-test-report.sh` 的模式：在真实的运行堆栈上执行真实命令，记录真实时间，无模拟输出。

## Drill 1 — Backup / Restore (演练 1 — 备份与恢复)

`./scripts/dr-test.sh backup-restore`

使用 `pg_dump` 备份正在运行的 `ims` 数据库，将其恢复到一个临时的 `ims_dr_test` 验证数据库（不触及任何实时数据），对比生产环境和恢复环境中 `devices`/`ldi_data`/`ldi_alarm_log` 的行数，然后删除该临时数据库。通过标准：**行数区间匹配，而非精确匹配** — 这是一个不断摄取实时数据的系统，因此 `scripts/dr-test.sh` 会在快照前后捕获计数，并验证恢复的计数值是否落入该区间范围内（请参阅 `docs/operations/BACKUP_RESTORE.md` 了解为何最初尝试精确匹配会产生假阴性验证结果的原因）。

## Drill 2 — Single-Container-Loss Recovery (演练 2 — 单容器丢失恢复)

`./scripts/dr-test.sh container-loss timescaledb` (或 `node-red`)

直接强制关闭指定的容器，在最多 120 秒的时间内轮询检查 Docker 的 `restart: unless-stopped` 策略是否能将其恢复至 `running`（运行中）状态。这直接验证了本次会话中可靠性修复所依赖的相同自愈机制（本会话早先修复的 Node-RED pg.Pool 看门狗假定容器自身能恢复；此演练证实了该假设，而非将其作为隐含条件）。通过标准：容器在 120 秒内达到 `running` 状态。

## Drill 3 — Full-Stack Recreate (演练 3 — 全堆栈重建)

`./scripts/dr-test.sh full-recreate --confirm-destroy`

**破坏性操作 — 需要显式传入 `--confirm-destroy`。** 运行 `docker compose down -v` (删除每个命名卷：`timescaledb_data`、`prometheus_data`、`alertmanager_data`、`grafana_data`)，从 `docker-compose.yaml` 重建整个堆栈，运行迁移，并从演练 1 中生成的备份进行恢复。如果不带该标志，此演练将被跳过并给出解释，而不会静默运行 — 因为它会破坏所运行环境中的任何实时状态，所以只有在确有此意图时（一个真正干净的环境，或者明确批准当前状态可丢弃）才应运行它。

**2026-08-13 修复**（在首次真实运行中发现，同日排查出根本原因并修复 — 完整故事详见 `docs/evidence/DR_DRILL_3_FINDINGS.md`）：在 `db-migrate` 运行之前，`postgres/init/034-ldi-statistical-mock.sql` 会自动将过时的模拟数据集植入任何新卷中，导致迁移操作遇到与预期不符的架构状态；此外，演练的恢复步骤还将一个完整的 `pg_dump` 恢复到已迁移完成的数据库中，而一旦涉及连续聚合 (continuous aggregates)，TimescaleDB 就无法可靠地支持这种操作。修复方法是：删除过时的初始化种子数据，并重写 `drill_full_recreate`，使其在 `db-migrate` 仅根据 `database/migrations/` 构建架构后，仅恢复原始行数据（不包括架构）。验证结果：在 3 次运行中有 2 次干净通过（第 3 次遇到了与大量本地重复测试相关的 Postgres 崩溃，而非修复本身的问题 — 详见发现文档）。现在，该演练已成为 DR 预案中正常的、预期能通过的环节，不再是已知的遗漏。

## Evidence (证据)

每次演练的真实输出都被记录在 `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` 的 DR Test Evidence 部分（非假设），再加上第一次演练 3 运行的完整发现和手动恢复日志位于 `docs/evidence/DR_DRILL_3_FINDINGS.md` (原始输出：`docs/evidence/dr-drill-3-raw-output.log`)。被 git 忽略的 `scripts/dr-test-reports/` 目录存放了每次运行背后的原始备份/恢复日志。
