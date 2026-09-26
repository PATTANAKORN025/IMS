<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 真实数据导入

本仓库只跟踪数据库结构、视图、函数与仪表板。真实的 LDI 生产数据（遥测、告警历史以及一份补充的告警代码导出）从不提交——它们只保存在本地的 `data/real/`（已被 gitignore 忽略）中，并由 `scripts/import-real-data.sh` 载入运行中的数据库。

CI 与全新的本地开发环境永远看不到真实数据：默认情况下，Node-RED 模拟器生成合成的 `ldi_data`/`ldi_alarm_log` 行（除非另行覆盖，否则 `LDI_SIMULATOR_ENABLED=true`），`docker-compose.yaml` 则通过已跟踪的迁移写入一小套模拟告警代码。真实设备标识（例如 `LDI-B01` 这类设备名）**确实**被跟踪在迁移 040 中——它们属于设备参考元数据，而非业务数据。迁移 040 还登记了模拟器写入的 10 台合成设备 `LDI-01`..`LDI-10`，因此无论启用哪种数据模式，每次部署都同时存在这两组设备（迁移 055 的外键约束要求如此）。

## 在模拟数据与真实数据之间切换

`scripts/switch-data-mode.sh` 是在本机切换模式的唯一命令。它从不触碰 `data/real/`（真实数据始终只保存在本地，并可由这些文件重现）：

```bash
bash scripts/switch-data-mode.sh mock # default for development
bash scripts/switch-data-mode.sh real # requires data/real/*_clean.sql locally
bash scripts/switch-data-mode.sh status # row counts + current LDI_SIMULATOR_ENABLED
```

`mock` 会清空 `ldi_data`/`ldi_alarm_log`，将 `ldi_alarm_ms_code` 重置为 19 个代码的模拟目录（迁移 036——恰好是 `nodered_data/flows.json` 中 `almsim_gen` 可能发出的代码，由 `tests/lint/alarm-sync-linter.js` 保持同步），并重新开启模拟器。`real` 会关闭模拟器，恢复完整的 1,820 行厂商目录（迁移 061），并重新运行 `scripts/import-real-data.sh`。两个方向都会重建 `node-red` 容器，使 `LDI_SIMULATOR_ENABLED` 环境变量的变更真正生效（Node-RED 只在部署 flow 时读取一次）。

需要按设备显示面板的仪表板使用 `machine_id` 模板变量（`SELECT DISTINCT eqp_id FROM ldi_data ...`）配合 Grafana 的 `repeat` 面板功能，而不是为每个设备名硬编码一个面板——正因如此，Andon 看板的逐设备卡片在两种模式下都无需修改即可工作。迁移 036 的模拟目录曾在一次无关的代码替换后与模拟器实际发出的代码脱节（19 个中有 10 个无法解析）——若今后修改 `almsim_gen` 可发出的代码，请在模拟模式下重新运行 `node tests/lint/alarm-sync-linter.js`，以发现同类的过期问题。

## 源文件

将以下 3 个文件（pgAdmin "Copy with SQL INSERT statements" 导出）放入 `data/real/`：

- `ldi_data_clean.sql`——真实遥测（参考导出中为 10,000 行）
- `ldi_alarm_log_clean.sql`——真实告警历史（10,000 行）
- `ldi_alarm_ms_code_clean.sql`——从运行中数据库补充导出的告警代码（892 行；比迁移 061 中已有的 1,820 行厂商目录更小也更权威，因为它反映的是工厂实际出现过的代码，而不只是完整的厂商列表）

如果导出仍是 pgAdmin 原始的、以 CSV 包裹的 INSERT 格式（只有一个 `insert_sql` 列，每行都是一条完整的多行 SQL 语句），请先解包：

```bash
python3 scripts/unwrap-pgadmin-export.py <input.csv> data/real/<name>_clean.sql
```

## 运行导入

```bash
bash scripts/import-real-data.sh
```

该脚本可重复执行且安全。它依次：

1. 登记仅出现在真实告警日志、从未出现在遥测导出中的 3 个设备 ID（`LDI-B05`、`LDI-B06`、`LDI-B07`）——全新部署时迁移 040 已涵盖这些 ID，此处再次确认，以防导入针对的是早于该迁移的数据库。
2. 解压 `ldi_data` 分块（压缩分块会拒绝插入），在 `ldi_data`/`ldi_alarm_log` 非空时将其清空，然后载入真实数据行。
3. 通过 `UPSERT` 将 892 行告警代码导出合并到 `ldi_alarm_ms_code`，并使用迁移 061 中记录的同一规则计算 `severity`（基于关键字/AlarmType 的 Critical/Major/Minor/Warning 分类），确保两个来源得到一致处理。
4. 刷新全部 4 个连续聚合，重新压缩超过 7 天的分块，并运行 `ANALYZE`。

针对真实数据运行之前，请先停止模拟器，以免它不断覆盖真实数据行：在（已被 gitignore 忽略的）`.env` 中设置 `LDI_SIMULATOR_ENABLED=false`，并重建 `node-red` 容器。

## 已知限制：参考导出的时间窗口不重叠

用于构建和测试该流水线的这两份 10,000 行 `ldi_data` 与 `ldi_alarm_log` 导出，是两份相互独立的快照，而非配对数据：`ldi_data` 只覆盖 2026-07-19 21:23–02:53（约 5.5 小时），而 `ldi_alarm_log` 覆盖 2026-04-10–2026-07-16——其最新的告警完全早于遥测窗口。对于这种形态的数据，RCA 告警→遥测关联（`v_ldi_alarm_context.match_type`）在每一行上都会合理地为 `NULL`；这是数据本身的特点，而不是关联查询的缺陷。时间窗口真正重叠的生产导入会正常关联。Cpk/SPC 以及告警严重级别/分类报告不依赖这一关联，不受影响。

## 审计

- `scripts/import-real-data.sh` 是写入真实数据的唯一路径——从头到尾阅读即可确切了解会执行什么。
- 迁移 061（已提交）以文本形式内嵌了 1,820 行厂商告警目录——这是早于"数据不入 git"策略、已被接受的低敏感度历史例外。此后没有任何内容重复这种做法。
- `git log -- data/real/` 与 `git check-ignore -v data/real/anything` 可以确认该目录从未被提交，也不会被意外提交。
