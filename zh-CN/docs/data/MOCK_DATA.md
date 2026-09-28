<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 钻孔与 VCP 合成数据

钻孔和 VCP 仪表板读取 `eap_backup` 数据库。在工厂服务器上，该数据库是从备份还原的工厂数据，不在 git 中。本页说明如何用生成的数据构建一个替代用的 `eap_backup`，使钻孔文件夹、VCP 文件夹、VCP 告警规则和迁移 084–086 在没有工厂数据的情况下完整运行。

## 组成

| 部分 | 路径 | 作用 |
| --- | --- | --- |
| Schema | `database/mock/eap_backup-schema.sql` | 创建仪表板、告警规则和迁移 084–086 所读取的表和视图。 |
| 生成器 | `scripts/mock/eap-mock-data.js` | 写入生成的钻孔事件和 VCP 产线数据。 |
| 校验器 | `scripts/mock/verify-mock-dashboards.js` | 执行钻孔和 VCP 每个面板的查询以及每条 VCP 告警查询，并报告每个面板的行数。 |
| 单元测试 | `tests/unit/eap-mock-data.test.js` | 在没有数据库的情况下检查生成器，在 pre-commit 和 CI 中运行。 |

所有数值均为虚构，包括机台数量、设定值、配方、板件尺寸、批次号和告警文本，没有一项来自工厂实测。

生成器只保留仪表板解析时依赖的格式：
- 事件代码和消息格式；
- `-VCP` 设备编号格式；
- 源端互换的槽位标签（`preset_<bath>` 是读数，`actual_<bath>` 是设定值）；
- `plating_time × line_speed = 54`；
- 成对出现的 Triggered/Reset 告警。

## 安全措施

- 如果数据库中已有 `machine_event` 或 `vcp_upp`，却没有 `public.mock_dataset` 标记表，schema 文件会拒绝执行，因此不会在还原后的工厂数据库上运行。
- `--apply` 在单个事务中执行，并在写入第一行之前检查标记表。
- 所有生成的行的编号都以 `MOCK-` 开头，`--undo --apply` 只删除这些行。

## 在没有数据的栈上运行

适用于 `eap_backup` 尚不存在的情况，例如全新安装后。在仓库根目录的 Git Bash 中执行：

```bash
docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE eap_backup"'
docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d eap_backup -v ON_ERROR_STOP=1' < database/mock/eap_backup-schema.sql
for m in 084 085 086; do                                 # 见下方说明
  docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < database/migrations/$m-*.sql
done
node scripts/mock/eap-mock-data.js --hours=168 --apply   # 一周的数据
```

请按上面的方式手动执行 084–086，重新运行 `db-migrate` 不会执行它们。在没有 `eap_backup` 的安装上，迁移运行器已经执行过这三个文件：每个文件都跳过了自身的工作，但仍在 `public.schema_migrations` 中被记为已执行。三个文件都可以安全地重复执行，因为只使用 `CREATE OR REPLACE`、`IF NOT EXISTS` 和 `COMMENT`。

生成器只写入一次，不会持续追加数据，因此“最近 15 分钟”类面板过一段时间后会变空。需要新数据时请再运行一次：每次运行会增加一个新的时间窗口，旧窗口可用 `--undo --apply` 清除。

## 在临时容器中运行

此验证不依赖任何栈，也不开放任何端口：

```bash
docker run -d --name ims-mock-verify -e POSTGRES_PASSWORD=mockonly -e POSTGRES_DB=ims timescale/timescaledb:2.29.2-pg16
docker exec ims-mock-verify psql -U postgres -d ims -c "CREATE DATABASE eap_backup"
docker exec -i ims-mock-verify psql -U postgres -d eap_backup -v ON_ERROR_STOP=1 < database/mock/eap_backup-schema.sql
for m in 084 085 086; do docker exec -i ims-mock-verify psql -U postgres -d ims -v ON_ERROR_STOP=1 < database/migrations/$m-*.sql; done
node scripts/mock/eap-mock-data.js --hours=168 --apply --container=ims-mock-verify --psql-user=postgres
node scripts/mock/verify-mock-dashboards.js --container=ims-mock-verify --psql-user=postgres
docker rm -f ims-mock-verify
```

校验器必须指定 `--container`，因此默认不会连接生产栈。

## 选项

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `--hours=N` | 24 | 以当前时刻为终点的时间窗口长度。 |
| `--seed=N` | 20260928 | 相同的 seed 和结束时间生成相同的行。 |
| `--drilling=N` | 12 | 钻孔机数量（3–200）。 |
| `--incidents` | 关闭 | 最后 35 分钟内让每条 VCP 告警规则各触发一次。 |
| `--apply` | 关闭 | 写入数据库；不加时 SQL 写入文件。 |
| `--undo` | 关闭 | 与 `--apply` 一起使用，删除所有 `MOCK-` 行。 |
| `--container`、`--database`、`--psql-user` | `ims-timescaledb`、`eap_backup`、从 `.env` 读取 | 数据写入的位置。 |

## 数据内容

**钻孔：**
- 每台机器按作业（job）运行，依次包括程序启动、rpm/feed 调整、主轴掩码、循环启动、换刀、带恢复时间的告警、带孔数的作业结束，以及曼谷时间 08:00 和 20:00 的班次报告。
- 告警覆盖异常分析看板上的所有类别。
- 最后一台机器在结束前 3 小时停止上报，显示为 COMM LOSS。
- 它前面的一台机器在结束前 75 分钟、循环进行中停止上报，显示为 STALE RUN。

**VCP：**
- 共三条产线，每条产线每分钟一行，状态在 RUN、IDLE、DOWN 之间切换。
- 只有产线电镀时各工位才有电流。
- 槽温跟随设定值，产线停机时降温。
- 告警随机出现，每条告警在一段时间后复位（Reset）。

**告警规则：**
- **不加 `--incidents`：** 工厂处于正常状态，七条 VCP 规则都不返回任何行。这些规则列出的是违规项，因此不返回行即为正常。
- **加 `--incidents` 时，最后 35 分钟内：**
  - VCP01 停止发送数据。
  - VCP02 在电镀时有一个工位的一侧电流比设定值高 8 A，且 `preset_amp_1a` 为零；9 号泵读数为 0，两个 QC 标志不一致。
  - VCP03 的 copperplating2 槽比设定值高 6 °C，hotwater 槽比设定值高 12 °C。
- 如果某个栈配置了真实的告警通知渠道，在该栈上加载 incidents 会发出真实通知。

## 验证结果

以下结果于 2026-09-28 在临时容器中基于 TimescaleDB 2.29.2-pg16 得出：
- schema 以及迁移 084、085、086 均无错误完成；在 `eap_backup` 存在之前，084 输出了跳过提示。
- 168 小时正常数据：执行 41 条查询，0 个错误；全部 34 个面板查询都返回了数据，7 条告警查询没有返回行。
- 使用 `--incidents`：执行 41 条查询，0 个错误，每条查询都返回了行，包括全部 7 条告警规则。
- 两种模式下用 seed 1 至 6 重复测试，结果相同。

## 限制

- 列类型是根据仪表板和迁移对各列的用法重建的，并非从工厂服务器导出。
- schema 没有创建工厂数据库中的派生视图和 `plc_mqtt` schema，因此在模拟数据库上 `catalog.object_registry` 有 12 行显示 `physical_missing = true`。
