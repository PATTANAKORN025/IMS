<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 数据库备份、恢复与有效性验证流程</h1>
  <p><b>仓库目前实际提供的功能、如何验证恢复结果，以及备份离开本机前需要补充的措施</b></p>
  <p>
    <a href="../../../docs/operations/BACKUP_RESTORE.md">English</a> |
    <a href="../../../th/docs/operations/BACKUP_RESTORE.md">ไทย</a> |
    <a href="BACKUP_RESTORE.md">简体中文</a>
  </p>
</div>

---

> **读者：** SRE / 运维工程师、数据库工程师
> **范围：** `ims-timescaledb` 中的 `ims` 数据库。独立的 `eap_backup` 数据库是还原的工厂数据副本，不在这些脚本的覆盖范围内。
> **恢复目标：** RTO 低于 15 分钟、RPO 低于 1 小时只是**目标**，并非实测保证。使用仓库自带的 `pg_dump`（每日或手动执行）时，实际 RPO 等于距上次备份的时间。

---

## 1. 目前提供的功能

| 命令 | 脚本 | 作用 |
| --- | --- | --- |
| `make backup` | `scripts/backup-db.sh`（Windows：`scripts/backup-db.ps1`） | 在容器内执行 `pg_dump -Z 6`，再用 `docker cp` 复制到 `./backups/ims_backup_<timestamp>.sql.gz`；删除 `./backups` 中超过 30 天的转储。 |
| `make restore FILE=<path>` | `scripts/restore-db.sh` | 先要求确认，然后把解压后的转储通过 `psql` 导入**正在使用的** `ims` 数据库。 |
| `./scripts/dr-test.sh backup-restore` | `scripts/dr-test.sh` | 备份 `ims`，恢复到一次性数据库 `ims_dr_test` 并进行比对，从不触及生产数据库。 |
| `./scripts/dr-verify-restore.sh …` | `scripts/dr-verify-restore.sh` | 比对两个数据库的表、列、索引、约束、触发器、扩展、连续聚合和策略，并检查行数区间；有任何差异时以非零状态退出。 |
| `node scripts/production-assurance.js --profile=dr` | `scripts/production-assurance.js` | 运行 DR 演练，并把结果写成一个 JSON 文件到 `docs/evidence/runtime/`。 |

**尚未提供：** 备份**未加密**、**未复制到本机以外**，也**没有 WAL 归档或时间点恢复 (PITR)**。`./backups/` 已列入 `.gitignore`；能读取本机文件的人都能读取转储文件。需要补充的措施见第 4 节。

---

## 2. 执行备份

```bash
make backup                       # 或：bash scripts/backup-db.sh
ls -lh backups/                   # ims_backup_YYYYmmdd_HHMMSS.sql.gz
```

`backup-db.sh`、`backup-db.ps1` 和 `restore-db.sh` 从 `.env` 读取 `POSTGRES_USER` 和 `POSTGRES_DB`（缺省为 `ims_admin` 和 `ims`）。转储在容器内写入并通过 `docker cp` 复制出来，不经过可能改变编码的主机管道。

---

## 3. 恢复并证明恢复正确

### 3.1 先演练（安全）

```bash
./scripts/dr-test.sh backup-restore
```

演练会恢复到 `ims_dr_test`，然后运行 `dr-verify-restore.sh`。仅靠行数无法证明恢复正确：TimescaleDB 恢复后，约束、索引或连续聚合可能丢失，而行数仍然一致。因此校验器会比对系统目录。

转储期间生产数据库仍在写入数据，因此行数不要求完全相等。对于持续写入的超表，恢复后的行数必须落在转储前后两次计数之间：

$$\text{Count}_{\text{before}} \le \text{Count}_{\text{restored}} \le \text{Count}_{\text{after}}$$

### 3.2 覆盖生产数据库（破坏性操作）

```bash
make restore FILE=backups/ims_backup_YYYYmmdd_HHMMSS.sql.gz
```

该命令会覆盖 `ims`。请先停止写入方（`node-red`、`alarm-api`），确保恢复期间没有写入；恢复后重新启动它们，并用 `make verify` 检查。

---

## 4. 备份离开本机之前（建议措施，尚未提供）

以下每一项都需要先实施并测试，才能依赖它；目前均不在系统中。

1. **加密转储文件**，密钥不要与文件存放在一起，例如：

   ```bash
   docker compose exec -T timescaledb pg_dump -U ims_admin ims \
     | gzip -9 \
     | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
     > "backups/ims_backup_$(date -u +%Y%m%dT%H%M%SZ).sql.gz.enc"
   ```

   不要把 `BACKUP_ENCRYPTION_KEY` 放进 `.env` 或 git，并在测试恢复的同一次演练中用 `openssl enc -d …` 测试解密。
2. **复制到本机以外**，存到本机凭据无法删除的存储中，每个文件旁保留校验和 (`sha256sum`)。
3. **定时执行。** 仓库中没有任何机制定时运行 `make backup`；请在主机上使用 cron 或 systemd timer，并在最新备份早于 RPO 目标时发出告警。
4. **时间点恢复 (PITR)**，仅在一小时的 RPO 目标不够时才需要。需要在 `docker-compose.yaml` 的 TimescaleDB 命令行中加入 `wal_level=replica`、`archive_mode=on` 和 `archive_command`，还需要基础备份 (`pg_basebackup`) 和归档存储。目前尚未配置。

---

## 5. 相关文档

- `docs/operations/DR_TEST_PLAN.md`：演练计划与通过标准。
- `docs/operations-runbook.md`：与恢复相关的日常运维操作。

---

[⬅️ 返回运维手册](../operations-runbook.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码仓库](../../README.md)
