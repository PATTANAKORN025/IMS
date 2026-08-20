<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../docs/README.md"><img src="../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 真实数据导入 (Real-data import)

本仓库仅跟踪模式 (Schema)、视图 (Views)、函数 (Functions) 和仪表板。真正的 LDI 生产数据（遥测、告警历史以及补充的告警代码导出数据）永远不会被提交——它们只存在于本地的 `data/real/` 目录中（已被 git 忽略），并由 `scripts/import-real-data.sh` 脚本加载到实时数据库中。

CI 和全新的本地开发环境永远不会看到真实数据：默认情况下，Node-RED 模拟器会生成合成的 `ldi_data`/`ldi_alarm_log` 行（除非被覆盖，否则 `LDI_SIMULATOR_ENABLED=true`），并且 `docker-compose.yaml` 会通过已跟踪的迁移脚本播种一组小型的模拟告警代码。真实的设备标识符（例如 `LDI002-LD1` 这样的机器名称）确实被记录在迁移 040 中——这些是设备参考元数据，而非业务数据。迁移 040 还注册了模拟器写入的 10 个合成的 `LDI-01`..`LDI-10` 设备，因此，无论激活哪种数据模式，这两套设备集都存在于每次部署中（这是迁移 055 的外键约束所要求的）。

## 在模拟数据和真实数据之间切换

`scripts/switch-data-mode.sh` 是本地机器在两种模式间切换的唯一命令。它从不触及 `data/real/` 目录（真实数据始终仅限于本地，并且可由这些文件重现）：

```bash
bash scripts/switch-data-mode.sh mock # 开发环境默认
bash scripts/switch-data-mode.sh real # 需要本地有 data/real/*_clean.sql 文件
bash scripts/switch-data-mode.sh status # 返回行数 + 当前 LDI_SIMULATOR_ENABLED 状态
```

`mock` 模式会清空 (`truncate`) `ldi_data`/`ldi_alarm_log` 表，将 `ldi_alarm_ms_code` 重置为包含 19 个代码的模拟目录（迁移 036——即 `nodered_data/flows.json` 中的 `almsim_gen` 可生成的完整代码，并由 `tests/lint/alarm-sync-linter.js` 保持同步），并重新开启模拟器。
`real` 模式则关闭模拟器，恢复全部包含 1,820 行的供应商目录（迁移 061），并重新运行 `scripts/import-real-data.sh`。这两种方式都会重新创建 `node-red` 容器，以使环境变量 `LDI_SIMULATOR_ENABLED` 的改变真正生效（Node-RED 仅在流程部署时读取一次此变量）。

需要为每台机器配备一个面板的仪表板使用了 `machine_id` 模板变量（`SELECT DISTINCT eqp_id FROM ldi_data ...`），配合 Grafana 的面板 `repeat`（重复）功能，而不是为每个设备名称硬编码一个面板——这就是使得安灯 (Andon) 看板的单机瓷砖能够在任何模式下无需修改即可运行的原因。迁移 036 的模拟目录曾在一次不相关的代码替换后，与模拟器的实际代码失去同步（19 个代码中有 10 个无法解析）——如果您更改了 `almsim_gen` 可触发的代码，请针对 mock 模式重新运行 `node tests/lint/alarm-sync-linter.js`，以捕获同类过时问题。

## 源文件

将以下 3 个文件（从 pgAdmin 使用“复制带有 SQL INSERT 语句”导出的文件）放置在 `data/real/` 目录中：

- `ldi_data_clean.sql` — 真实遥测数据（参考导出文件中包含 10,000 行）
- `ldi_alarm_log_clean.sql` — 真实告警历史（10,000 行）
- `ldi_alarm_ms_code_clean.sql` — 补充的实时数据库告警代码导出
  （892 行；比迁移 061 中现有的 1,820 行供应商目录更小且更具权威性，因为它反映了工厂实际遇到的代码，而不仅仅是完整的供应商列表）

如果您的导出文件仍处于 pgAdmin 的原始 CSV 包装的 INSERT 格式（只有一列 `insert_sql`，每行是一个完整的多行 SQL 语句），请先对其进行解包 (unwrap)：

```bash
python3 scripts/unwrap-pgadmin-export.py <input.csv> data/real/<name>_clean.sql
```

## 运行导入

```bash
bash scripts/import-real-data.sh
```

此操作是幂等的 (idempotent)，可安全地重复运行。它依次执行以下步骤：

1. 注册仅在真实告警日志中出现，而从未在遥测导出中出现的 3 个设备 ID（`LDI001-LD1`、`LDI001-LD2`、`LDI_01`）——对于全新部署，迁移 040 已经涵盖了这些，但在这里再次确认，以防导入操作针对的是早于该迁移的数据库。
2. 解压缩 `ldi_data` 的数据块（压缩的数据块会拒绝插入操作），如果 `ldi_data`/`ldi_alarm_log` 非空则将其清空 (`truncate`)，随后加载真实数据行。
3. 通过 `UPSERT` 将 892 行的告警代码导出合并到 `ldi_alarm_ms_code` 中，使用与迁移 061 中记录的完全相同的规则计算严重性 (`severity`)（基于关键字/AlarmType 进行 Critical/Major/Minor/Warning 分类），从而保证两处来源得到一致处理。
4. 刷新所有 4 个连续聚合 (continuous aggregates)，重新压缩超过 7 天的数据块，并运行 `ANALYZE`。

在导入真实数据前，请停止模拟器以防它不断覆盖真实数据：在（被 git 忽略的）`.env` 文件中设置 `LDI_SIMULATOR_ENABLED=false` 并重新创建 `node-red` 容器。

## 已知限制：参考导出数据的时间窗口不重叠

用于构建和测试此管道的特定的 10,000 行 `ldi_data` 和 `ldi_alarm_log` 导出数据，是两个独立的快照，并非一对匹配的数据：`ldi_data` 仅涵盖 2026-07-19 21:23–02:53（约 5.5 小时），而 `ldi_alarm_log` 涵盖 2026-04-10–2026-07-16——其最晚的告警也完全早于遥测时间窗口。根本原因分析 (RCA) 告警→遥测链接 (`v_ldi_alarm_context.match_type`) 将合理地对具有这种数据形态的每一行返回 `NULL`；这是数据本身的问题，而不是链接查询中的漏洞。具备真正重叠窗口的生产导入将能正常链接。Cpk/SPC 和告警严重性/分类报告不依赖此链接，因此不受影响。

## 审计 (Auditing)

- `scripts/import-real-data.sh` 是写入真实数据的唯一途径——请从上至下阅读以了解其实际运行内容。
- 迁移 061（已提交）以文本形式嵌入了包含 1,820 行的供应商告警目录——这是一个早于此“非 git 策略”的被接受的、低敏感性历史特例。之后不会重复这种模式。
- `git log -- data/real/` 和 `git check-ignore -v data/real/anything` 确认了该目录从未且不可能被意外提交。
